from unittest.mock import patch

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

User = get_user_model()


class SymptomNearbyFacilitiesApiTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="nearby@example.com",
            password="testpass123",
        )
        self.client.force_authenticate(user=self.user)
        self.url = "/api/symptom/nearby-facilities/"

    @patch("api.views_symptom.find_nearby_facilities")
    def test_post_returns_facilities(self, mock_find):
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
        self.assertEqual(res.data["taxonomy_used"], "282N00000X")
        self.assertEqual(len(res.data["facilities"]), 1)
        self.assertEqual(res.data["facilities"][0]["npi"], "1234567890")
        mock_find.assert_called_once()
        kwargs = mock_find.call_args.kwargs
        self.assertEqual(kwargs.get("suggested_care_setting"), "emergency_department")

    @patch("api.views_symptom.find_nearby_facilities")
    def test_value_error_returns_400(self, mock_find):
        mock_find.side_effect = ValueError("bad address")
        res = self.client.post(
            self.url,
            {
                "street": "x",
                "city": "Austin",
                "state": "TX",
                "postal_code": "78701",
                "taxonomy_codes": [],
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("detail", res.data)

    def test_requires_auth(self):
        bare = APIClient()
        res = bare.post(self.url, {}, format="json")
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)
