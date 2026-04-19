from unittest.mock import patch

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

User = get_user_model()


class RegimenSafetyAPITests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="regimen@example.com",
            password="x",
        )
        self.client.force_authenticate(user=self.user)

    def test_requires_auth(self):
        self.client.force_authenticate(user=None)
        res = self.client.post(
            "/api/medication/regimen-safety/",
            {"medications": [{"name": "aspirin"}]},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_missing_medications(self):
        res = self.client.post("/api/medication/regimen-safety/", {}, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_empty_medications_array(self):
        res = self.client.post("/api/medication/regimen-safety/", {"medications": []}, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    @patch("api.views_medication.run_regimen_openfda_check")
    def test_post_returns_payload(self, mock_run):
        mock_run.return_value = {
            "interaction_results": {
                "source": "openfda_drug_label",
                "pairwise": [],
                "per_drug_label_safety": [],
                "per_drug_notes": [],
                "pairs_checked": 0,
            },
            "recalls": {
                "medications_checked": ["Aspirin"],
                "recalls": [],
                "errors": [],
            },
            "safety_score": {
                "level": "low",
                "numeric": 100,
                "factors": {},
                "summary": "ok",
            },
        }
        res = self.client.post(
            "/api/medication/regimen-safety/",
            {"medications": [{"name": "Aspirin", "rxnorm_id": "1191"}]},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["safety_score"]["level"], "low")
        mock_run.assert_called_once()
        args, _ = mock_run.call_args
        self.assertEqual(args[0], [{"name": "Aspirin", "rxnorm_id": "1191"}])
