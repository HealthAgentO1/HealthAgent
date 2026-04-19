"""
NPPES NPI Registry + US Census geocoding for Symptom Check: find nearby organizational
providers (NPI-2) by ZIP plus NUCC taxonomy code, then rank by distance from the user.

Why an "Urgent Care" search (261QU0200X) can still surface eye-care–like rows in raw NPPES:
records may list multiple taxonomies; CMS matches if *any* line matches the search code, while
the registrant's *primary* taxonomy may still be Eye/Vision (261QE*). We drop rows whose
primary taxonomy is a narrow unrelated specialty and prefer the matching taxonomy for display.

Public API docs: https://npiregistry.cms.hhs.gov/api-page
Geocoding: https://geocoding.geo.census.gov/geocoder/locations/onelineaddress
"""

from __future__ import annotations

import json
import logging
import math
import re
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

from .nppes_relevance import combined_rank_score, relevance_score_from_nppes_row
from .taxonomy_routing import resolve_nppes_taxonomy_codes

logger = logging.getLogger(__name__)

NPPES_API_URL = "https://npiregistry.cms.hhs.gov/api/"
CENSUS_GEOCODE_URL = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress"

# Earth radius in miles; approximate great-circle distance
_EARTH_RADIUS_MI = 3958.7613

# Avoid excessive upstream calls and timeouts; NPPES returns arbitrary order within ZIP.
_MAX_NPPES_RESULTS_TO_GEOCODE = 48
_MAX_NPPES_SKIP = 1000
_NPPES_PAGE_LIMIT = 200

# NUCC 261QE* = Clinic/Center, Eye and Vision — may still list Urgent Care as a secondary
# taxonomy on the same NPI, so NPPES returns the row for a 261QU search. We skip when the
# *primary* taxonomy is clearly a narrow specialty unrelated to general triage.
_EXCLUDED_PRIMARY_CODE_PREFIXES: tuple[str, ...] = ("261QE",)


def _haversine_miles(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in miles between two WGS84 points."""
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(max(0.0, 1.0 - a)))
    return _EARTH_RADIUS_MI * c


def _http_get_json(url: str, timeout: float = 20.0) -> Any:
    req = urllib.request.Request(url, headers={"User-Agent": "HealthOS/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read().decode("utf-8", errors="replace")
    return json.loads(raw)


def geocode_oneline_address(address: str) -> tuple[float, float] | None:
    """
    Return (latitude, longitude) for a US address line, or None if Census cannot match.
    """
    line = " ".join(address.split())
    if not line:
        return None
    params = urllib.parse.urlencode(
        {
            "address": line,
            "benchmark": "2020",
            "format": "json",
        }
    )
    url = f"{CENSUS_GEOCODE_URL}?{params}"
    try:
        data = _http_get_json(url, timeout=15.0)
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
        logger.warning("Census geocode request failed: %s", e)
        return None

    try:
        matches = data["result"]["addressMatches"]
    except (KeyError, TypeError):
        return None
    if not matches:
        return None
    first = matches[0]
    coords = first.get("coordinates") or {}
    if not isinstance(coords, dict):
        return None
    if "x" not in coords or "y" not in coords:
        return None
    lon = float(coords["x"])
    lat = float(coords["y"])
    if not math.isfinite(lat) or not math.isfinite(lon):
        return None
    return lat, lon


def _nppes_search_page(
    postal_code: str,
    state: str,
    taxonomy_code: str,
    skip: int,
) -> dict[str, Any]:
    params = {
        "version": "2.1",
        "postal_code": postal_code,
        "state": state,
        "enumeration_type": "NPI-2",
        "taxonomy_code": taxonomy_code,
        "address_purpose": "LOCATION",
        "limit": str(_NPPES_PAGE_LIMIT),
        "skip": str(skip),
    }
    qs = urllib.parse.urlencode(params)
    url = f"{NPPES_API_URL}?{qs}"
    return _http_get_json(url, timeout=25.0)


def _collect_nppes_results(
    postal_code: str,
    state: str,
    taxonomy_code: str,
    max_results: int,
) -> list[dict[str, Any]]:
    """Walk NPPES pages until max_results or API cap."""
    collected: list[dict[str, Any]] = []
    skip = 0
    while skip < _MAX_NPPES_SKIP and len(collected) < max_results:
        data = _nppes_search_page(postal_code, state, taxonomy_code, skip)
        if not isinstance(data, dict):
            raise ValueError("NPPES response is not a JSON object.")
        results = data.get("results")
        if not isinstance(results, list):
            raise ValueError("NPPES response missing results array.")
        if not results:
            break
        for row in results:
            if isinstance(row, dict):
                collected.append(row)
            if len(collected) >= max_results:
                break
        if len(results) < _NPPES_PAGE_LIMIT:
            break
        skip += _NPPES_PAGE_LIMIT
    return collected


def _pick_location_address(result: dict[str, Any]) -> dict[str, Any] | None:
    addrs = result.get("addresses")
    if not isinstance(addrs, list):
        return None
    for a in addrs:
        if isinstance(a, dict) and a.get("address_purpose") == "LOCATION":
            return a
    for a in addrs:
        if isinstance(a, dict):
            return a
    return None


def _format_provider_address(loc: dict[str, Any]) -> str:
    line1 = (loc.get("address_1") or "").strip()
    line2 = (loc.get("address_2") or "").strip()
    city = (loc.get("city") or "").strip()
    st = (loc.get("state") or "").strip()
    z = (loc.get("postal_code") or "").strip()
    zip5 = z[:5] if len(z) >= 5 else z
    parts = [p for p in (line1, line2) if p]
    if city or st or zip5:
        parts.append(", ".join([x for x in (city, f"{st} {zip5}".strip()) if x]))
    return ", ".join(parts)


def _facility_label(result: dict[str, Any]) -> str:
    basic = result.get("basic")
    if isinstance(basic, dict):
        name = (basic.get("organization_name") or "").strip()
        if name:
            return name
    return "Provider"


def _primary_taxonomy(result: dict[str, Any]) -> tuple[str | None, str | None]:
    tax = result.get("taxonomies")
    if not isinstance(tax, list):
        return None, None
    for t in tax:
        if not isinstance(t, dict):
            continue
        if t.get("primary") is True:
            code = t.get("code")
            desc = t.get("desc")
            c = str(code).strip() if code is not None else None
            d = str(desc).strip() if desc is not None else None
            return c, d
    if tax and isinstance(tax[0], dict):
        t0 = tax[0]
        code = t0.get("code")
        desc = t0.get("desc")
        c = str(code).strip() if code is not None else None
        d = str(desc).strip() if desc is not None else None
        return c, d
    return None, None


def _taxonomy_entry_matching_code(
    result: dict[str, Any], wanted: str | None
) -> tuple[str | None, str | None]:
    """Return the taxonomy row whose code equals the NPPES search code (best for display)."""
    if not wanted or not str(wanted).strip():
        return None, None
    want = str(wanted).strip().upper()
    tax = result.get("taxonomies")
    if not isinstance(tax, list):
        return None, None
    for t in tax:
        if not isinstance(t, dict):
            continue
        c = t.get("code")
        if c is not None and str(c).strip().upper() == want:
            d = t.get("desc")
            return (
                str(c).strip(),
                str(d).strip() if d is not None else None,
            )
    return None, None


def _should_skip_mismatched_primary_specialty(
    result: dict[str, Any],
    search_taxonomy: str | None,
) -> bool:
    """
    Exclude NPIs whose *primary* taxonomy is a narrow clinic type (e.g. eye/vision) even
    though NPPES matched our search on another taxonomy line on the same record.
    """
    if not search_taxonomy:
        return False
    su = str(search_taxonomy).strip().upper()
    # Only filter when we searched broad triage facility types.
    if not su.startswith(("282N", "261QU", "261QP", "261QA", "261QC", "261QR")):
        return False
    pcode, pdesc = _primary_taxonomy(result)
    pl = (pcode or "").strip().upper()
    blob = f"{pcode or ''} {pdesc or ''}".lower()
    for prefix in _EXCLUDED_PRIMARY_CODE_PREFIXES:
        if pl.startswith(prefix):
            return True
    for needle in (
        "eye and vision",
        "optometr",
        "ophthalm",
        "dental",
        "orthodont",
        "oral surgery",
        "hearing aid",
    ):
        if needle in blob:
            return True
    return False


def _zip5_from_address_line(address_line: str) -> str:
    m = re.search(r"\b(\d{5})(?:-\d{4})?\b", address_line)
    return m.group(1) if m else ""


def _facility_location_dedupe_key(address_line: str) -> str:
    """
    Collapse same physical site with different suite formatting / punctuation.
    """
    s = " ".join(address_line.upper().split())
    zip5 = _zip5_from_address_line(s)
    street_part = s.split(",")[0] if "," in s else s
    street_part = re.sub(
        r"\s+(STE|SUITE|UNIT|#|APT|BLDG|FL|FLOOR)\s*[\w.-]+$",
        "",
        street_part,
        flags=re.IGNORECASE,
    )
    street_part = re.sub(r"[^\w\s]", "", street_part)
    street_part = " ".join(street_part.split())
    return f"{street_part}|{zip5}"


def _dedupe_facilities_by_location(facilities: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Remove duplicate rows that point at the same physical location (common when multiple NPIs
    or slightly different suite strings refer to one site). We intentionally do **not** dedupe
    by org name + ZIP alone — large systems have many sites per ZIP.
    """
    seen_loc: set[str] = set()
    out: list[dict[str, Any]] = []
    for f in facilities:
        addr = str(f.get("address_line") or "")
        loc_key = _facility_location_dedupe_key(addr)
        if loc_key in seen_loc:
            continue
        seen_loc.add(loc_key)
        out.append(f)
    return out


def _distance_label(miles: float) -> str:
    if miles < 10:
        return f"{miles:.1f} mi"
    return f"{int(round(miles))} mi"


def find_nearby_facilities(
    *,
    street: str,
    city: str,
    state: str,
    postal_code: str,
    taxonomy_codes: list[str],
    suggested_care_setting: str | None = None,
) -> dict[str, Any]:
    """
    Geocode the user, query NPPES for organization providers in the ZIP, geocode each
    candidate practice location, score heuristic relevance (NPPES has no reviews), then sort by
    combined relevance vs distance, dedupe by location, return normalized rows.

    Raises ValueError for user-facing validation failures (bad address, NPPES shape).
    """
    user_line = f"{street}, {city}, {state} {postal_code}".strip()
    user_coords = geocode_oneline_address(user_line)
    if user_coords is None:
        raise ValueError(
            "We could not locate that address. Please check street, city, state, and ZIP."
        )

    user_lat, user_lon = user_coords

    # Filter LLM codes to facility allowlist and order by triage setting (see taxonomy_routing).
    codes = resolve_nppes_taxonomy_codes(suggested_care_setting, taxonomy_codes)

    nppes_rows: list[dict[str, Any]] = []
    taxonomy_used: str | None = None
    last_error: str | None = None

    for code in codes:
        try:
            batch = _collect_nppes_results(
                postal_code,
                state,
                code,
                max_results=_MAX_NPPES_RESULTS_TO_GEOCODE,
            )
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
            logger.exception("NPPES request failed: %s", e)
            last_error = "The provider directory was unavailable. Please try again."
            continue
        except ValueError as e:
            last_error = str(e)
            continue

        if batch:
            nppes_rows = batch
            taxonomy_used = code
            break

    if not nppes_rows:
        if last_error:
            raise ValueError(last_error)
        raise ValueError(
            "No providers found for this ZIP and specialty. Try a nearby ZIP or different area."
        )

    # De-dupe by NPI, keep first occurrence
    seen_npis: set[str] = set()
    unique_rows: list[dict[str, Any]] = []
    for row in nppes_rows:
        npi = row.get("number")
        if not isinstance(npi, str) or not npi.isdigit():
            continue
        if npi in seen_npis:
            continue
        seen_npis.add(npi)
        unique_rows.append(row)

    def work(row: dict[str, Any]) -> dict[str, Any] | None:
        # NPPES can return the same NPI when a secondary taxonomy matches the search code while
        # primary is still "Eye and Vision" etc.; skip those for general triage searches.
        if _should_skip_mismatched_primary_specialty(row, taxonomy_used):
            return None
        loc = _pick_location_address(row)
        if loc is None:
            return None
        geo_line = _format_provider_address(loc)
        if not geo_line.strip():
            return None
        coords = geocode_oneline_address(geo_line)
        if coords is None:
            return None
        plat, plon = coords
        miles = _haversine_miles(user_lat, user_lon, plat, plon)
        npi = row.get("number")
        if not isinstance(npi, str):
            return None
        # Prefer the taxonomy row that matches our NPPES query so the card matches the search.
        tcode, tdesc = _taxonomy_entry_matching_code(row, taxonomy_used)
        if not tcode:
            tcode, tdesc = _primary_taxonomy(row)
        label = _facility_label(row)
        rel = relevance_score_from_nppes_row(row, label, tdesc)
        return {
            "npi": npi,
            "name": label,
            "address_line": geo_line,
            "distance_miles": round(miles, 3),
            "distance_label": _distance_label(miles),
            "taxonomy_code": tcode,
            "taxonomy_description": tdesc,
            "relevance_score": round(rel, 2),
        }

    facilities: list[dict[str, Any]] = []
    with ThreadPoolExecutor(max_workers=8) as pool:
        futs = {pool.submit(work, r): r for r in unique_rows}
        for fut in as_completed(futs):
            try:
                out = fut.result()
            except Exception:
                logger.exception("Geocoding worker failed")
                continue
            if out is not None:
                facilities.append(out)

    facilities.sort(
        key=lambda x: combined_rank_score(
            float(x["relevance_score"]),
            float(x["distance_miles"]),
        ),
        reverse=True,
    )
    facilities = _dedupe_facilities_by_location(facilities)

    if not facilities:
        raise ValueError(
            "We found directory listings but could not resolve distances. Please try again."
        )

    return {
        "facilities": facilities,
        "taxonomy_used": taxonomy_used,
    }
