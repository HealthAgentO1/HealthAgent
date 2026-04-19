import json
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase

from api.models import MedicationProfile, SymptomSession
from api.services.report_service import build_pre_visit_report

User = get_user_model()


class ReportServiceTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="report@example.com",
            password="testpass123",
        )

    @patch("api.services.report_service.complete_llm_chat")
    def test_build_pre_visit_report_parses_llm_json(self, mock_complete):
        session = SymptomSession.objects.create(
            user=self.user,
            ai_conversation_log=[
                {"role": "user", "content": "I have chest pain.", "timestamp": "2026-01-01T00:00:00Z"},
                {"role": "assistant", "content": "How long has it lasted?", "timestamp": "2026-01-01T00:00:05Z"},
                {"role": "user", "content": "About two hours.", "timestamp": "2026-01-01T00:00:10Z"},
            ],
            triage_level="urgent",
        )
        mock_complete.return_value = json.dumps(
            {
                "chief_complaint": "Chest pain lasting two hours.",
                "hpi": "Patient reports chest pain for two hours with no radiation.",
                "triage_level": "urgent",
                "patient_description": "Adult with acute chest pain.",
                "risk_factors": ["chest pain"],
                "medications": ["aspirin"],
            }
        )

        report = build_pre_visit_report(session)

        self.assertEqual(report["chief_complaint"], "Chest pain lasting two hours.")
        self.assertEqual(report["triage_level"], "urgent")
        self.assertEqual(report["risk_factors"], ["chest pain"])
        self.assertEqual(report["medications"], ["aspirin"])
        mock_complete.assert_called_once()

    @patch("api.services.report_service.complete_llm_chat")
    def test_build_pre_visit_report_includes_medication_profile_when_model_returns_empty_medications(self, mock_complete):
        session = SymptomSession.objects.create(
            user=self.user,
            ai_conversation_log=[
                {"role": "user", "content": "I need my medication list added.", "timestamp": "2026-01-01T00:00:00Z"},
                {"role": "assistant", "content": "Please describe your current medications.", "timestamp": "2026-01-01T00:00:05Z"},
            ],
            triage_level="routine",
        )
        MedicationProfile.objects.create(
            user=self.user,
            medications_raw="Lisinopril 10mg\nMetformin 500mg",
            extracted_medications=[{"name": "Lisinopril"}, {"name": "Metformin"}],
        )
        mock_complete.return_value = json.dumps(
            {
                "chief_complaint": "Medication review.",
                "hpi": "Patient asked to document current medications.",
                "triage_level": "routine",
                "patient_description": "Patient requesting medication summary.",
                "risk_factors": [],
                "medications": [],
            }
        )

        report = build_pre_visit_report(session)

        self.assertEqual(report["medications"], ["Lisinopril", "Metformin"])
        mock_complete.assert_called_once()
