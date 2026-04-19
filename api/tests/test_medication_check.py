from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from api.models import MedicationProfile

User = get_user_model()


class MedicationCheckAPITests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="check@example.com",
            password="x",
        )
        self.client.force_authenticate(user=self.user)

    def test_requires_auth(self):
        self.client.force_authenticate(user=None)
        res = self.client.post("/api/medication/check/", {"medications_text": "aspirin"})
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_missing_body(self):
        res = self.client.post("/api/medication/check/", {})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    @override_settings(OPENAI_API_KEY="")
    def test_missing_llm_key(self):
        res = self.client.post(
            "/api/medication/check/", {"medications_text": "aspirin 81mg"}
        )
        self.assertEqual(res.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)

    @override_settings(OPENAI_API_KEY="test-key")
    @patch("api.services.medication_check_service.fetch_recalls_for_medications")
    @patch("api.services.medication_check_service.compute_pairwise_interactions")
    @patch("api.services.medication_check_service.extract_medications_with_rxnorm")
    def test_happy_path_shape(self, mock_extract, mock_pairwise, mock_recalls):
        mock_extract.return_value = [
            {"name": "Aspirin", "rxnorm_id": "1191", "rxnorm_source": "rxnav"},
            {"name": "Warfarin", "rxnorm_id": "11289", "rxnorm_source": "rxnav"},
        ]
        mock_pairwise.return_value = {
            "source": "openfda_drug_label",
            "label_url": "https://example/label.json",
            "pairwise": [
                {
                    "drug_a": "Aspirin",
                    "drug_b": "Warfarin",
                    "has_interaction": True,
                    "severity": "major",
                    "description": "Bleeding risk.",
                }
            ],
            "per_drug_notes": [],
            "pairs_checked": 1,
        }
        mock_recalls.return_value = {
            "medications_checked": ["Aspirin", "Warfarin"],
            "recalls": [
                {
                    "classification": "II",
                    "reason_for_recall": "Labeling",
                    "profile_medication": "Aspirin",
                }
            ],
            "errors": [],
        }

        before = MedicationProfile.objects.filter(user=self.user).count()
        res = self.client.post(
            "/api/medication/check/",
            {"medications_text": "aspirin and warfarin"},
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(MedicationProfile.objects.filter(user=self.user).count(), before + 1)

        data = res.data
        self.assertIn("id", data)
        self.assertIn("created_at", data)
        self.assertEqual(data["medications_raw"], "aspirin and warfarin")
        self.assertEqual(len(data["extracted_medications"]), 2)
        self.assertEqual(data["interaction_results"]["pairs_checked"], 1)
        self.assertEqual(len(data["recalls"]["recalls"]), 1)
        self.assertEqual(data["recalls"]["medications_checked"], ["Aspirin", "Warfarin"])

        score = data["safety_score"]
        self.assertIn(score["level"], ("low", "moderate", "high"))
        self.assertIsInstance(score["numeric"], int)
        self.assertEqual(score["factors"]["interaction_major"], 1)
        self.assertEqual(score["factors"]["recall_class_ii"], 1)
        self.assertIn("summary", score)

        mock_recalls.assert_called_once_with(["Aspirin", "Warfarin"])
