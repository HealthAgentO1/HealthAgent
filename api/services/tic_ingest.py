"""
Offline download + DB load for CMS TIC-derived insurer–NPI rows.

Called from the `ingest_tic_network` management command (not at request time).
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import ssl
import tempfile
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

import certifi

from django.db import transaction

from api.models import InsurerNetworkNpi, NetworkDatasetVersion, TicSourceFile
from api.services.tic_npi_extract import extract_npis_from_tic_in_network_file
from api.services.tic_toc import discover_json_file_urls_from_toc

logger = logging.getLogger(__name__)

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 O1SummitTicIngest/1.0"
)


def _ssl_context() -> ssl.SSLContext:
    if os.environ.get("TIC_INGEST_SSL_VERIFY", "1").lower() in ("0", "false", "no"):
        return ssl._create_unverified_context()
    return ssl.create_default_context(cafile=certifi.where())


def load_us_manifest(path: Path) -> dict[str, Any]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict) or "insurers" not in data:
        raise ValueError("Manifest must be a JSON object with an 'insurers' array.")
    ins = data["insurers"]
    if not isinstance(ins, list) or not ins:
        raise ValueError("Manifest 'insurers' must be a non-empty array.")
    return data


def _download_to_path(url: str, dest: Path, timeout: float = 300.0) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout, context=_ssl_context()) as resp:
        with dest.open("wb") as out:
            while True:
                block = resp.read(1024 * 1024)
                if not block:
                    break
                out.write(block)


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


_FANOUT_SKIP_RECURSE = 64


def _expand_toc_seeds_to_leaf_mrf_urls(
    toc_urls: list[str],
    cache_dir: Path,
    dry_run: bool,
) -> list[str]:
    """
    Follow nested table-of-contents JSON (e.g. Cigna latest.json → signed index → MRF list)
    until leaf files. When an index fans out to many child URLs (e.g. Molina), treat those
    children as MRF links without re-downloading each to recurse.
    """
    if dry_run:
        return []
    leaves: list[str] = []
    seen: set[str] = set()
    frontier = [u.strip() for u in toc_urls if isinstance(u, str) and u.startswith("http")]
    max_hops = 12
    for hop in range(max_hops):
        if not frontier:
            break
        next_frontier: list[str] = []
        for u in frontier:
            if u in seen:
                continue
            seen.add(u)
            fd, name = tempfile.mkstemp(suffix=".json", dir=str(cache_dir))
            os.close(fd)
            tmp_path = Path(name)
            try:
                logger.info("TOC hop %s fetch %s", hop, u[:120])
                _download_to_path(u, tmp_path)
                children = discover_json_file_urls_from_toc(tmp_path)
            except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError, UnicodeError, ValueError) as e:
                logger.warning("TOC expand failed for %s: %s", u, e)
                children = []
            finally:
                tmp_path.unlink(missing_ok=True)

            if not children:
                leaves.append(u)
            elif len(children) > _FANOUT_SKIP_RECURSE:
                for c in children:
                    if isinstance(c, str) and c.startswith("http") and c not in seen:
                        leaves.append(c)
            else:
                for c in children:
                    if isinstance(c, str) and c.startswith("http") and c not in seen:
                        next_frontier.append(c)
        frontier = next_frontier

    deduped: list[str] = []
    s2: set[str] = set()
    for u in leaves:
        if u not in s2:
            s2.add(u)
            deduped.append(u)
    return deduped


def _gather_mrf_urls_for_insurer(entry: dict[str, Any], cache_dir: Path, dry_run: bool) -> list[str]:
    slug = entry.get("slug")
    if not isinstance(slug, str) or not slug.strip():
        raise ValueError("Each manifest insurer needs a string 'slug'.")
    discovered: list[str] = []

    direct = entry.get("direct_in_network_file_urls") or []
    if isinstance(direct, list):
        for u in direct:
            if isinstance(u, str) and u.strip().startswith("http"):
                discovered.append(u.strip())

    toc_list = entry.get("table_of_contents_urls") or []
    if isinstance(toc_list, list):
        seeds = [u.strip() for u in toc_list if isinstance(u, str) and u.strip().startswith("http")]
        discovered.extend(_expand_toc_seeds_to_leaf_mrf_urls(seeds, cache_dir, dry_run))

    seen: set[str] = set()
    out: list[str] = []
    for u in discovered:
        if u not in seen:
            seen.add(u)
            out.append(u)
    # Prefer negotiated in-network MRFs (path naming varies by payer).
    def _in_network_score(url: str) -> int:
        t = url.lower()
        s = 0
        if "in-network" in t or "in_network" in t:
            s += 4
        if "innetwork" in t or "/inn/" in t:
            s += 3
        if "in-network-rates" in t or "in_network_rates" in t:
            s += 2
        if "allowed" in t or "allowed-amount" in t:
            s -= 2
        return s

    return sorted(out, key=lambda u: (-_in_network_score(u), u))


def _ingest_npis_for_file(
    *,
    insurer_slug: str,
    local_path: Path,
    file_url: str,
    sha: str,
    force_reparse: bool,
) -> int:
    if not force_reparse and TicSourceFile.objects.filter(
        insurer_slug=insurer_slug,
        file_url=file_url,
        sha256_hex=sha,
    ).exists():
        logger.info("Skip already-processed file %s (%s…)", file_url, sha[:12])
        return 0

    npis = extract_npis_from_tic_in_network_file(local_path)
    if not npis:
        logger.warning("No NPIs extracted from %s", file_url)
        TicSourceFile.objects.update_or_create(
            insurer_slug=insurer_slug,
            file_url=file_url,
            sha256_hex=sha,
            defaults={"npi_count": 0},
        )
        return 0

    batch: list[InsurerNetworkNpi] = []
    inserted = 0
    batch_size = 3000

    def flush() -> None:
        nonlocal batch, inserted
        if not batch:
            return
        InsurerNetworkNpi.objects.bulk_create(batch, ignore_conflicts=True, batch_size=batch_size)
        inserted += len(batch)
        batch = []

    for n in sorted(npis):
        batch.append(InsurerNetworkNpi(insurer_slug=insurer_slug, npi=n))
        if len(batch) >= batch_size:
            flush()
    flush()

    TicSourceFile.objects.update_or_create(
        insurer_slug=insurer_slug,
        file_url=file_url,
        sha256_hex=sha,
        defaults={"npi_count": len(npis)},
    )
    return inserted


def run_ingest(
    *,
    manifest_path: Path,
    cache_dir: Path,
    insurer_filter: str | None,
    max_files_per_insurer: int | None,
    dry_run: bool,
    force_reparse: bool,
    clear_insurer: str | None,
    git_commit: str,
    notes: str,
) -> dict[str, Any]:
    manifest = load_us_manifest(manifest_path)
    summary: dict[str, Any] = {"insurers": {}, "dry_run": dry_run}

    if clear_insurer:
        if dry_run:
            summary["would_clear"] = clear_insurer
        else:
            with transaction.atomic():
                deleted, _ = InsurerNetworkNpi.objects.filter(insurer_slug=clear_insurer).delete()
                TicSourceFile.objects.filter(insurer_slug=clear_insurer).delete()
            summary["cleared_insurer"] = clear_insurer
            summary["deleted_rows"] = deleted

    for entry in manifest["insurers"]:
        if not isinstance(entry, dict):
            continue
        slug = str(entry.get("slug", "")).strip()
        if not slug:
            continue
        if insurer_filter and slug != insurer_filter:
            continue

        cache_dir.mkdir(parents=True, exist_ok=True)
        file_urls = _gather_mrf_urls_for_insurer(entry, cache_dir, dry_run)
        if dry_run:
            summary.setdefault("would_expand_insurers", {})[slug] = {
                "note": "Dry run: TOC URLs not expanded; use without --dry-run to download TOCs.",
                "direct_urls": len(entry.get("direct_in_network_file_urls") or []),
                "toc_urls": len(entry.get("table_of_contents_urls") or []),
            }
            continue

        if max_files_per_insurer is not None:
            file_urls = file_urls[: max_files_per_insurer]

        insurer_summary: dict[str, Any] = {"file_urls": len(file_urls), "rows_bulk_touched": 0}
        summary["insurers"][slug] = insurer_summary

        for i, file_url in enumerate(file_urls):
            logger.info("[%s] file %s/%s %s", slug, i + 1, len(file_urls), file_url[:120])
            fd, name = tempfile.mkstemp(suffix=".json", dir=str(cache_dir))
            os.close(fd)
            dl_path = Path(name)
            try:
                _download_to_path(file_url, dl_path)
                sha = sha256_file(dl_path)
                persistent = cache_dir / f"{sha}.json"
                if persistent.exists():
                    local = persistent
                    dl_path.unlink(missing_ok=True)
                else:
                    dl_path.replace(persistent)
                    local = persistent
                n = _ingest_npis_for_file(
                    insurer_slug=slug,
                    local_path=local,
                    file_url=file_url,
                    sha=sha,
                    force_reparse=force_reparse,
                )
                insurer_summary["rows_bulk_touched"] += n
            except (urllib.error.URLError, TimeoutError, OSError, ValueError) as e:
                logger.exception("Failed ingest for %s: %s", file_url, e)
            finally:
                if dl_path.exists():
                    dl_path.unlink(missing_ok=True)

    if not dry_run and summary.get("insurers"):
        counts: dict[str, int] = {}
        for slug in summary["insurers"]:
            counts[slug] = InsurerNetworkNpi.objects.filter(insurer_slug=slug).count()
        NetworkDatasetVersion.objects.create(
            git_commit=(git_commit or "")[:64],
            notes=notes[:2000] if notes else "",
            counts_by_insurer=counts,
        )
        summary["counts_by_insurer"] = counts

    return summary
