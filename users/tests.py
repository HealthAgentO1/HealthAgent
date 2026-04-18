from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

User = get_user_model()


class AuthApiTests(APITestCase):
    def setUp(self):
        self.register_url = "/api/auth/register/"
        self.token_url = "/api/token/"
        self.refresh_url = "/api/token/refresh/"
        self.items_url = "/api/items/"

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

    def test_register_rejects_duplicate_email(self):
        User.objects.create_user(email="dup@example.com", password="somepass123")
        response = self.client.post(
            self.register_url,
            {"email": "dup@example.com", "password": "anotherpass123"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

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
