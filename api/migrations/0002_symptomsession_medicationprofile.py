import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("api", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="SymptomSession",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("ai_conversation_log", models.JSONField(default=list)),
                (
                    "triage_level",
                    models.CharField(
                        blank=True,
                        choices=[
                            ("emergency", "Emergency"),
                            ("urgent", "Urgent"),
                            ("routine", "Routine"),
                        ],
                        max_length=32,
                        null=True,
                    ),
                ),
                (
                    "provider_npi",
                    models.CharField(blank=True, max_length=10, null=True),
                ),
                ("insurance_details", models.JSONField(blank=True, null=True)),
                (
                    "booking_status",
                    models.CharField(
                        choices=[
                            ("pending", "Pending"),
                            ("confirmed", "Confirmed"),
                            ("cancelled", "Cancelled"),
                            ("completed", "Completed"),
                        ],
                        default="pending",
                        max_length=32,
                    ),
                ),
                ("pre_visit_report", models.JSONField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="symptom_sessions",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
        ),
        migrations.CreateModel(
            name="MedicationProfile",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("medications_raw", models.TextField()),
                ("extracted_medications", models.JSONField(default=list)),
                ("interaction_results", models.JSONField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="medication_profiles",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
        ),
    ]
