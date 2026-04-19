from unittest.mock import patch

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from api.models import SymptomSession

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
        self.assertIn("session_id", res.data)
        self.assertEqual(SymptomSession.objects.filter(user=self.user).count(), 1)
        mock_complete.assert_called_once()

    @patch("api.views_symptom.complete_symptom_survey_turn")
    def test_second_survey_turn_reuses_session_id(self, mock_complete):
        mock_complete.side_effect = [
            '{"questions":[]}',
            '{"overall_patient_severity":"mild","conditions":[{"title":"Tension headache","explanation":"x","why_possible":"y","condition_severity":"mild"}],"care_taxonomy":{"suggested_care_setting":"PCP","taxonomy_codes":[],"rationale_for_routing":"z"}}',
        ]
        r1 = self.client.post(
            self.url,
            {
                "phase": "followup_questions",
                "system_prompt": "sys",
                "user_payload": {"symptoms": "headache", "insurance_label": "Test"},
            },
            format="json",
        )
        self.assertEqual(r1.status_code, status.HTTP_200_OK)
        sid = r1.data["session_id"]
        r2 = self.client.post(
            self.url,
            {
                "phase": "condition_assessment",
                "system_prompt": "sys",
                "user_payload": {"symptoms": "headache", "insurance_label": "Test"},
                "session_id": sid,
            },
            format="json",
        )
        self.assertEqual(r2.status_code, status.HTTP_200_OK)
        self.assertEqual(r2.data["session_id"], sid)
        self.assertEqual(SymptomSession.objects.filter(user=self.user).count(), 1)
        session = SymptomSession.objects.get(public_id=sid)
        self.assertEqual(session.triage_level, "routine")
        self.assertIsInstance(session.pre_visit_report, dict)

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
