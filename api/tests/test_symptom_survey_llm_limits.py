"""
Caps, server-side prompts, error mapping, and throttling for SymptomSurveyLlmView.
"""

from unittest.mock import MagicMock, patch

from django.conf import settings
from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework import status
from rest_framework.test import APIClient
from rest_framework.throttling import ScopedRateThrottle

from api.views_symptom import SymptomSurveyLlmView
from api.services.symptom_llm import (
    classify_survey_llm_exception,
    get_survey_system_prompt_for_phase,
)

User = get_user_model()


class SurveyLlmClassifyExceptionTests(TestCase):
    def test_classify_transport(self):
        try:
            from openai import APIConnectionError
        except ImportError:
            self.skipTest("openai not installed")
        req = MagicMock()
        exc = APIConnectionError(message="reset", request=req)
        self.assertEqual(classify_survey_llm_exception(exc), "transport")


class SymptomSurveyLlmLimitsTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="limits@example.com",
            password="testpass123",
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.url = "/api/symptom/survey-llm/"

    def test_user_payload_too_large_returns_400(self):
        big = "x" * (settings.SYMPTOM_SURVEY_MAX_USER_PAYLOAD_BYTES + 10)
        payload = {
            "phase": "followup_questions",
            "system_prompt": "You return JSON only.",
            "user_payload": {"symptoms": big, "insurance_label": "Test"},
        }
        res = self.client.post(self.url, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("user_payload", str(res.data).lower())

    @override_settings(SYMPTOM_SURVEY_USE_SERVER_PROMPTS=True)
    @patch("api.views_symptom.complete_symptom_survey_turn")
    def test_server_prompt_mode_ignores_client_system_prompt(self, mock_complete):
        mock_complete.return_value = '{"questions":[]}'
        expected = get_survey_system_prompt_for_phase("followup_questions")
        res = self.client.post(
            self.url,
            {
                "phase": "followup_questions",
                "system_prompt": "THIS SHOULD BE IGNORED IN SERVER MODE",
                "user_payload": {"symptoms": "headache", "insurance_label": "Test"},
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        mock_complete.assert_called_once()
        used_prompt, _payload = mock_complete.call_args[0]
        self.assertEqual(used_prompt, expected)
        self.assertNotIn("IGNORED", used_prompt)

    @patch("api.views_symptom.complete_symptom_survey_turn")
    def test_transport_error_returns_503_distinct_detail(self, mock_complete):
        try:
            from openai import APIConnectionError
        except ImportError:
            self.skipTest("openai not installed")
        req = MagicMock()
        mock_complete.side_effect = APIConnectionError(message="conn", request=req)
        res = self.client.post(
            self.url,
            {
                "phase": "followup_questions",
                "system_prompt": "sys",
                "user_payload": {"symptoms": "x", "insurance_label": "T"},
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertIn("reach", res.data["detail"].lower())

    def test_view_registers_scoped_throttle(self):
        self.assertEqual(SymptomSurveyLlmView.throttle_scope, "symptom_survey_llm")
        self.assertIn(ScopedRateThrottle, SymptomSurveyLlmView.throttle_classes)
        rates = settings.REST_FRAMEWORK.get("DEFAULT_THROTTLE_RATES", {})
        self.assertIn("symptom_survey_llm", rates)
