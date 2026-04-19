from pathlib import Path

from django.test import SimpleTestCase

from api.services.tic_npi_extract import extract_npis_from_tic_in_network_file


class TicNpiExtractTests(SimpleTestCase):
    def test_extracts_npis_from_fixture(self) -> None:
        path = Path(__file__).resolve().parent / "fixtures" / "tic_minimal_in_network.json"
        npis = extract_npis_from_tic_in_network_file(path)
        self.assertEqual(
            npis,
            {"1000000004", "2000000007", "3000000005"},
        )

    def test_centene_nested_provider_groups(self) -> None:
        path = Path(__file__).resolve().parent / "fixtures" / "tic_centene_style.json"
        npis = extract_npis_from_tic_in_network_file(path)
        self.assertEqual(npis, {"1831634989"})
