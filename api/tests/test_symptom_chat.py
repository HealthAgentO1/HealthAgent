from unittest.mock import patch

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from api.models import SymptomSession

User = get_user_model()


class SymptomChatApiTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="chat@example.com",
            password="testpass123",
        )
        self.client.force_authenticate(user=self.user)
        self.url = "/api/symptom/chat/"

    @patch("api.views_symptom.run_symptom_turn")
    def test_chat_creates_session_and_persists_log(self, mock_llm):
        mock_llm.return_value = {
            "assistant_message": "Any fever?",
            "triage_level": "routine",
            "reasoning": "Gathering info; no red flags yet.",
            "interview_complete": False,
        }
        res = self.client.post(
            self.url,
            {"message": "Headache for two days."},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn("session_id", res.data)
        self.assertEqual(res.data["assistant_message"], "Any fever?")
        self.assertEqual(res.data["triage_level"], "routine")
        self.assertFalse(res.data["interview_complete"])
        self.assertEqual(res.data["turn_index"], 1)

        session = SymptomSession.objects.get(public_id=res.data["session_id"])
        self.assertEqual(session.user_id, self.user.id)
        self.assertEqual(len(session.ai_conversation_log), 2)
        self.assertEqual(session.ai_conversation_log[0]["role"], "user")
        self.assertEqual(session.triage_level, "routine")

        mock_llm.assert_called_once()

    @patch("api.views_symptom.run_symptom_turn")
    def test_chat_continues_session(self, mock_llm):
        mock_llm.return_value = {
            "assistant_message": "Thanks.",
            "triage_level": "routine",
            "reasoning": "ok",
            "interview_complete": True,
        }
        s = SymptomSession.objects.create(user=self.user)
        res = self.client.post(
            self.url,
            {"session_id": str(s.public_id), "message": "No fever."},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        s.refresh_from_db()
        self.assertEqual(len(s.ai_conversation_log), 2)
        self.assertEqual(res.data["turn_index"], 1)

    @patch("api.views_symptom.build_pre_visit_report")
    @patch("api.views_symptom.run_symptom_turn")
    def test_chat_generates_pre_visit_report_when_complete(self, mock_llm, mock_report):
        mock_llm.return_value = {
            "assistant_message": "Please tell me more about the pain.",
            "triage_level": "urgent",
            "reasoning": "Clinical concern due to worsening pain.",
            "interview_complete": True,
        }
        mock_report.return_value = {
            "chief_complaint": "Worsening abdominal pain.",
            "hpi": "The patient has had increasing lower abdominal pain for two days.",
            "triage_level": "urgent",
            "patient_description": "Adult patient presenting with abdominal discomfort.",
            "risk_factors": ["fever", "nausea"],
            "medications": [],
        }

        session = SymptomSession.objects.create(user=self.user)
        res = self.client.post(
            self.url,
            {"session_id": str(session.public_id), "message": "My abdomen hurts."},
            format="json",
        )

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        session.refresh_from_db()
        self.assertEqual(session.pre_visit_report["chief_complaint"], "Worsening abdominal pain.")
        mock_report.assert_called_once_with(session)
