from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase

from api.services.openfda_interactions import (
    clear_openfda_cache_for_tests,
    compute_pairwise_interactions,
    fetch_openfda_label_for_term,
)


def _mock_label_ok():
    return {"drug_interactions": ["No other drugs mentioned."]}, {
        "field": "generic_name",
        "term": "placeholder",
    }


class OpenfdaInteractionsTests(SimpleTestCase):
    def tearDown(self):
        clear_openfda_cache_for_tests()

    @patch("api.services.openfda_interactions.fetch_openfda_label_for_medication")
    def test_pairwise_detects_mention_in_drug_interactions(self, mock_fm):
        def fake_med(session, med):
            n = med["name"]
            if n == "Warfarin":
                return (
                    {
                        "drug_interactions": [
                            "7 DRUG INTERACTIONS ... aspirin may increase bleeding risk when combined with warfarin."
                        ],
                    },
                    {"field": "generic_name", "term": "warfarin"},
                )
            if n == "Aspirin":
                return (
                    {"drug_interactions": ["No relevant text about warfarin here."]},
                    {"field": "generic_name", "term": "aspirin"},
                )
            return None, None

        mock_fm.side_effect = fake_med
        meds = [{"name": "Warfarin"}, {"name": "Aspirin"}]
        out = compute_pairwise_interactions(meds)
        self.assertEqual(out["pairs_checked"], 1)
        self.assertEqual(len(out["pairwise"]), 1)
        row = out["pairwise"][0]
        self.assertTrue(row["has_interaction"])
        self.assertEqual(row["drug_a"], "Warfarin")
        self.assertEqual(row["drug_b"], "Aspirin")
        self.assertIn(row["severity"], ("severe", "moderate", "mild"))
        self.assertTrue(row["description"])

    @patch("api.services.openfda_interactions.fetch_openfda_label_for_medication")
    def test_pairwise_no_hit(self, mock_fm):
        mock_fm.return_value = _mock_label_ok()
        meds = [{"name": "Drugone"}, {"name": "Drugtwo"}]
        out = compute_pairwise_interactions(meds)
        self.assertEqual(out["pairs_checked"], 1)
        self.assertFalse(out["pairwise"][0]["has_interaction"])

    @patch("api.services.openfda_interactions.fetch_openfda_label_for_medication")
    def test_pairwise_severe_severity_keyword(self, mock_fm):
        def fake_med(session, med):
            n = med["name"]
            if n == "DrugX":
                return (
                    {
                        "drug_interactions": [
                            "Contraindicated: do not coadminister with drugy due to fatal arrhythmia risk."
                        ],
                    },
                    {"field": "generic_name", "term": "drugx"},
                )
            if n == "DrugY":
                return ({"drug_interactions": [""]}, {"field": "generic_name", "term": "drugy"})
            return None, None

        mock_fm.side_effect = fake_med
        out = compute_pairwise_interactions([{"name": "DrugX"}, {"name": "DrugY"}])
        row = out["pairwise"][0]
        self.assertTrue(row["has_interaction"])
        self.assertEqual(row["severity"], "severe")

    @patch("api.services.openfda_interactions.fetch_openfda_label_for_medication")
    def test_pairwise_excerpt_prefers_paragraph_with_stronger_language(self, mock_fm):
        """When multiple paragraphs mention the paired drug, excerpt should favor stronger wording."""

        def fake_med(session, med):
            n = med["name"]
            if n == "DrugX":
                return (
                    {
                        "drug_interactions": [
                            "DrugY may appear in many protocols as a background medication.\n\n"
                            "Contraindicated: do not coadminister with drugy when QT prolongation is a concern."
                        ],
                    },
                    {"field": "generic_name", "term": "drugx"},
                )
            if n == "DrugY":
                return ({"drug_interactions": [""]}, {"field": "generic_name", "term": "drugy"})
            return None, None

        mock_fm.side_effect = fake_med
        out = compute_pairwise_interactions([{"name": "DrugX"}, {"name": "DrugY"}])
        row = out["pairwise"][0]
        self.assertTrue(row["has_interaction"])
        self.assertEqual(row["severity"], "severe")
        self.assertIn("Contraindicated", row["description"])
        self.assertNotIn("many protocols", row["description"])

    @patch("api.services.openfda_interactions.fetch_openfda_label_for_medication")
    def test_pairwise_detects_via_scientific_name_in_label(self, mock_fm):
        """Label may name the generic while the patient med is brand-only; tokens include scientific_name."""

        def fake_med(session, med):
            if med["name"] == "DrugX":
                return (
                    {"drug_interactions": ["Monitor when given with lisinopril."]},
                    {"field": "generic_name", "term": "drugx"},
                )
            if med["name"] == "Zestril":
                return ({"drug_interactions": [""]}, {"field": "generic_name", "term": "lisinopril"})
            return None, None

        mock_fm.side_effect = fake_med
        out = compute_pairwise_interactions(
            [{"name": "DrugX"}, {"name": "Zestril", "scientific_name": "Lisinopril"}],
        )
        self.assertEqual(len(out["pairwise"]), 1)
        row = out["pairwise"][0]
        self.assertTrue(row["has_interaction"])
        self.assertIn("lisinopril", row["description"].lower())

    @patch("api.services.openfda_interactions.fetch_openfda_label_for_medication")
    def test_single_medication_returns_empty_pairwise(self, mock_fm):
        mock_fm.return_value = (
            {"boxed_warning": ["Risk of harm."], "openfda": {"generic_name": ["onlyone"]}},
            {"field": "generic_name", "term": "onlyone"},
        )
        out = compute_pairwise_interactions([{"name": "Onlyone"}])
        self.assertEqual(out["pairs_checked"], 0)
        self.assertEqual(out["pairwise"], [])
        self.assertEqual(len(out["per_drug_label_safety"]), 1)
        self.assertTrue(out["per_drug_label_safety"][0]["label_found"])
        self.assertEqual(out["per_drug_label_safety"][0]["label_query"]["field"], "generic_name")

    @patch("api.services.openfda_interactions._fetch_label_by_field")
    def test_scientific_name_tried_before_brand_on_generic_field(self, mock_field):
        """Prefer scientific (generic) token on openfda.generic_name before display name generic search."""

        def side(session, field, term):
            if field == "generic_name" and term == "amphetamine":
                return {"drug_interactions": ["monitor"]}
            return None

        mock_field.side_effect = side
        out = compute_pairwise_interactions(
            [{"name": "Adderall", "scientific_name": "Amphetamine Aspartate Monohydrate"}],
        )
        row = out["per_drug_label_safety"][0]
        self.assertTrue(row["label_found"])
        self.assertEqual(row["label_query"]["term"], "amphetamine")
        self.assertEqual(row["label_query"]["field"], "generic_name")
        # Should not need brand_name if generic_name scientific hit
        calls = [(c[0][1], c[0][2]) for c in mock_field.call_args_list]
        self.assertIn(("generic_name", "amphetamine"), calls)

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
