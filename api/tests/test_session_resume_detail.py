import uuid

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from api.models import SymptomSession

User = get_user_model()


class SymptomSessionResumeDetailTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="resume@example.com",
            password="testpass123",
        )
        self.other = User.objects.create_user(
            email="other2@example.com",
            password="testpass123",
        )
        self.client.force_authenticate(user=self.user)

    def test_requires_auth(self):
        bare = APIClient()
        sid = str(uuid.uuid4())
        res = bare.get(f"/api/sessions/{sid}/")
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)
        res_del = bare.delete(f"/api/sessions/{sid}/")
        self.assertEqual(res_del.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_404_wrong_user(self):
        s = SymptomSession.objects.create(user=self.other)
        res = self.client.get(f"/api/sessions/{s.public_id}/")
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)
        res_del = self.client.delete(f"/api/sessions/{s.public_id}/")
        self.assertEqual(res_del.status_code, status.HTTP_404_NOT_FOUND)

    def test_delete_own_session(self):
        s = SymptomSession.objects.create(
            user=self.user,
            ai_conversation_log=[
                {"role": "user", "content": "x", "timestamp": "2026-01-01T00:00:00"},
            ],
        )
        pk = s.pk
        res = self.client.delete(f"/api/sessions/{s.public_id}/")
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(SymptomSession.objects.filter(pk=pk).exists())

    def test_resume_followup_one_survey_turn(self):
        s = SymptomSession.objects.create(
            user=self.user,
            ai_conversation_log=[
                {
                    "role": "survey_turn",
                    "phase": "followup_questions",
                    "user_payload": {
                        "symptoms": "cough",
                        "insurance_label": "Aetna",
                        "practice_location": {
                            "street": "123 Main St",
                            "city": "Boston",
                            "state": "MA",
                            "postal_code": "02108",
                        },
                    },
                    "raw_text": '{"questions":[{"id":"q1","prompt":"Dry?","required":true,"input_type":"single_choice","options":[{"id":"y","label":"Yes"},{"id":"n","label":"No"}]}]}',
                }
            ],
        )
        res = self.client.get(f"/api/sessions/{s.public_id}/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["resume_step"], "followup")
        self.assertEqual(res.data["symptoms"], "cough")
        self.assertIn("followup_raw_text", res.data)
        self.assertEqual(res.data.get("practice_location", {}).get("city"), "Boston")

    def test_resume_results_two_survey_turns(self):
        s = SymptomSession.objects.create(
            user=self.user,
            triage_level="routine",
            ai_conversation_log=[
                {
                    "role": "survey_turn",
                    "phase": "followup_questions",
                    "user_payload": {"symptoms": "headache", "insurance_label": "United Healthcare"},
                    "raw_text": '{"questions":[{"id":"q1","prompt":"Fever?","required":true,"input_type":"single_choice","options":[{"id":"y","label":"Yes"},{"id":"n","label":"No"}]}]}',
                },
                {
                    "role": "survey_turn",
                    "phase": "condition_assessment",
                    "user_payload": {
                        "symptoms": "headache",
                        "insurance_label": "United Healthcare",
                        "practice_location": {
                            "street": "9 DeKalb Ave",
                            "city": "Brooklyn",
                            "state": "NY",
                            "postal_code": "11201",
                        },
                    },
                    "raw_text": '{"overall_patient_severity":"mild","conditions":[{"title":"Tension","explanation":"x","why_possible":"y","condition_severity":"mild"}],"care_taxonomy":{"suggested_care_setting":"PCP","taxonomy_codes":[],"rationale_for_routing":"z"}}',
                },
            ],
        )
        res = self.client.get(f"/api/sessions/{s.public_id}/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["resume_step"], "results")
        self.assertIn("results_raw_text", res.data)
        self.assertIn("followup_raw_text", res.data)
        self.assertEqual(res.data.get("practice_location", {}).get("postal_code"), "11201")

    def test_resume_results_falls_back_to_followup_practice_location(self):
        """Older logs may omit practice_location on condition_assessment; intake address is on followup."""
        s = SymptomSession.objects.create(
            user=self.user,
            triage_level="routine",
            ai_conversation_log=[
                {
                    "role": "survey_turn",
                    "phase": "followup_questions",
                    "user_payload": {
                        "symptoms": "headache",
                        "insurance_label": "United Healthcare",
                        "practice_location": {
                            "street": "9 DeKalb Ave",
                            "city": "Brooklyn",
                            "state": "NY",
                            "postal_code": "11201",
                        },
                    },
                    "raw_text": '{"questions":[{"id":"q1","prompt":"Fever?","required":true,"input_type":"single_choice","options":[{"id":"y","label":"Yes"},{"id":"n","label":"No"}]}]}',
                },
                {
                    "role": "survey_turn",
                    "phase": "condition_assessment",
                    "user_payload": {
                        "symptoms": "headache",
                        "insurance_label": "United Healthcare",
                    },
                    "raw_text": '{"overall_patient_severity":"mild","conditions":[{"title":"Tension","explanation":"x","why_possible":"y","condition_severity":"mild"}],"care_taxonomy":{"suggested_care_setting":"PCP","taxonomy_codes":[],"rationale_for_routing":"z"}}',
                },
            ],
        )
        res = self.client.get(f"/api/sessions/{s.public_id}/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["resume_step"], "results")
        self.assertEqual(res.data.get("practice_location", {}).get("city"), "Brooklyn")

    def test_resume_accepts_zip_plus_four_and_numeric_postal(self):
        s = SymptomSession.objects.create(
            user=self.user,
            triage_level="routine",
            ai_conversation_log=[
                {
                    "role": "survey_turn",
                    "phase": "followup_questions",
                    "user_payload": {
                        "symptoms": "cough",
                        "insurance_label": "Aetna",
                        "practice_location": {
                            "street": "123 Main St",
                            "city": "Boston",
                            "state": "MA",
                            "postal_code": "02108-1234",
                        },
                    },
                    "raw_text": '{"questions":[{"id":"q1","prompt":"Dry?","required":true,"input_type":"single_choice","options":[{"id":"y","label":"Yes"},{"id":"n","label":"No"}]}]}',
                },
                {
                    "role": "survey_turn",
                    "phase": "condition_assessment",
                    "user_payload": {
                        "symptoms": "cough",
                        "insurance_label": "Aetna",
                        "practice_location": {
                            "street": "456 Oak Rd",
                            "city": "Cambridge",
                            "state": "MA",
                            "postal_code": 2142,
                        },
                    },
                    "raw_text": '{"overall_patient_severity":"mild","conditions":[{"title":"Cold","explanation":"x","why_possible":"y","condition_severity":"mild"}],"care_taxonomy":{"suggested_care_setting":"PCP","taxonomy_codes":[],"rationale_for_routing":"z"}}',
                },
            ],
        )
        res = self.client.get(f"/api/sessions/{s.public_id}/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        # Newest turn with a valid block wins (condition_assessment); numeric ZIP normalizes.
        self.assertEqual(res.data.get("practice_location", {}).get("postal_code"), "02142")
        self.assertEqual(res.data.get("practice_location", {}).get("city"), "Cambridge")

    def test_resume_results_includes_price_estimate_raw_text(self):
        price_json = '{"cost_range_label":"~$50–$200","cost_range_explanation":"Cached line."}'
        s = SymptomSession.objects.create(
            user=self.user,
            triage_level="routine",
            ai_conversation_log=[
                {
                    "role": "survey_turn",
                    "phase": "followup_questions",
                    "user_payload": {"symptoms": "headache", "insurance_label": "United Healthcare"},
                    "raw_text": '{"questions":[{"id":"q1","prompt":"Fever?","required":true,"input_type":"single_choice","options":[{"id":"y","label":"Yes"},{"id":"n","label":"No"}]}]}',
                },
                {
                    "role": "survey_turn",
                    "phase": "condition_assessment",
                    "user_payload": {"symptoms": "headache", "insurance_label": "United Healthcare"},
                    "raw_text": '{"overall_patient_severity":"mild","conditions":[{"title":"Tension","explanation":"x","why_possible":"y","condition_severity":"mild"}],"care_taxonomy":{"suggested_care_setting":"PCP","taxonomy_codes":[],"rationale_for_routing":"z"}}',
                },
                {
                    "role": "survey_turn",
                    "phase": "price_estimate_context",
                    "user_payload": {},
                    "raw_text": price_json,
                },
            ],
        )
        res = self.client.get(f"/api/sessions/{s.public_id}/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["resume_step"], "results")
        self.assertEqual(res.data.get("price_estimate_raw_text"), price_json)

    def test_resume_chat(self):
        s = SymptomSession.objects.create(
            user=self.user,
            ai_conversation_log=[
                {"role": "user", "content": "My throat hurts.", "timestamp": "2026-01-01T00:00:00"},
                {"role": "assistant", "content": "Any fever?", "timestamp": "2026-01-01T00:00:01"},
            ],
        )
        res = self.client.get(f"/api/sessions/{s.public_id}/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["resume_step"], "chat")
        self.assertEqual(res.data["symptoms"], "My throat hurts.")
