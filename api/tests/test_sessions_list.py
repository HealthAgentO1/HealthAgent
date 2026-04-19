from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from api.models import SymptomSession

User = get_user_model()


class SymptomSessionsListApiTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email="sessions@example.com",
            password="testpass123",
        )
        self.other = User.objects.create_user(
            email="other@example.com",
            password="testpass123",
        )
        self.url = "/api/sessions/"

    def test_requires_auth(self):
        res = self.client.get(self.url)
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_returns_empty_list(self):
        self.client.force_authenticate(user=self.user)
        res = self.client.get(self.url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data, [])

    def test_lists_own_sessions_newest_first(self):
        older = SymptomSession.objects.create(
            user=self.user,
            triage_level="routine",
            ai_conversation_log=[
                {"role": "user", "content": "Mild cough.", "timestamp": "2026-01-01T00:00:00"},
            ],
        )
        newer = SymptomSession.objects.create(
            user=self.user,
            triage_level="urgent",
            pre_visit_report={"patient_summary": "Severe abdominal pain."},
            ai_conversation_log=[],
        )
        self.client.force_authenticate(user=self.user)
        res = self.client.get(self.url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data), 2)
        self.assertEqual(res.data[0]["session_id"], str(newer.public_id))
        self.assertEqual(res.data[0]["triage_level"], "urgent")
        self.assertEqual(res.data[0]["summary"], "Severe abdominal pain.")
        self.assertEqual(
            res.data[0]["pre_visit_report"],
            {"patient_summary": "Severe abdominal pain."},
        )
        self.assertEqual(res.data[1]["session_id"], str(older.public_id))
        self.assertEqual(res.data[1]["summary"], "Mild cough.")
        self.assertIsNone(res.data[0].get("post_visit_diagnosis"))
        self.assertIsNone(res.data[1].get("post_visit_diagnosis"))

    def test_does_not_include_other_users_sessions(self):
        SymptomSession.objects.create(user=self.other, triage_level="emergency")
        self.client.force_authenticate(user=self.user)
        res = self.client.get(self.url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data, [])
