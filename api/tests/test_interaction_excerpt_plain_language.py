import json
from unittest.mock import patch

from django.test import SimpleTestCase, override_settings

from api.services.interaction_excerpt_plain_language import (
    clear_interaction_plain_cache_for_tests,
    enrich_pairwise_with_plain_language,
)
from api.services.medication_llm_service import MedicationLlmError


@override_settings(OPENAI_API_KEY="", OPENAI_BASE_URL="https://api.deepseek.com")
class InteractionExcerptPlainLanguageTests(SimpleTestCase):
    def setUp(self) -> None:
        clear_interaction_plain_cache_for_tests()

    def test_no_api_key_skips_llm(self):
        pairwise = [
            {
                "drug_a": "A",
                "drug_b": "B",
                "has_interaction": True,
                "severity": "mild",
                "description": "some raw text",
                "direction": "d",
            },
        ]
        with patch(
            "api.services.interaction_excerpt_plain_language.complete_openai_compatible_json",
        ) as mock_complete:
            enrich_pairwise_with_plain_language(pairwise)
            mock_complete.assert_not_called()
        self.assertNotIn("description_plain", pairwise[0])

    @override_settings(OPENAI_API_KEY="test-key", OPENAI_BASE_URL="https://api.deepseek.com")
    def test_no_interaction_hits_skips_llm(self):
        pairwise = [
            {
                "drug_a": "A",
                "drug_b": "B",
                "has_interaction": False,
                "severity": None,
                "description": "",
                "direction": None,
            },
        ]
        with patch(
            "api.services.interaction_excerpt_plain_language.complete_openai_compatible_json",
        ) as mock_complete:
            enrich_pairwise_with_plain_language(pairwise)
            mock_complete.assert_not_called()

    @override_settings(OPENAI_API_KEY="test-key", OPENAI_BASE_URL="https://api.deepseek.com")
    def test_merges_plain_text_by_index(self):
        pairwise = [
            {
                "drug_a": "X",
                "drug_b": "Y",
                "has_interaction": False,
                "severity": None,
                "description": "",
                "direction": None,
            },
            {
                "drug_a": "Warfarin",
                "drug_b": "Aspirin",
                "has_interaction": True,
                "severity": "moderate",
                "description": "RAW LABEL FRAGMENT",
                "direction": "FDA label …",
            },
        ]
        with patch(
            "api.services.interaction_excerpt_plain_language.complete_openai_compatible_json",
        ) as mock_complete:
            mock_complete.return_value = '{"items": [{"i": 1, "plain": "Taking these together may increase bleeding risk."}]}'
            enrich_pairwise_with_plain_language(pairwise)
            mock_complete.assert_called_once()
        self.assertNotIn("description_plain", pairwise[0])
        self.assertEqual(
            pairwise[1]["description_plain"],
            "Taking these together may increase bleeding risk.",
        )

    @override_settings(OPENAI_API_KEY="test-key", OPENAI_BASE_URL="https://api.deepseek.com")
    def test_second_enrich_same_content_skips_llm(self):
        """Same drug pair + direction + excerpt at a different pairwise index uses cache."""
        row_hit = {
            "drug_a": "Warfarin",
            "drug_b": "Aspirin",
            "has_interaction": True,
            "severity": "moderate",
            "description": "SHARED EXCERPT",
            "direction": "FDA label (Warfarin) …",
        }
        pairwise_first = [
            {
                "drug_a": "X",
                "drug_b": "Y",
                "has_interaction": False,
                "severity": None,
                "description": "",
                "direction": None,
            },
            dict(row_hit),
        ]
        with patch(
            "api.services.interaction_excerpt_plain_language.complete_openai_compatible_json",
        ) as mock_complete:
            mock_complete.return_value = '{"items": [{"i": 1, "plain": "Cached summary text."}]}'
            enrich_pairwise_with_plain_language(pairwise_first)
            self.assertEqual(mock_complete.call_count, 1)

        pairwise_second = [
            dict(row_hit),
            {
                "drug_a": "X",
                "drug_b": "Y",
                "has_interaction": False,
                "severity": None,
                "description": "",
                "direction": None,
            },
        ]
        with patch(
            "api.services.interaction_excerpt_plain_language.complete_openai_compatible_json",
        ) as mock_complete:
            enrich_pairwise_with_plain_language(pairwise_second)
            mock_complete.assert_not_called()
        self.assertEqual(pairwise_second[0]["description_plain"], "Cached summary text.")

    @override_settings(OPENAI_API_KEY="test-key", OPENAI_BASE_URL="https://api.deepseek.com")
    def test_mixed_cache_hit_miss_sends_only_misses_to_llm(self):
        excerpt_a = "UNIQUE EXCERPT ALPHA"
        row_cached = {
            "drug_a": "DrugA",
            "drug_b": "DrugB",
            "has_interaction": True,
            "severity": "mild",
            "description": excerpt_a,
            "direction": "dir-a",
        }
        pairwise_warm = [dict(row_cached)]
        with patch(
            "api.services.interaction_excerpt_plain_language.complete_openai_compatible_json",
        ) as mock_complete:
            mock_complete.return_value = '{"items": [{"i": 0, "plain": "Summary A."}]}'
            enrich_pairwise_with_plain_language(pairwise_warm)

        pairwise_mixed = [
            {
                "drug_a": "P",
                "drug_b": "Q",
                "has_interaction": False,
                "severity": None,
                "description": "",
                "direction": None,
            },
            dict(row_cached),
            {
                "drug_a": "DrugC",
                "drug_b": "DrugD",
                "has_interaction": True,
                "severity": "moderate",
                "description": "BRAND NEW EXCERPT",
                "direction": "dir-c",
            },
        ]
        with patch(
            "api.services.interaction_excerpt_plain_language.complete_openai_compatible_json",
        ) as mock_complete:
            mock_complete.return_value = '{"items": [{"i": 2, "plain": "Summary C."}]}'
            enrich_pairwise_with_plain_language(pairwise_mixed)
            mock_complete.assert_called_once()
            user_payload = json.loads(mock_complete.call_args[0][1])
            self.assertEqual(len(user_payload["conflicts"]), 1)
            self.assertEqual(user_payload["conflicts"][0]["i"], 2)

        self.assertEqual(pairwise_mixed[1]["description_plain"], "Summary A.")
        self.assertEqual(pairwise_mixed[2]["description_plain"], "Summary C.")

    @override_settings(OPENAI_API_KEY="test-key", OPENAI_BASE_URL="https://api.deepseek.com")
    def test_invalid_items_shape_no_merge(self):
        pairwise = [
            {
                "drug_a": "A",
                "drug_b": "B",
                "has_interaction": True,
                "severity": "mild",
                "description": "excerpt",
                "direction": "",
            },
        ]
        with patch(
            "api.services.interaction_excerpt_plain_language.complete_openai_compatible_json",
        ) as mock_complete:
            mock_complete.return_value = '{"items": "not-a-list"}'
            enrich_pairwise_with_plain_language(pairwise)
        self.assertNotIn("description_plain", pairwise[0])

    @override_settings(OPENAI_API_KEY="test-key", OPENAI_BASE_URL="https://api.deepseek.com")
    def test_malformed_json_from_llm_no_merge(self):
        pairwise = [
            {
                "drug_a": "A",
                "drug_b": "B",
                "has_interaction": True,
                "severity": "mild",
                "description": "excerpt",
                "direction": "",
            },
        ]
        with patch(
            "api.services.interaction_excerpt_plain_language.complete_openai_compatible_json",
        ) as mock_complete:
            mock_complete.return_value = "not json"
            enrich_pairwise_with_plain_language(pairwise)
        self.assertNotIn("description_plain", pairwise[0])

    @override_settings(OPENAI_API_KEY="test-key", OPENAI_BASE_URL="https://api.deepseek.com")
    def test_llm_error_no_merge(self):
        pairwise = [
            {
                "drug_a": "A",
                "drug_b": "B",
                "has_interaction": True,
                "severity": "mild",
                "description": "excerpt",
                "direction": "",
            },
        ]
        with patch(
            "api.services.interaction_excerpt_plain_language.complete_openai_compatible_json",
        ) as mock_complete:
            mock_complete.side_effect = MedicationLlmError("upstream")
            enrich_pairwise_with_plain_language(pairwise)
        self.assertNotIn("description_plain", pairwise[0])
