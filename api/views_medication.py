from __future__ import annotations

from django.conf import settings
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import MedicationProfile
from .serializers import MedicationProfileExtractResponseSerializer
from .services.medication_extraction import MedicationLlmError, extract_medications_with_rxnorm


class MedicationProfileExtractView(APIView):
    """
    POST /api/medication-profile/extract/

    Parse free-text medications with the configured OpenAI-compatible LLM (DeepSeek by
    default), map to RxNorm RxCUIs (model output and/or RxNav), and persist a new
    MedicationProfile for the user.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        text = request.data.get("medications_text")
        if text is None:
            text = request.data.get("text")
        if not isinstance(text, str) or not text.strip():
            return Response(
                {"error": "Provide non-empty `medications_text` (or `text`)."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not getattr(settings, "OPENAI_API_KEY", None):
            return Response(
                {
                    "error": (
                        "LLM API is not configured. Set OPENAI_API_KEY or DEEPSEEK_API_KEY "
                        "(and OPENAI_BASE_URL / LLM_MODEL if not using defaults)."
                    ),
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        raw = text.strip()
        try:
            extracted = extract_medications_with_rxnorm(raw)
        except MedicationLlmError as exc:
            return Response(
                {"error": str(exc)},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        profile = MedicationProfile.objects.create(
            user=request.user,
            medications_raw=raw,
            extracted_medications=extracted,
        )

        data = MedicationProfileExtractResponseSerializer(profile).data
        return Response(data, status=status.HTTP_201_CREATED)
