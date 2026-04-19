from unittest.mock import patch

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from api.models import InsurerNetworkNpi

User = get_user_model()


class SymptomNearbyInNetworkTests(APITestCase):
    def setUp(self) -> None:
        self.user = User.objects.create_user(
            email="innet@example.com",
            password="testpass123",
        )
        self.client.force_authenticate(user=self.user)
        self.url = "/api/symptom/nearby-facilities/"

    @patch("api.views_symptom.find_nearby_facilities")
    def test_insurer_slug_marks_in_network(self, mock_find) -> None:
        InsurerNetworkNpi.objects.create(insurer_slug="centene", npi="1234567890")
        mock_find.return_value = {
            "facilities": [
                {
                    "npi": "1234567890",
                    "name": "Test Hospital",
                    "address_line": "1 Main St, Austin, TX 78701",
                    "distance_miles": 1.23,
                    "distance_label": "1.2 mi",
                    "taxonomy_code": "282N00000X",
                    "taxonomy_description": "General Acute Care Hospital",
                    "relevance_score": 12.5,
                },
                {
                    "npi": "9999999999",
                    "name": "Other",
                    "address_line": "2 Main St, Austin, TX 78701",
                    "distance_miles": 2.0,
                    "distance_label": "2.0 mi",
                    "taxonomy_code": "282N00000X",
                    "taxonomy_description": "General Acute Care Hospital",
                    "relevance_score": 10.0,
                },
            ],
            "taxonomy_used": "282N00000X",
        }
        res = self.client.post(
            self.url,
            {
                "street": "100 Congress Ave",
                "city": "Austin",
                "state": "TX",
                "postal_code": "78701",
                "taxonomy_codes": ["282N00000X"],
                "suggested_care_setting": "emergency_department",
                "insurer_slug": "centene",
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data["facilities"][0]["in_network"])
        self.assertFalse(res.data["facilities"][1]["in_network"])

    @patch("api.views_symptom.find_nearby_facilities")
    def test_omit_insurer_slug_sets_null(self, mock_find) -> None:
        mock_find.return_value = {
            "facilities": [
                {
                    "npi": "1234567890",
                    "name": "Test Hospital",
                    "address_line": "1 Main St, Austin, TX 78701",
                    "distance_miles": 1.23,
                    "distance_label": "1.2 mi",
                    "taxonomy_code": "282N00000X",
                    "taxonomy_description": "General Acute Care Hospital",
                    "relevance_score": 12.5,
                },
            ],
            "taxonomy_used": "282N00000X",
        }
        res = self.client.post(
            self.url,
            {
                "street": "100 Congress Ave",
                "city": "Austin",
                "state": "TX",
                "postal_code": "78701",
                "taxonomy_codes": ["282N00000X"],
                "suggested_care_setting": "emergency_department",
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIsNone(res.data["facilities"][0]["in_network"])

    @patch("api.views_symptom.find_nearby_facilities")
    def test_insurer_slug_without_projection_sets_null(self, mock_find) -> None:
        mock_find.return_value = {
            "facilities": [
                {
                    "npi": "1234567890",
                    "name": "Test Hospital",
                    "address_line": "1 Main St, Austin, TX 78701",
                    "distance_miles": 1.23,
                    "distance_label": "1.2 mi",
                    "taxonomy_code": "282N00000X",
                    "taxonomy_description": "General Acute Care Hospital",
                    "relevance_score": 12.5,
                },
            ],
            "taxonomy_used": "282N00000X",
        }
        res = self.client.post(
            self.url,
            {
                "street": "100 Congress Ave",
                "city": "Austin",
                "state": "TX",
                "postal_code": "78701",
                "taxonomy_codes": ["282N00000X"],
                "suggested_care_setting": "emergency_department",
                "insurer_slug": "unitedhealthcare",
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIsNone(res.data["facilities"][0]["in_network"])

    @patch("api.views_symptom.find_nearby_facilities")
    def test_fidelis_skips_facility_match_returns_null(self, mock_find) -> None:
        """Fidelis projection is NPI-1-heavy; NPPES nearby uses NPI-2 org sites — do not mark all false."""
        InsurerNetworkNpi.objects.create(insurer_slug="fidelis", npi="1234567890")
        mock_find.return_value = {
            "facilities": [
                {
                    "npi": "1234567890",
                    "name": "Test Hospital",
                    "address_line": "1 Main St, Austin, TX 78701",
                    "distance_miles": 1.23,
                    "distance_label": "1.2 mi",
                    "taxonomy_code": "282N00000X",
                    "taxonomy_description": "General Acute Care Hospital",
                    "relevance_score": 12.5,
                },
            ],
            "taxonomy_used": "282N00000X",
        }
        res = self.client.post(
            self.url,
            {
                "street": "100 Congress Ave",
                "city": "Austin",
                "state": "TX",
                "postal_code": "78701",
                "taxonomy_codes": ["282N00000X"],
                "suggested_care_setting": "emergency_department",
                "insurer_slug": "fidelis",
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIsNone(res.data["facilities"][0]["in_network"])

    @patch("api.views_symptom.find_nearby_facilities")
    def test_insurer_slug_other_sets_null(self, mock_find) -> None:
        mock_find.return_value = {
            "facilities": [
                {
                    "npi": "1234567890",
                    "name": "Test Hospital",
                    "address_line": "1 Main St, Austin, TX 78701",
                    "distance_miles": 1.23,
                    "distance_label": "1.2 mi",
                    "taxonomy_code": "282N00000X",
                    "taxonomy_description": "General Acute Care Hospital",
                    "relevance_score": 12.5,
                },
            ],
            "taxonomy_used": "282N00000X",
        }
        InsurerNetworkNpi.objects.create(insurer_slug="centene", npi="1234567890")
        res = self.client.post(
            self.url,
            {
                "street": "100 Congress Ave",
                "city": "Austin",
                "state": "TX",
                "postal_code": "78701",
                "taxonomy_codes": ["282N00000X"],
                "suggested_care_setting": "emergency_department",
                "insurer_slug": "other",
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIsNone(res.data["facilities"][0]["in_network"])

    def test_invalid_insurer_slug_400(self) -> None:
        bare = APIClient()
        bare.force_authenticate(user=self.user)
        res = bare.post(
            self.url,
            {
                "street": "100 Congress Ave",
                "city": "Austin",
                "state": "TX",
                "postal_code": "78701",
                "taxonomy_codes": ["282N00000X"],
                "suggested_care_setting": "emergency_department",
                "insurer_slug": "not_a_real_slug",
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
