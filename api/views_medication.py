from __future__ import annotations

from django.conf import settings
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import MedicationProfile
from .serializers import MedicationProfileExtractResponseSerializer
from .services.medication_check_service import run_medication_check
from .services.medication_extraction import MedicationLlmError, extract_medications_with_rxnorm
from .services.openfda_interactions import compute_pairwise_interactions
from .services.regimen_safety_service import run_regimen_openfda_check


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

        interaction_results = None
        if len(extracted) >= 2:
            try:
                interaction_results = compute_pairwise_interactions(extracted)
            except Exception as exc:
                interaction_results = {
                    "source": "openfda_drug_label",
                    "error": str(exc),
                    "pairwise": [],
                    "per_drug_notes": [],
                    "per_drug_label_safety": [],
                    "pairs_checked": 0,
                }

        profile = MedicationProfile.objects.create(
            user=request.user,
            medications_raw=raw,
            extracted_medications=extracted,
            interaction_results=interaction_results,
        )

        data = MedicationProfileExtractResponseSerializer(profile).data
        return Response(data, status=status.HTTP_201_CREATED)


class MedicationCheckView(APIView):
    """
    POST /api/medication/check/

    Runs extraction, pairwise FDA label interaction hints, openFDA enforcement recalls,
    and an aggregate safety score; persists a ``MedicationProfile`` like extract-only.
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
            payload = run_medication_check(request.user, raw)
        except MedicationLlmError as exc:
            return Response(
                {"error": str(exc)},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        return Response(payload, status=status.HTTP_201_CREATED)


def _normalize_regimen_medications(raw: object) -> list[dict] | None:
    """Validate client regimen payload: list of { name, rxnorm_id?, scientific_name?, common_name? }."""
    if not isinstance(raw, list) or not raw:
        return None
    out: list[dict] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        name = item.get("name")
        if not isinstance(name, str) or not name.strip():
            continue
        row: dict = {"name": name.strip()}
        rx = item.get("rxnorm_id")
        if rx is not None and rx != "":
            row["rxnorm_id"] = str(rx)
        sci = item.get("scientific_name")
        if isinstance(sci, str) and sci.strip():
            row["scientific_name"] = sci.strip()
        com = item.get("common_name")
        if isinstance(com, str) and com.strip():
            row["common_name"] = com.strip()
        out.append(row)
    return out if out else None


class RegimenSafetyView(APIView):
    """
    POST /api/medication/regimen-safety/

    openFDA-only analysis for the browser-stored active regimen: SPL sections per drug,
    pairwise label interaction hints, enforcement recalls, and aggregate score.
    Does not call the LLM and does not persist a MedicationProfile row.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        medications = _normalize_regimen_medications(request.data.get("medications"))
        if medications is None:
            return Response(
                {
                    "error": (
                        "Provide a non-empty `medications` array with objects "
                        "containing a non-empty `name` string."
                    ),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            payload = run_regimen_openfda_check(medications)
        except Exception as exc:
            return Response(
                {"error": f"Regimen safety check failed: {exc}"},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        return Response(payload, status=status.HTTP_200_OK)
