"""URL ordering for `ingest_tic_network` manifest expansion."""

from pathlib import Path

from django.test import SimpleTestCase

from api.services.tic_ingest import _gather_mrf_urls_for_insurer


class TicIngestGatherUrlsTests(SimpleTestCase):
    def test_direct_urls_keep_manifest_order_not_alphabetical(self) -> None:
        entry = {
            "slug": "centene",
            "table_of_contents_urls": [],
            "direct_in_network_file_urls": [
                "https://example.com/ambetter-zz_in-network.json",
                "https://example.com/ambetter-aa_in-network.json",
            ],
        }
        out = _gather_mrf_urls_for_insurer(entry, Path("/tmp"), dry_run=True)
        self.assertEqual(
            out,
            [
                "https://example.com/ambetter-zz_in-network.json",
                "https://example.com/ambetter-aa_in-network.json",
            ],
        )
