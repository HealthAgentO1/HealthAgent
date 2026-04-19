import logging

from django.conf import settings as django_settings
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import SymptomSession
from .services.nppes_nearby import find_nearby_facilities
from .services.survey_session_persist import (
    append_survey_turn,
    apply_condition_assessment_summary,
)
from .services.symptom_llm import (
    complete_symptom_survey_turn,
    conversation_log_to_chat_messages,
    get_symptom_chat_system_prompt,
    run_symptom_turn,
    trim_chat_messages,
)

logger = logging.getLogger(__name__)

# US postal state abbreviations (50 states + DC) — used to validate intake addresses.
US_STATE_CODES = frozenset(
    {
        "AL",
        "AK",
        "AZ",
        "AR",
        "CA",
        "CO",
        "CT",
        "DE",
        "DC",
        "FL",
        "GA",
        "HI",
        "ID",
        "IL",
        "IN",
        "IA",
        "KS",
        "KY",
        "LA",
        "ME",
        "MD",
        "MA",
        "MI",
        "MN",
        "MS",
        "MO",
        "MT",
        "NE",
        "NV",
        "NH",
        "NJ",
        "NM",
        "NY",
        "NC",
        "ND",
        "OH",
        "OK",
        "OR",
        "PA",
        "RI",
        "SC",
        "SD",
        "TN",
        "TX",
        "UT",
        "VT",
        "VA",
        "WA",
        "WV",
        "WI",
        "WY",
    }
)


class SymptomChatRequestSerializer(serializers.Serializer):
    session_id = serializers.UUIDField(required=False, allow_null=True)
    message = serializers.CharField(min_length=1, max_length=20000)


class SymptomNearbyFacilitiesSerializer(serializers.Serializer):
    """
    Symptom Check step 3: location + NUCC taxonomy codes from the LLM drive NPPES lookup.
    `suggested_care_setting` orders and filters codes server-side (see `taxonomy_routing.py`).
    """

    street = serializers.CharField(min_length=1, max_length=240, trim_whitespace=True)
    city = serializers.CharField(min_length=1, max_length=120, trim_whitespace=True)
    state = serializers.CharField(min_length=2, max_length=2, trim_whitespace=True)
    postal_code = serializers.RegexField(r"^\d{5}$")
    taxonomy_codes = serializers.ListField(
        child=serializers.CharField(max_length=32),
        allow_empty=True,
    )
    suggested_care_setting = serializers.ChoiceField(
        choices=[
            "emergency_department",
            "urgent_care",
            "primary_care",
            "telehealth",
            "self_care_monitor",
        ],
        required=False,
        allow_null=True,
    )

    def validate_state(self, value: str) -> str:
        v = value.strip().upper()
        if v not in US_STATE_CODES:
            raise serializers.ValidationError("Enter a valid US state.")
        return v


class SymptomSurveyLlmSerializer(serializers.Serializer):
    """
    Structured Symptom Check (not chat): SPA sends the same system text it bundles from
    `frontend/src/symptomCheck/prompts/*.txt` plus JSON user_payload for the model.
    """

    phase = serializers.ChoiceField(choices=["followup_questions", "condition_assessment"])
    system_prompt = serializers.CharField(min_length=1, max_length=200_000)
    user_payload = serializers.JSONField()
    session_id = serializers.UUIDField(required=False, allow_null=True)


def _iso_z(dt):
    return dt.isoformat().replace("+00:00", "Z")


class SymptomChatView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        req_ser = SymptomChatRequestSerializer(data=request.data)
        req_ser.is_valid(raise_exception=True)
        session_id = req_ser.validated_data.get("session_id")
        message = req_ser.validated_data["message"].strip()

        if session_id:
            session = get_object_or_404(
                SymptomSession,
                public_id=session_id,
                user=request.user,
            )
        else:
            session = SymptomSession.objects.create(user=request.user)

        now = timezone.now()
        user_entry = {
            "role": "user",
            "content": message,
            "timestamp": now.isoformat(),
        }
        log = list(session.ai_conversation_log) + [user_entry]

        chat_messages = conversation_log_to_chat_messages(log)
        system_prompt = get_symptom_chat_system_prompt()
        trimmed = trim_chat_messages(
            system_prompt,
            chat_messages,
            django_settings.LLM_MAX_INPUT_TOKENS,
        )

        try:
            parsed = run_symptom_turn(system_prompt, trimmed)
        except RuntimeError as e:
            logger.warning("LLM configuration error: %s", e)
            return Response(
                {"detail": str(e)},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except ValueError as e:
            logger.exception("LLM returned invalid JSON: %s", e)
            return Response(
                {"detail": "The model returned an invalid response. Please try again."},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        except Exception as e:
            logger.exception("LLM request failed: %s", e)
            return Response(
                {"detail": "Upstream language model error."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        assistant_now = timezone.now()
        assistant_entry = {
            "role": "assistant",
            "content": parsed["assistant_message"],
            "timestamp": assistant_now.isoformat(),
            "triage_level": parsed["triage_level"],
            "reasoning": parsed["reasoning"],
            "interview_complete": parsed["interview_complete"],
        }
        session.ai_conversation_log = log + [assistant_entry]
        session.triage_level = parsed["triage_level"]
        session.save(
            update_fields=[
                "ai_conversation_log",
                "triage_level",
                "updated_at",
            ]
        )

        turn_index = sum(
            1 for e in session.ai_conversation_log if e.get("role") == "assistant"
        )

        return Response(
            {
                "session_id": str(session.public_id),
                "assistant_message": parsed["assistant_message"],
                "triage_level": parsed["triage_level"],
                "reasoning": parsed["reasoning"],
                "interview_complete": parsed["interview_complete"],
                "turn_index": turn_index,
                "created_at": _iso_z(session.created_at),
                "updated_at": _iso_z(session.updated_at),
            },
            status=status.HTTP_200_OK,
        )


class SymptomSurveyLlmView(APIView):
    """
    POST JSON-only survey turns for `/symptom-check`: follow-up question generation or
    condition assessment. Credentials stay server-side; the client only supplies prompts
    it already ships in the bundle (not user-authored system instructions in production
    unless you replace the SPA — validate on the gateway if that becomes a concern).
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        ser = SymptomSurveyLlmSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        system_prompt = ser.validated_data["system_prompt"].strip()
        user_payload = ser.validated_data["user_payload"]
        if not isinstance(user_payload, dict):
            return Response(
                {"detail": "user_payload must be a JSON object."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            raw_text = complete_symptom_survey_turn(system_prompt, user_payload)
        except RuntimeError as e:
            logger.warning("LLM configuration error (survey): %s", e)
            return Response({"detail": str(e)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        except Exception as e:
            logger.exception("LLM request failed (survey): %s", e)
            return Response(
                {"detail": "Upstream language model error."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        phase = ser.validated_data["phase"]
        session_uuid = ser.validated_data.get("session_id")
        if session_uuid:
            session = get_object_or_404(
                SymptomSession,
                public_id=session_uuid,
                user=request.user,
            )
        else:
            session = SymptomSession.objects.create(user=request.user)

        append_survey_turn(session, phase=phase, user_payload=user_payload, raw_text=raw_text)
        if phase == "condition_assessment":
            apply_condition_assessment_summary(
                session, raw_text=raw_text, user_payload=user_payload
            )
        session.save()

        return Response(
            {
                "raw_text": raw_text,
                "phase": phase,
                "session_id": str(session.public_id),
            }
        )


class SymptomNearbyFacilitiesView(APIView):
    """
    Authenticated proxy for CMS NPPES + Census geocoding (see `api/services/nppes_nearby.py`).
    Mirrors the pattern used for `SymptomSurveyLlmView`: browser calls Django; Django calls public APIs.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        ser = SymptomNearbyFacilitiesSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        street = ser.validated_data["street"].strip()
        city = ser.validated_data["city"].strip()
        state = ser.validated_data["state"]
        postal_code = ser.validated_data["postal_code"]
        taxonomy_codes = ser.validated_data["taxonomy_codes"] or []
        suggested_care_setting = ser.validated_data.get("suggested_care_setting")

        try:
            payload = find_nearby_facilities(
                street=street,
                city=city,
                state=state,
                postal_code=postal_code,
                taxonomy_codes=list(taxonomy_codes),
                suggested_care_setting=suggested_care_setting,
            )
        except ValueError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception:
            logger.exception("Nearby facilities lookup failed")
            return Response(
                {"detail": "Unable to load nearby facilities. Please try again."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        return Response(payload, status=status.HTTP_200_OK)
