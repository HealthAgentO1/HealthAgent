from rest_framework import serializers

from .models import ExampleItem, MedicationProfile, SymptomSession
from .services.session_resume import build_session_resume_payload


def symptom_session_summary(session: SymptomSession) -> str:
    """Short text for history cards: prefer pre-visit report, then first user message, then last assistant reply."""
    report = session.pre_visit_report
    if isinstance(report, dict):
        patient_summary = report.get("patient_summary")
        if isinstance(patient_summary, str) and patient_summary.strip():
            return patient_summary.strip()

    log = session.ai_conversation_log or []
    for entry in log:
        if not isinstance(entry, dict):
            continue
        if entry.get("role") == "user":
            content = entry.get("content")
            if isinstance(content, str) and content.strip():
                return content.strip()

    for entry in reversed(log):
        if not isinstance(entry, dict):
            continue
        if entry.get("role") == "assistant":
            content = entry.get("content")
            if isinstance(content, str) and content.strip():
                return content.strip()

    return ""


class ExampleItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExampleItem
        fields = '__all__'


class SymptomSessionSerializer(serializers.ModelSerializer):
    class Meta:
        model = SymptomSession
        fields = [
            'id',
            'ai_conversation_log',
            'triage_level',
            'provider_npi',
            'insurance_details',
            'booking_status',
            'confirmation_number',
            'pre_visit_report',
            'created_at',
        ]
        read_only_fields = ['id', 'created_at']


class SymptomSessionListSerializer(serializers.ModelSerializer):
    """
    Dashboard/history list: stable public id, triage, time, and a human-readable summary.
    """

    session_id = serializers.UUIDField(source="public_id", read_only=True)
    summary = serializers.SerializerMethodField()

    class Meta:
        model = SymptomSession
        fields = ["session_id", "triage_level", "created_at", "summary"]

    def get_summary(self, obj: SymptomSession) -> str:
        return symptom_session_summary(obj)


class SymptomSessionResumeSerializer(serializers.BaseSerializer):
    """Hydrate Symptom Check from `SymptomSession` (survey or chat)."""

    def to_representation(self, instance: SymptomSession):
        return build_session_resume_payload(instance)


class MedicationProfileExtractResponseSerializer(serializers.ModelSerializer):
    """Response for LLM (DeepSeek/OpenAI-compatible) medication extraction + save."""

    class Meta:
        model = MedicationProfile
        fields = ["id", "medications_raw", "extracted_medications", "created_at"]
        read_only_fields = ["id", "medications_raw", "extracted_medications", "created_at"]
