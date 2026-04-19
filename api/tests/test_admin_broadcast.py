from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework import status
from rest_framework.test import APIClient

User = get_user_model()


@override_settings(
    BROADCAST_ADMIN_EMAIL="admin@example.com",
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    DEFAULT_FROM_EMAIL="Test <test@example.com>",
)
class AdminBroadcastEmailTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        User.objects.create_user("admin@example.com", "pw-admin")
        User.objects.create_user("user@example.com", "pw-user")

    def test_eligibility_true_for_admin(self):
        self.client.force_authenticate(user=User.objects.get(email="admin@example.com"))
        res = self.client.get("/api/admin/broadcast-eligibility/")
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data["eligible"])
        self.assertTrue(res.data["configured"])

    def test_eligibility_false_for_other_user(self):
        self.client.force_authenticate(user=User.objects.get(email="user@example.com"))
        res = self.client.get("/api/admin/broadcast-eligibility/")
        self.assertEqual(res.status_code, 200)
        self.assertFalse(res.data["eligible"])
        self.assertTrue(res.data["configured"])

    @override_settings(BROADCAST_ADMIN_EMAIL="")
    def test_eligibility_when_unconfigured(self):
        self.client.force_authenticate(user=User.objects.get(email="admin@example.com"))
        res = self.client.get("/api/admin/broadcast-eligibility/")
        self.assertEqual(res.status_code, 200)
        self.assertFalse(res.data["eligible"])
        self.assertFalse(res.data["configured"])

    def test_forbidden_for_non_admin(self):
        self.client.force_authenticate(user=User.objects.get(email="user@example.com"))
        res = self.client.post(
            "/api/admin/broadcast-email/",
            {"subject": "Hi", "message": "Body"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_sends_to_all_users(self):
        self.client.force_authenticate(user=User.objects.get(email="admin@example.com"))
        res = self.client.post(
            "/api/admin/broadcast-email/",
            {"subject": "Announcement", "message": "Hello everyone."},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["sent"], 2)
