"""
Regression: SymptomSessionViewSet must not expose or mutate other users' sessions.
"""

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from api.models import BookingStatus, SymptomSession

User = get_user_model()


class SymptomSessionViewSetIsolationTests(APITestCase):
    def setUp(self):
        self.user_a = User.objects.create_user(
            email="a@example.com",
            password="testpass123",
        )
        self.user_b = User.objects.create_user(
            email="b@example.com",
            password="testpass123",
        )
        self.session_b = SymptomSession.objects.create(
            user=self.user_b,
            triage_level="urgent",
            booking_status=BookingStatus.PENDING,
            ai_conversation_log=[],
        )
        self.list_url = "/api/symptom-sessions/"
        self.detail_b = f"/api/symptom-sessions/{self.session_b.pk}/"
        self.book_b = f"/api/symptom-sessions/{self.session_b.pk}/book/"

    def test_list_requires_authentication(self):
        res = self.client.get(self.list_url)
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_user_a_cannot_retrieve_user_b_session(self):
        self.client.force_authenticate(user=self.user_a)
        res = self.client.get(self.detail_b)
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_user_a_cannot_book_user_b_session(self):
        self.client.force_authenticate(user=self.user_a)
        res = self.client.post(self.book_b, {}, format="json")
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_user_a_cannot_delete_user_b_session(self):
        self.client.force_authenticate(user=self.user_a)
        res = self.client.delete(self.detail_b)
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_user_b_can_book_own_pending_session(self):
        self.client.force_authenticate(user=self.user_b)
        res = self.client.post(self.book_b, {}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.session_b.refresh_from_db()
        self.assertEqual(self.session_b.booking_status, BookingStatus.CONFIRMED)
        self.assertTrue(self.session_b.confirmation_number)

    def test_create_sets_request_user(self):
        self.client.force_authenticate(user=self.user_a)
        payload = {
            "insurance_details": {"plan": "PPO", "provider": "Test Health"},
            "ai_conversation_log": [],
        }
        res = self.client.post(self.list_url, payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        sid = res.data["id"]
        session = SymptomSession.objects.get(pk=sid)
        self.assertEqual(session.user_id, self.user_a.pk)
