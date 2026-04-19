"""
Discover in-network machine-readable JSON URLs from payer table-of-contents (TOC) files.

TOC layout differs by issuer; we recursively collect string fields named `location` or `url`
that look like downloadable JSON MRFs (heuristic). Large files (>6MB) use streaming (ijson)
so multi‑tens‑of‑MB payer indexes do not load fully into memory.
"""

from __future__ import annotations

import gzip
import json
import logging
from pathlib import Path
from typing import Any, BinaryIO

import ijson

logger = logging.getLogger(__name__)


def _open_toc_binary(path: Path) -> BinaryIO:
    head = path.read_bytes()[:2]
    if head == b"\x1f\x8b":
        return gzip.open(path, "rb")
    return path.open("rb")


def _maybe_mrf_json_url(s: str) -> bool:
    t = s.strip().lower()
    if not t.startswith("http"):
        return False
    if ".json" not in t:
        return False
    if "schema" in t and "mrf" not in t:
        return False
    return True


def _walk_collect_json_urls(obj: Any, out: set[str]) -> None:
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k in ("location", "url") and isinstance(v, str) and _maybe_mrf_json_url(v):
                out.add(v.strip())
            else:
                _walk_collect_json_urls(v, out)
    elif isinstance(obj, list):
        for x in obj:
            _walk_collect_json_urls(x, out)


# Common CMS-style paths for in-network / allowed-amount links inside huge index files.
_STREAM_PREFIXES: tuple[str, ...] = (
    "reporting_structure.item.in_network_files.item.location",
    "reporting_structure.item.in_network_files.item.url",
    "reporting_structure.item.allowed_amount_file.location",
    "reporting_structure.item.allowed_amount_file.url",
    "in_network_files.item.location",
    "in_network_files.item.url",
)


def _discover_large_toc_urls(toc_path: Path) -> list[str]:
    found: set[str] = set()
    with _open_toc_binary(toc_path) as f:
        for prefix in _STREAM_PREFIXES:
            f.seek(0)
            try:
                for val in ijson.items(f, prefix, use_float=True):
                    if isinstance(val, str) and _maybe_mrf_json_url(val):
                        found.add(val.strip())
            except ijson.common.IncompleteJSONError:
                logger.warning("Incomplete JSON while streaming prefix %s on %s", prefix, toc_path)
    return sorted(found)


def discover_json_file_urls_from_toc(toc_path: Path) -> list[str]:
    """
    Parse a downloaded TOC JSON document and return candidate file URLs (stable order).
    """
    try:
        size = toc_path.stat().st_size
    except OSError:
        size = 0
    if size > 6_000_000:
        return _discover_large_toc_urls(toc_path)
    with _open_toc_binary(toc_path) as bf:
        raw = bf.read().decode("utf-8", errors="replace")
    data = json.loads(raw)
    found: set[str] = set()
    _walk_collect_json_urls(data, found)
    return sorted(found)
