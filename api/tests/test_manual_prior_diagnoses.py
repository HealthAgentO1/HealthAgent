from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from api.models import ManualPriorDiagnosis

User = get_user_model()


class ManualPriorDiagnosisApiTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user("patient@example.com", "testpass123")
        self.other = User.objects.create_user("other@example.com", "testpass123")
        self.client.force_authenticate(user=self.user)
        self.list_url = "/api/prior-diagnoses/"

    def test_list_empty(self):
        res = self.client.get(self.list_url)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data, [])

    def test_create_and_list(self):
        res = self.client.post(self.list_url, {"text": "  Type 2 diabetes  "}, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data["text"], "Type 2 diabetes")
        self.assertIn("diagnosis_id", res.data)
        self.assertIn("created_at", res.data)

        listed = self.client.get(self.list_url)
        self.assertEqual(listed.status_code, status.HTTP_200_OK)
        self.assertEqual(len(listed.data), 1)
        self.assertEqual(listed.data[0]["text"], "Type 2 diabetes")

    def test_create_rejects_blank(self):
        res = self.client.post(self.list_url, {"text": "   "}, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_delete_own_row(self):
        row = ManualPriorDiagnosis.objects.create(user=self.user, text="Asthma")
        url = f"/api/prior-diagnoses/{row.public_id}/"
        res = self.client.delete(url)
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(ManualPriorDiagnosis.objects.filter(pk=row.pk).exists())

    def test_cannot_delete_other_users_row(self):
        row = ManualPriorDiagnosis.objects.create(user=self.other, text="Secret")
        url = f"/api/prior-diagnoses/{row.public_id}/"
        res = self.client.delete(url)
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)
        self.assertTrue(ManualPriorDiagnosis.objects.filter(pk=row.pk).exists())
