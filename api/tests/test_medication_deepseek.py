from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework import status
from rest_framework.test import APIClient, APIRequestFactory, force_authenticate

from api.models import MedicationProfile
from api.services.medication_llm_service import MedicationLlmError, parse_medication_llm_json
from api.services.medication_extraction import extract_medications_with_rxnorm
from api.views_medication import MedicationProfileExtractView

User = get_user_model()


@override_settings(OPENAI_API_KEY="test-key", OPENAI_BASE_URL="https://api.deepseek.com")
class MedicationExtractionServiceTests(TestCase):
    @patch("api.services.medication_extraction.resolve_rxnorm_id_for_drug_name")
    @patch("api.services.medication_extraction.extract_medication_names_via_llm")
    def test_extract_uses_deepseek_rxnorm_when_present(self, mock_llm, mock_rxnav):
        mock_llm.return_value = [
            {
                "name": "lisinopril",
                "common_name": None,
                "scientific_name": "lisinopril",
                "rxnorm_id": "29046",
            },
        ]
        out = extract_medications_with_rxnorm("lisinopril 10mg daily")
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]["name"], "lisinopril")
        self.assertIsNone(out[0]["common_name"])
        self.assertEqual(out[0]["scientific_name"], "lisinopril")
        self.assertEqual(out[0]["rxnorm_id"], "29046")
        self.assertEqual(out[0]["rxnorm_source"], "deepseek")
        mock_rxnav.assert_not_called()

    @patch("api.services.medication_extraction.resolve_rxnorm_id_for_drug_name")
    @patch("api.services.medication_extraction.extract_medication_names_via_llm")
    def test_extract_falls_back_to_rxnav(self, mock_llm, mock_rxnav):
        mock_llm.return_value = [
            {
                "name": "metformin",
                "common_name": None,
                "scientific_name": "metformin",
                "rxnorm_id": None,
            },
        ]
        mock_rxnav.return_value = "6809"
        out = extract_medications_with_rxnorm("metformin")
        self.assertEqual(out[0]["rxnorm_id"], "6809")
        self.assertEqual(out[0]["rxnorm_source"], "rxnav")
        mock_rxnav.assert_called_once_with("metformin")
        self.assertIsNone(out[0]["common_name"])
        self.assertEqual(out[0]["scientific_name"], "metformin")

    def test_parse_json_common_and_scientific(self):
        raw = (
            '{"medications": [{"common_name": "Advil", "scientific_name": "ibuprofen", "rxnorm_id": null}]}'
        )
        out = parse_medication_llm_json(raw)
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]["common_name"], "Advil")
        self.assertEqual(out[0]["scientific_name"], "ibuprofen")
        self.assertEqual(out[0]["name"], "ibuprofen")

    def test_parse_json_legacy_name_only(self):
        raw = '{"medications": [{"name": "warfarin", "rxnorm_id": null}]}'
        out = parse_medication_llm_json(raw)
        self.assertEqual(len(out), 1)
        self.assertIsNone(out[0]["common_name"])
        self.assertIsNone(out[0]["scientific_name"])
        self.assertEqual(out[0]["name"], "warfarin")


@override_settings(DEBUG=False, OPENAI_API_KEY="test-key")
class MedicationProfileExtractApiTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="meds@example.com",
            password="testpass123",
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    @patch("api.views_medication.extract_medications_with_rxnorm")
    def test_post_creates_profile(self, mock_extract):
        mock_extract.return_value = [
            {
                "name": "aspirin",
                "common_name": None,
                "scientific_name": "aspirin",
                "rxnorm_id": "1191",
                "rxnorm_source": "deepseek",
            },
        ]
        res = self.client.post(
            "/api/medication-profile/extract/",
            {"medications_text": "baby aspirin"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["medications_raw"], "baby aspirin")
        self.assertEqual(len(res.data["extracted_medications"]), 1)
        self.assertIsNone(res.data.get("interaction_results"))
        self.assertEqual(MedicationProfile.objects.filter(user=self.user).count(), 1)

    @patch("api.views_medication.compute_pairwise_interactions")
    @patch("api.views_medication.extract_medications_with_rxnorm")
    def test_post_saves_interaction_results_when_two_or_more_meds(
        self,
        mock_extract,
        mock_pairwise,
    ):
        mock_extract.return_value = [
            {"name": "Lisinopril", "rxnorm_id": "29046"},
            {"name": "Ibuprofen", "rxnorm_id": "5640"},
        ]
        mock_pairwise.return_value = {
            "source": "openfda_drug_label",
            "pairwise": [],
            "pairs_checked": 1,
        }
        res = self.client.post(
            "/api/medication-profile/extract/",
            {"medications_text": "lisinopril and ibuprofen"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["interaction_results"]["pairs_checked"], 1)
        profile = MedicationProfile.objects.get(pk=res.data["id"])
        self.assertEqual(profile.interaction_results["source"], "openfda_drug_label")
        mock_pairwise.assert_called_once()

    def test_post_requires_llm_key(self):
        factory = APIRequestFactory()
        request = factory.post(
            "/api/medication-profile/extract/",
            {"medications_text": "aspirin"},
            format="json",
        )
        force_authenticate(request, user=self.user)
        with override_settings(OPENAI_API_KEY=""):
            response = MedicationProfileExtractView.as_view()(request)
        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)

    def test_post_requires_body_text(self):
        res = self.client.post("/api/medication-profile/extract/", {}, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    @patch("api.views_medication.extract_medications_with_rxnorm")
    def test_post_llm_error_502(self, mock_extract):
        mock_extract.side_effect = MedicationLlmError("upstream failure")
        factory = APIRequestFactory()
        request = factory.post(
            "/api/medication-profile/extract/",
            {"text": "x"},
            format="json",
        )
        force_authenticate(request, user=self.user)
        response = MedicationProfileExtractView.as_view()(request)
        self.assertEqual(response.status_code, status.HTTP_502_BAD_GATEWAY)
        self.assertEqual(MedicationProfile.objects.count(), 0)
