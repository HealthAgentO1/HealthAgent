from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from api.models import MedicationProfile
from api.services.medication_profile_service import (
    core_drug_query_term,
    distinct_active_names_from_entries,
    get_active_medication_names,
)
from api.services.openfda_recall_service import (
    fetch_recalls_for_medication,
    fetch_recalls_for_medications,
    parse_recall_classification,
)

User = get_user_model()


class ParseClassificationTests(TestCase):
    def test_maps_roman_buckets(self):
        self.assertEqual(parse_recall_classification("Class I")[0], "I")
        self.assertEqual(parse_recall_classification("Class II")[0], "II")
        self.assertEqual(parse_recall_classification("Class III")[0], "III")

    def test_class_i_not_mistaken_for_ii(self):
        norm, raw = parse_recall_classification("Class II")
        self.assertEqual(norm, "II")
        self.assertEqual(raw, "Class II")


class MedicationProfileServiceTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="meds@example.com",
            password="x",
        )

    def test_filters_inactive_entries(self):
        MedicationProfile.objects.create(
            user=self.user,
            medications_raw="",
            extracted_medications=[
                {"name": "Keep", "status": "active"},
                {"name": "Drop", "status": "stopped"},
            ],
        )
        names = get_active_medication_names(self.user)
        self.assertEqual(names, ["Keep"])

    def test_core_drug_query_strips_dose(self):
        self.assertEqual(core_drug_query_term("Lisinopril 10mg"), "Lisinopril")

    def test_distinct_active_names_from_entries(self):
        names = distinct_active_names_from_entries(
            [
                {"name": "A", "status": "active"},
                {"name": "a", "status": "active"},
                {"name": "B", "status": "stopped"},
            ]
        )
        self.assertEqual(names, ["A"])

    def test_distinct_active_names_non_list(self):
        self.assertEqual(distinct_active_names_from_entries(None), [])


class OpenfdaRecallServiceTests(TestCase):
    def test_404_from_openfda_means_no_matches(self):
        fake_resp = MagicMock()
        fake_resp.status_code = 404
        mock_session = MagicMock()
        mock_session.get.return_value = fake_resp

        with patch(
            "api.services.openfda_recall_service.requests.Session"
        ) as sess_cls:
            sess_cls.return_value.__enter__.return_value = mock_session
            sess_cls.return_value.__exit__.return_value = None
            rows = fetch_recalls_for_medication("NonsenseDrugXYZ123")
        self.assertEqual(rows, [])

    def test_fetch_maps_rows(self):
        fake_resp = MagicMock()
        fake_resp.raise_for_status = lambda: None
        fake_resp.json.return_value = {
            "results": [
                {
                    "classification": "Class II",
                    "reason_for_recall": "Labeling",
                    "product_description": "Sample Drug",
                    "recall_number": "R-1",
                    "recall_initiation_date": "20200101",
                    "status": "Ongoing",
                    "recalling_firm": "Acme",
                    "event_id": "E1",
                }
            ]
        }
        mock_session = MagicMock()
        mock_session.get.return_value = fake_resp

        with patch(
            "api.services.openfda_recall_service.requests.Session"
        ) as sess_cls:
            sess_cls.return_value.__enter__.return_value = mock_session
            sess_cls.return_value.__exit__.return_value = None
            out = fetch_recalls_for_medications(["Demo Med"])

        self.assertEqual(len(out["recalls"]), 1)
        r = out["recalls"][0]
        self.assertEqual(r["classification"], "II")
        self.assertEqual(r["classification_raw"], "Class II")
        self.assertEqual(r["reason_for_recall"], "Labeling")
        self.assertEqual(r["profile_medication"], "Demo Med")


class MedicationRecallsAPITests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="api@example.com",
            password="x",
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    @patch("api.views.fetch_recalls_for_medications")
    def test_returns_payload_when_profile_exists(self, mock_fetch):
        MedicationProfile.objects.create(
            user=self.user,
            medications_raw="",
            extracted_medications=[{"name": "Aspirin"}],
        )
        mock_fetch.return_value = {
            "medications_checked": ["Aspirin"],
            "recalls": [],
            "errors": [],
        }
        res = self.client.get("/api/medications/recalls/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["medications_checked"], ["Aspirin"])
        mock_fetch.assert_called_once_with(["Aspirin"])

    def test_empty_profile_message(self):
        res = self.client.get("/api/medications/recalls/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["medications_checked"], [])
        self.assertIn("detail", res.data)
