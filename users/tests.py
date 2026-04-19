from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from users.constants import (
    MAX_EMAIL_LENGTH,
    MAX_FIRST_NAME_LENGTH,
    MAX_LAST_NAME_LENGTH,
    MAX_PASSWORD_LENGTH,
)

User = get_user_model()


class AuthApiTests(APITestCase):
    def setUp(self):
        self.register_url = "/api/auth/register/"
        self.token_url = "/api/token/"
        self.refresh_url = "/api/token/refresh/"
        self.items_url = "/api/items/"
        self.me_url = "/api/auth/me/"

    def test_me_requires_auth(self):
        res = self.client.get(self.me_url)
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_me_get_and_patch(self):
        u = User.objects.create_user(email="me@example.com", password="pass12345", first_name="Pat")
        access = self.client.post(
            self.token_url,
            {"email": "me@example.com", "password": "pass12345"},
            format="json",
        ).data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        res = self.client.get(self.me_url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["email"], "me@example.com")
        self.assertEqual(res.data["first_name"], "Pat")
        self.assertIsNone(res.data.get("default_address"))
        self.assertIsNone(res.data.get("default_insurance_slug"))
        patch = self.client.patch(
            self.me_url,
            {"first_name": "Pat", "last_name": "Lee", "date_of_birth": "1990-05-15"},
            format="json",
        )
        self.assertEqual(patch.status_code, status.HTTP_200_OK)
        self.assertEqual(patch.data["last_name"], "Lee")
        self.assertEqual(patch.data["date_of_birth"], "1990-05-15")
        u.refresh_from_db()
        self.assertEqual(u.last_name, "Lee")

    def test_me_patch_default_address(self):
        User.objects.create_user(email="addr@example.com", password="pass12345")
        access = self.client.post(
            self.token_url,
            {"email": "addr@example.com", "password": "pass12345"},
            format="json",
        ).data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        res = self.client.patch(
            self.me_url,
            {
                "default_address": {
                    "street": "100 Congress Ave",
                    "city": "Austin",
                    "state": "tx",
                    "postal_code": "78701",
                }
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["default_address"]["state"], "TX")
        self.assertEqual(res.data["default_address"]["postal_code"], "78701")
        u = User.objects.get(email="addr@example.com")
        self.assertEqual(u.default_address["city"], "Austin")

        clear = self.client.patch(self.me_url, {"default_address": None}, format="json")
        self.assertEqual(clear.status_code, status.HTTP_200_OK)
        self.assertIsNone(clear.data.get("default_address"))
        u.refresh_from_db()
        self.assertIsNone(u.default_address)

    def test_me_patch_default_insurance_slug(self):
        User.objects.create_user(email="ins@example.com", password="pass12345")
        access = self.client.post(
            self.token_url,
            {"email": "ins@example.com", "password": "pass12345"},
            format="json",
        ).data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        res = self.client.patch(
            self.me_url,
            {"default_insurance_slug": "aetna"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data.get("default_insurance_slug"), "aetna")
        u = User.objects.get(email="ins@example.com")
        self.assertEqual(u.default_insurance_slug, "aetna")

        clear = self.client.patch(self.me_url, {"default_insurance_slug": None}, format="json")
        self.assertEqual(clear.status_code, status.HTTP_200_OK)
        self.assertIsNone(clear.data.get("default_insurance_slug"))
        u.refresh_from_db()
        self.assertIsNone(u.default_insurance_slug)

    def test_me_rejects_invalid_insurance_slug(self):
        User.objects.create_user(email="badins@example.com", password="pass12345")
        access = self.client.post(
            self.token_url,
            {"email": "badins@example.com", "password": "pass12345"},
            format="json",
        ).data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        res = self.client.patch(
            self.me_url,
            {"default_insurance_slug": "not_a_real_carrier"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_me_rejects_future_birthdate(self):
        User.objects.create_user(email="future@example.com", password="pass12345")
        access = self.client.post(
            self.token_url,
            {"email": "future@example.com", "password": "pass12345"},
            format="json",
        ).data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        res = self.client.patch(
            self.me_url,
            {"date_of_birth": "2099-01-01"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_register_creates_user(self):
        response = self.client.post(
            self.register_url,
            {
                "email": "new@example.com",
                "password": "securepass123",
                "first_name": "Ada",
                "last_name": "Lovelace",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["email"], "new@example.com")
        self.assertIn("id", response.data)
        self.assertNotIn("password", response.data)
        self.assertTrue(User.objects.filter(email="new@example.com").exists())

    def test_register_rejects_password_over_max_length(self):
        email = "longpw@example.com"
        body = {
            "email": email,
            "password": "a" * (MAX_PASSWORD_LENGTH + 1),
            "first_name": "A",
            "last_name": "B",
        }
        res = self.client.post(self.register_url, body, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_register_rejects_email_over_max_length(self):
        # local part + "@example.com" (12 chars) must exceed MAX_EMAIL_LENGTH
        email = "a" * (MAX_EMAIL_LENGTH - 11) + "@example.com"
        self.assertGreater(len(email), MAX_EMAIL_LENGTH)
        res = self.client.post(
            self.register_url,
            {"email": email, "password": "12345678ab", "first_name": "A", "last_name": "B"},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_register_rejects_first_name_over_max_length(self):
        res = self.client.post(
            self.register_url,
            {
                "email": "longfirst@example.com",
                "password": "12345678ab",
                "first_name": "x" * (MAX_FIRST_NAME_LENGTH + 1),
                "last_name": "B",
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_register_rejects_last_name_over_max_length(self):
        res = self.client.post(
            self.register_url,
            {
                "email": "longlast@example.com",
                "password": "12345678ab",
                "first_name": "A",
                "last_name": "z" * (MAX_LAST_NAME_LENGTH + 1),
            },
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_me_rejects_first_name_over_max_length(self):
        User.objects.create_user(email="toolong@example.com", password="pass12345")
        access = self.client.post(
            self.token_url,
            {"email": "toolong@example.com", "password": "pass12345"},
            format="json",
        ).data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        res = self.client.patch(
            self.me_url,
            {"first_name": "y" * (MAX_FIRST_NAME_LENGTH + 1)},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_register_rejects_duplicate_email(self):
        User.objects.create_user(email="dup@example.com", password="somepass123")
        response = self.client.post(
            self.register_url,
            {"email": "dup@example.com", "password": "anotherpass123"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("email", response.data)

    def test_login_returns_access_and_refresh(self):
        User.objects.create_user(email="login@example.com", password="goodpass99")
        response = self.client.post(
            self.token_url,
            {"email": "login@example.com", "password": "goodpass99"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)

    def test_token_refresh_returns_new_access(self):
        User.objects.create_user(email="refresh@example.com", password="goodpass99")
        token_response = self.client.post(
            self.token_url,
            {"email": "refresh@example.com", "password": "goodpass99"},
            format="json",
        )
        refresh = token_response.data["refresh"]
        refresh_response = self.client.post(
            self.refresh_url,
            {"refresh": refresh},
            format="json",
        )
        self.assertEqual(refresh_response.status_code, status.HTTP_200_OK)
        self.assertIn("access", refresh_response.data)

    def test_protected_route_requires_jwt(self):
        response = self.client.get(self.items_url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_protected_route_accepts_valid_jwt(self):
        User.objects.create_user(email="member@example.com", password="memberpass1")
        token_response = self.client.post(
            self.token_url,
            {"email": "member@example.com", "password": "memberpass1"},
            format="json",
        )
        access = token_response.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        response = self.client.get(self.items_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
