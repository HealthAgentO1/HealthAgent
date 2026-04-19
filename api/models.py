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
    # After a visit, the patient may record the clinician-assigned diagnosis (see post-visit PATCH).
    # JSON shape: {"text": str, "source": "llm_condition"|"custom", "matched_condition_title": str|None}
    post_visit_diagnosis = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"SymptomSession({self.pk}) for {self.user_id}"


class ManualPriorDiagnosis(models.Model):
    """
    Patient-entered diagnosis labels for optional Symptom Check context (`prior_official_diagnoses`),
    independent of a specific symptom session's post-visit diagnosis.
    """

    public_id = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="manual_prior_diagnoses",
    )
    text = models.CharField(max_length=500)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at", "-pk")

    def __str__(self) -> str:
        return f"ManualPriorDiagnosis({self.public_id}) for {self.user_id}"


class InsurerNetworkNpi(models.Model):
    """
    Offline-ingested US payer transparency (CMS TIC) projection: organizational NPIs
    observed in-network for a coarse insurer bucket (see `tic_us_manifest.json` slugs).
    """

    insurer_slug = models.CharField(max_length=32, db_index=True)
    npi = models.CharField(max_length=10, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=("insurer_slug", "npi"),
                name="api_insurernetworknpi_insurer_npi_uniq",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.insurer_slug}:{self.npi}"


class TicSourceFile(models.Model):
    """Tracks processed TIC JSON files (dedupe / audit)."""

    insurer_slug = models.CharField(max_length=32, db_index=True)
    file_url = models.TextField()
    sha256_hex = models.CharField(max_length=64, db_index=True)
    npi_count = models.PositiveIntegerField(default=0)
    processed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=("insurer_slug", "file_url", "sha256_hex"),
                name="api_ticsourcefile_insurer_url_hash_uniq",
            ),
        ]

    def __str__(self) -> str:
        return f"TicSourceFile({self.insurer_slug}, {self.sha256_hex[:12]}…)"


class NetworkDatasetVersion(models.Model):
    """Append-only record for each full ingest (supports dump deploy provenance)."""

    created_at = models.DateTimeField(auto_now_add=True)
    git_commit = models.CharField(max_length=64, blank=True)
    notes = models.TextField(blank=True)
    counts_by_insurer = models.JSONField(default=dict)

    def __str__(self) -> str:
        return f"NetworkDatasetVersion({self.pk} @ {self.created_at})"


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
