import uuid

from django.conf import settings
from django.db import models


class ExampleItem(models.Model):
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class TriageLevel(models.TextChoices):
    EMERGENCY = "emergency", "Emergency"
    URGENT = "urgent", "Urgent"
    ROUTINE = "routine", "Routine"


class BookingStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    CONFIRMED = "confirmed", "Confirmed"
    CANCELLED = "cancelled", "Cancelled"
    COMPLETED = "completed", "Completed"


class SymptomSession(models.Model):
    public_id = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="symptom_sessions",
    )
    ai_conversation_log = models.JSONField(default=list)
    triage_level = models.CharField(
        max_length=32,
        choices=TriageLevel.choices,
        null=True,
        blank=True,
    )
    provider_npi = models.CharField(max_length=10, null=True, blank=True)
    insurance_details = models.JSONField(null=True, blank=True)
    booking_status = models.CharField(
        max_length=32,
        choices=BookingStatus.choices,
        default=BookingStatus.PENDING,
    )
    confirmation_number = models.CharField(max_length=20, null=True, blank=True)
    pre_visit_report = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"SymptomSession({self.pk}) for {self.user_id}"


class MedicationProfile(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="medication_profiles",
    )
    medications_raw = models.TextField()
    extracted_medications = models.JSONField(default=list)
    interaction_results = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"MedicationProfile({self.pk}) for {self.user_id}"
