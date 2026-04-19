from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase

from api.services.openfda_interactions import (
    clear_openfda_cache_for_tests,
    compute_pairwise_interactions,
    fetch_openfda_label_for_term,
)


class OpenfdaInteractionsTests(SimpleTestCase):
    def tearDown(self):
        clear_openfda_cache_for_tests()

    @patch("api.services.openfda_interactions.fetch_openfda_label_for_term")
    def test_pairwise_detects_mention_in_drug_interactions(self, mock_fetch):
        def fake_fetch(session, term):
            if term == "warfarin":
                return {
                    "drug_interactions": [
                        "7 DRUG INTERACTIONS ... aspirin may increase bleeding risk when combined with warfarin."
                    ],
                }
            if term == "aspirin":
                return {"drug_interactions": ["No relevant text about warfarin here."]}
            return None

        mock_fetch.side_effect = fake_fetch
        meds = [{"name": "Warfarin"}, {"name": "Aspirin"}]
        out = compute_pairwise_interactions(meds)
        self.assertEqual(out["pairs_checked"], 1)
        self.assertEqual(len(out["pairwise"]), 1)
        row = out["pairwise"][0]
        self.assertTrue(row["has_interaction"])
        self.assertEqual(row["drug_a"], "Warfarin")
        self.assertEqual(row["drug_b"], "Aspirin")
        self.assertIn(row["severity"], ("major", "moderate", "minor"))
        self.assertTrue(row["description"])

    @patch("api.services.openfda_interactions.fetch_openfda_label_for_term")
    def test_pairwise_no_hit(self, mock_fetch):
        mock_fetch.return_value = {"drug_interactions": ["No other drugs mentioned."]}
        meds = [{"name": "Drugone"}, {"name": "Drugtwo"}]
        out = compute_pairwise_interactions(meds)
        self.assertEqual(out["pairs_checked"], 1)
        self.assertFalse(out["pairwise"][0]["has_interaction"])

    @patch("api.services.openfda_interactions.fetch_openfda_label_for_term")
    def test_pairwise_major_severity_keyword(self, mock_fetch):
        def fake_fetch(session, term):
            if term == "drugx":
                return {
                    "drug_interactions": [
                        "Contraindicated: do not coadminister with drugy due to fatal arrhythmia risk."
                    ],
                }
            if term == "drugy":
                return {"drug_interactions": [""]}
            return None

        mock_fetch.side_effect = fake_fetch
        out = compute_pairwise_interactions([{"name": "DrugX"}, {"name": "DrugY"}])
        row = out["pairwise"][0]
        self.assertTrue(row["has_interaction"])
        self.assertEqual(row["severity"], "major")

    def test_single_medication_returns_empty_pairwise(self):
        out = compute_pairwise_interactions([{"name": "Onlyone"}])
        self.assertEqual(out["pairs_checked"], 0)
        self.assertEqual(out["pairwise"], [])

    @patch("api.services.openfda_interactions.requests.Session.get")
    def test_fetch_uses_cache_second_call(self, mock_get):
        mock_resp = MagicMock()
        mock_resp.raise_for_status = MagicMock()
        mock_resp.json.return_value = {
            "results": [
                {
                    "drug_interactions": ["aspirin mentioned"],
                    "openfda": {"generic_name": ["warfarin"]},
                }
            ],
        }
        mock_get.return_value = mock_resp

        import requests

        s = requests.Session()
        clear_openfda_cache_for_tests()
        a = fetch_openfda_label_for_term(s, "warfarin")
        b = fetch_openfda_label_for_term(s, "warfarin")
        self.assertIsNotNone(a)
        self.assertIs(a, b)  # same dict object from cache
        self.assertEqual(mock_get.call_count, 1)
        s.close()
