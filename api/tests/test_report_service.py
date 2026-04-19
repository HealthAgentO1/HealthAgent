import json
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase

from api.models import MedicationProfile, SymptomSession
from api.services.report_service import (
    build_pre_visit_report,
    medication_lines_for_session,
    merge_profile_and_llm_medications,
)

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

    @patch("api.services.report_service.complete_llm_chat")
    def test_build_pre_visit_report_merges_profile_and_llm_medications(self, mock_complete):
        session = SymptomSession.objects.create(
            user=self.user,
            ai_conversation_log=[
                {"role": "user", "content": "Headache.", "timestamp": "2026-01-01T00:00:00Z"},
            ],
            triage_level="routine",
        )
        MedicationProfile.objects.create(
            user=self.user,
            medications_raw="Lisinopril",
            extracted_medications=[{"name": "Lisinopril"}],
        )
        mock_complete.return_value = json.dumps(
            {
                "chief_complaint": "Headache.",
                "hpi": "Patient reports headache.",
                "triage_level": "routine",
                "patient_description": "Adult.",
                "risk_factors": [],
                "medications": ["Aspirin", "lisinopril"],
            }
        )

        report = build_pre_visit_report(session)

        self.assertEqual(report["medications"], ["Lisinopril", "Aspirin"])

    def test_merge_profile_and_llm_medications_dedupes_case_insensitive(self):
        merged = merge_profile_and_llm_medications(
            ["Lisinopril", "Metformin"],
            ["metformin", "Aspirin"],
        )
        self.assertEqual(merged, ["Lisinopril", "Metformin", "Aspirin"])

    def test_merge_dedupes_short_llm_name_when_profile_has_detail_line(self):
        merged = merge_profile_and_llm_medications(
            ["Lisinopril — dosage: 10 mg; frequency: daily"],
            ["lisinopril", "Aspirin"],
        )
        self.assertEqual(merged, ["Lisinopril — dosage: 10 mg; frequency: daily", "Aspirin"])

    def test_merge_dedupes_llm_prose_lines_against_formatted_profile(self):
        merged = merge_profile_and_llm_medications(
            [
                "Adderall — dosage: 10 mg; frequency: 1x daily; time: morning with food; refill: 14 days; generic: amphetamine salts",
                "ibuprofen — dosage: 500 mg; frequency: 5x daily; time: with food; refill: 1 day",
            ],
            [
                "Adderall 10 mg daily in the morning with food",
                "ibuprofen 500 mg 5 times daily with food",
            ],
        )
        self.assertEqual(len(merged), 2)
        self.assertTrue(merged[0].startswith("Adderall —"))
        self.assertTrue(merged[1].startswith("ibuprofen —"))

    def test_medication_lines_for_session_uses_active_medications_payload(self):
        session = SymptomSession.objects.create(
            user=self.user,
            ai_conversation_log=[
                {
                    "role": "survey_turn",
                    "phase": "condition_assessment",
                    "user_payload": {
                        "symptoms": "cough",
                        "active_medications": [
                            {
                                "name": "Metformin",
                                "dosage_mg": "500",
                                "frequency": "twice daily",
                                "time_to_take": "morning",
                                "refill_before": "14 days",
                            },
                            {"name": "Aspirin"},
                        ],
                    },
                },
            ],
        )
        MedicationProfile.objects.create(
            user=self.user,
            medications_raw="OnlyFromProfile",
            extracted_medications=[{"name": "OnlyFromProfile"}],
        )
        lines = medication_lines_for_session(session)
        self.assertEqual(len(lines), 2)
        self.assertIn("Metformin", lines[0])
        self.assertIn("500", lines[0])
        self.assertIn("twice daily", lines[0])
        self.assertIn("morning", lines[0])
        self.assertIn("14 days", lines[0])
        self.assertEqual(lines[1], "Aspirin")
