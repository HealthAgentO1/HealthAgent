"""
Offline ingest: US CMS TIC machine-readable files → InsurerNetworkNpi rows.

Example:

  python manage.py ingest_tic_network \\
    --manifest api/data/tic_us_manifest.json \\
    --max-files-per-insurer 3

See docs/TIC_INGEST.md for dump/restore and manifest notes.
"""

from __future__ import annotations

import os
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand

from api.services.tic_ingest import run_ingest


class Command(BaseCommand):
    help = "Download TIC-related JSON (from manifest) and load insurer↔NPI rows."

    def add_arguments(self, parser):
        base = Path(settings.BASE_DIR)
        parser.add_argument(
            "--manifest",
            type=str,
            default=str(base / "api" / "data" / "tic_us_manifest.json"),
            help="Path to tic_us_manifest.json",
        )
        parser.add_argument(
            "--cache-dir",
            type=str,
            default=str(base / "data" / "tic_raw"),
            help="Directory for downloaded JSON caches",
        )
        parser.add_argument(
            "--insurer",
            type=str,
            default="",
            help="Only process this insurer slug (centene|cigna|healthnet|fidelis)",
        )
        parser.add_argument(
            "--max-files-per-insurer",
            type=int,
            default=None,
            help="Cap in-network files processed per insurer (testing / partial loads)",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Validate manifest and skip downloads / DB writes",
        )
        parser.add_argument(
            "--force-reparse",
            action="store_true",
            help="Re-parse files even if the same URL+SHA was already ingested",
        )
        parser.add_argument(
            "--clear-insurer",
            type=str,
            default="",
            help="Before ingest, delete all rows + source records for this slug",
        )
        parser.add_argument(
            "--notes",
            type=str,
            default="",
            help="Stored on NetworkDatasetVersion for provenance",
        )

    def handle(self, *args, **options):
        base = Path(settings.BASE_DIR)
        manifest_path = Path(options["manifest"])
        if not manifest_path.is_absolute():
            manifest_path = (base / manifest_path).resolve()
        cache_dir = Path(options["cache_dir"])
        if not cache_dir.is_absolute():
            cache_dir = (base / cache_dir).resolve()

        git_commit = os.environ.get("SOURCE_GIT_COMMIT", os.environ.get("GITHUB_SHA", ""))

        summary = run_ingest(
            manifest_path=manifest_path,
            cache_dir=cache_dir,
            insurer_filter=options["insurer"].strip() or None,
            max_files_per_insurer=options["max_files_per_insurer"],
            dry_run=options["dry_run"],
            force_reparse=options["force_reparse"],
            clear_insurer=options["clear_insurer"].strip() or None,
            git_commit=git_commit,
            notes=options["notes"] or "",
        )
        self.stdout.write(self.style.SUCCESS(str(summary)))
