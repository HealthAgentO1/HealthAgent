"""
Extract NPIs from a single CMS Transparency in Coverage (TIC) in-network JSON file.

Uses streaming parse (ijson) so multi-gigabyte files do not need to load fully into memory.
Schema varies slightly by payer; we union NPIs from provider_references and in-network
negotiated rate provider references (including provider_group_id expansion).
"""

from __future__ import annotations

import gzip
import logging
from collections import defaultdict
from pathlib import Path
from typing import Any, BinaryIO

import ijson

logger = logging.getLogger(__name__)


def _open_mrf_binary(path: Path) -> BinaryIO:
    """Some payers ship `.json` files gzip-compressed (magic 0x1f8b) without a `.gz` suffix."""
    head = path.read_bytes()[:2]
    if head == b"\x1f\x8b":
        return gzip.open(path, "rb")
    return path.open("rb")


def _to_npi10(value: Any) -> str | None:
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, int):
        s = str(value)
    elif isinstance(value, str):
        s = value.strip()
    else:
        return None
    if not s.isdigit():
        return None
    if len(s) > 10:
        return None
    if len(s) < 10:
        s = s.zfill(10)
    return s


def _npis_from_npi_field(raw: Any) -> set[str]:
    out: set[str] = set()
    if raw is None:
        return out
    if isinstance(raw, list):
        for x in raw:
            n = _to_npi10(x)
            if n:
                out.add(n)
    else:
        n = _to_npi10(raw)
        if n:
            out.add(n)
    return out


def _npis_from_provider_ref_dict(pref: dict[str, Any]) -> set[str]:
    """
    CMS template uses top-level `npi` on each provider_reference object.
    Centene-style files nest NPIs under `provider_groups`.
    """
    out = _npis_from_npi_field(pref.get("npi"))
    pgs = pref.get("provider_groups")
    if isinstance(pgs, list):
        for g in pgs:
            if isinstance(g, dict):
                out.update(_npis_from_npi_field(g.get("npi")))
    return out


def _expand_provider_ref_value(
    pr: Any,
    group_map: dict[str, set[str]],
) -> set[str]:
    """Resolve a provider_references entry (dict, group id, or bare NPI list)."""
    out: set[str] = set()
    if isinstance(pr, (int, float)):
        out.update(group_map.get(str(int(pr)), ()))
        return out
    if isinstance(pr, str) and pr.strip().isdigit():
        out.update(group_map.get(pr.strip(), ()))
        return out
    if isinstance(pr, dict):
        out.update(_npis_from_provider_ref_dict(pr))
        gid = pr.get("provider_group_id")
        if gid is not None:
            out.update(group_map.get(str(gid), ()))
    return out


def extract_npis_from_tic_in_network_file(path: Path) -> set[str]:
    """
    Return the set of 10-digit NPI strings found in one TIC in-network JSON file.
    """
    group_map: dict[str, set[str]] = defaultdict(set)
    all_npis: set[str] = set()

    with _open_mrf_binary(path) as f:
        for pref in ijson.items(f, "provider_references.item", use_float=True):
            if not isinstance(pref, dict):
                continue
            gid = pref.get("provider_group_id")
            key = str(gid) if gid is not None else ""
            chunk = _npis_from_provider_ref_dict(pref)
            if key:
                group_map[key].update(chunk)
            all_npis.update(chunk)

    extra_paths = (
        "in_network.item.negotiated_rates.item.provider_references.item",
        "in_network.item.provider_references.item",
    )
    for json_path in extra_paths:
        with _open_mrf_binary(path) as f:
            for pr in ijson.items(f, json_path, use_float=True):
                all_npis.update(_expand_provider_ref_value(pr, group_map))

    return all_npis
