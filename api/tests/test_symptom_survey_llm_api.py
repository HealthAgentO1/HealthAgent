from unittest.mock import patch

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

User = get_user_model()


class SymptomSurveyLlmApiTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="survey@example.com",
            password="testpass123",
        )
        self.client.force_authenticate(user=self.user)
        self.url = "/api/symptom/survey-llm/"

    @patch("api.views_symptom.complete_symptom_survey_turn")
    def test_survey_returns_raw_text(self, mock_complete):
        mock_complete.return_value = '{"questions":[]}'
        res = self.client.post(
            self.url,
            {
                "phase": "followup_questions",
                "system_prompt": "You return JSON only.",
                "user_payload": {"symptoms": "headache", "insurance_label": "Test"},
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["raw_text"], '{"questions":[]}')
        self.assertEqual(res.data["phase"], "followup_questions")
        mock_complete.assert_called_once()

    def test_survey_requires_auth(self):
        bare = APIClient()
        res = bare.post(
            self.url,
            {
                "phase": "followup_questions",
                "system_prompt": "x",
                "user_payload": {},
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)
