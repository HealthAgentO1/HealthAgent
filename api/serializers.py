from rest_framework import serializers

from .models import ExampleItem, MedicationProfile, SymptomSession
from .services.session_resume import build_session_resume_payload


def symptom_session_summary(session: SymptomSession) -> str:
    """Short text for history cards: prefer chief complaint / patient-stated summary, then transcript."""
    report = session.pre_visit_report
    if isinstance(report, dict):
        chief = report.get("chief_complaint")
        if isinstance(chief, str) and chief.strip():
            return chief.strip()
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


def validate_post_visit_diagnosis_payload(value: dict) -> dict:
    """Ensure post-visit diagnosis JSON matches the SPA contract."""
    if not isinstance(value, dict):
        raise serializers.ValidationError("Must be a JSON object.")
    text = value.get("text")
    if not isinstance(text, str) or not text.strip():
        raise serializers.ValidationError({"text": "Non-empty text is required."})
    source = value.get("source")
    if source not in ("llm_condition", "custom"):
        raise serializers.ValidationError(
            {"source": 'Must be "llm_condition" or "custom".'}
        )
    matched = value.get("matched_condition_title")
    if matched is not None and not isinstance(matched, str):
        raise serializers.ValidationError(
            {"matched_condition_title": "Must be a string or null."}
        )
    if source == "llm_condition" and (not matched or not str(matched).strip()):
        raise serializers.ValidationError(
            {"matched_condition_title": "Required when source is llm_condition."}
        )
    out = {
        "text": text.strip(),
        "source": source,
        "matched_condition_title": str(matched).strip() if matched else None,
    }
    return out


class SymptomSessionPostVisitDiagnosisSerializer(serializers.ModelSerializer):
    """PATCH body for `POST /api/sessions/<uuid>/` — only official post-visit diagnosis."""

    class Meta:
        model = SymptomSession
        fields = ["post_visit_diagnosis"]

    def validate_post_visit_diagnosis(self, value):
        if value is None:
            return None
        return validate_post_visit_diagnosis_payload(value)


class SymptomSessionListSerializer(serializers.ModelSerializer):
    """
    Dashboard/history list: stable public id, triage, time, summary, and optional pre-visit JSON.
    """

    session_id = serializers.UUIDField(source="public_id", read_only=True)
    summary = serializers.SerializerMethodField()

    class Meta:
        model = SymptomSession
        fields = [
            "session_id",
            "triage_level",
            "created_at",
            "summary",
            "pre_visit_report",
            # Patient-entered official diagnosis after a visit; list endpoint is the source for prior-diagnosis context on new checks.
            "post_visit_diagnosis",
        ]

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
        fields = [
            "id",
            "medications_raw",
            "extracted_medications",
            "interaction_results",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "medications_raw",
            "extracted_medications",
            "interaction_results",
            "created_at",
        ]
