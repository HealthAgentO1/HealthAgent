import uuid

from rest_framework import generics, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import ExampleItem, ManualPriorDiagnosis, SymptomSession
from .serializers import (
    ExampleItemSerializer,
    ManualPriorDiagnosisCreateSerializer,
    ManualPriorDiagnosisSerializer,
    SymptomSessionListSerializer,
    SymptomSessionPostVisitDiagnosisSerializer,
    SymptomSessionResumeSerializer,
    SymptomSessionSerializer,
)
from .services.session_resume import build_session_resume_payload

class UserManualPriorDiagnosisListCreateView(generics.ListCreateAPIView):
    """
    GET /api/prior-diagnoses/ — list patient-entered prior diagnosis labels.
    POST /api/prior-diagnoses/ — add one label (used with post-visit labels for optional LLM context).
    """

    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return ManualPriorDiagnosis.objects.filter(user=self.request.user).order_by(
            "-created_at", "-pk"
        )

    def get_serializer_class(self):
        if self.request.method == "POST":
            return ManualPriorDiagnosisCreateSerializer
        return ManualPriorDiagnosisSerializer

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        read = ManualPriorDiagnosisSerializer(
            serializer.instance, context=self.get_serializer_context()
        )
        headers = self.get_success_headers(read.data)
        return Response(read.data, status=status.HTTP_201_CREATED, headers=headers)


class UserManualPriorDiagnosisDestroyView(generics.DestroyAPIView):
    """DELETE /api/prior-diagnoses/<uuid>/ — remove one manual prior diagnosis row."""

    permission_classes = [IsAuthenticated]
    lookup_field = "public_id"
    lookup_url_kwarg = "diagnosis_public_id"

    def get_queryset(self):
        return ManualPriorDiagnosis.objects.filter(user=self.request.user)


class UserSymptomSessionsListView(generics.ListAPIView):
    """
    GET /api/sessions/ — authenticated user's symptom triage history for the dashboard.
    """

    serializer_class = SymptomSessionListSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return SymptomSession.objects.filter(user=self.request.user).order_by(
            "-created_at", "-pk"
        )


class UserSymptomSessionRetrieveUpdateDestroyView(generics.RetrieveUpdateDestroyAPIView):
    """
    GET /api/sessions/<uuid>/ — resume payload for Symptom Check deep links from the dashboard.
    PATCH /api/sessions/<uuid>/ — set or clear `post_visit_diagnosis` (official diagnosis after a visit).
    DELETE /api/sessions/<uuid>/ — remove one saved session (same auth and ownership rules as GET).
    """

    permission_classes = [IsAuthenticated]
    lookup_field = "public_id"
    lookup_url_kwarg = "session_public_id"

    def get_queryset(self):
        return SymptomSession.objects.filter(user=self.request.user)

    def get_serializer_class(self):
        if self.request.method == "PATCH":
            return SymptomSessionPostVisitDiagnosisSerializer
        return SymptomSessionResumeSerializer

    def partial_update(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        instance.refresh_from_db()
        return Response(build_session_resume_payload(instance))


class ExampleItemViewSet(viewsets.ModelViewSet):
    """
    A simple ViewSet for viewing and editing example items.
    ModelViewSet automatically provides `list`, `create`, `retrieve`, `update` and `destroy` actions.
    """
    queryset = ExampleItem.objects.all().order_by('-created_at')
    serializer_class = ExampleItemSerializer


class SymptomSessionViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing symptom sessions (router: /api/symptom-sessions/).
    Scoped to the authenticated user; list/retrieve/update/destroy/book use get_queryset().
    """

    permission_classes = [IsAuthenticated]
    serializer_class = SymptomSessionSerializer
    # Router introspection only; all requests use get_queryset() (user-scoped).
    queryset = SymptomSession.objects.none()

    def get_queryset(self):
        return SymptomSession.objects.filter(user=self.request.user).order_by(
            "-created_at", "-pk"
        )

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    @action(detail=True, methods=['post'])
    def book(self, request, pk=None):
        """
        Mock appointment booking - sets status to confirmed and generates confirmation number.
        """
        session = self.get_object()
        
        if session.booking_status != 'pending':
            return Response(
                {'error': 'Session is not in pending status'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Generate a mock confirmation number
        confirmation_number = f"HA-{uuid.uuid4().hex[:8].upper()}"
        
        session.booking_status = 'confirmed'
        session.confirmation_number = confirmation_number
        session.save()
        
        serializer = self.get_serializer(session)
        return Response(serializer.data)


from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny
from django.http import Http404
import logging

from .services.nppes_service import NPPESService, ProviderDataMapper
from .services.medication_profile_service import get_active_medication_names
from .services.openfda_recall_service import fetch_recalls_for_medications

logger = logging.getLogger(__name__)


class ProvidersView(APIView):
    """
    NPPES provider search endpoint.
    
    GET /providers/?zip=94107&specialty=Family%20Medicine
    """
    permission_classes = [AllowAny]

    def get(self, request):
        # Get query parameters
        zip_code = request.query_params.get('zip')
        specialty = request.query_params.get('specialty')

        logger.info(f"Providers search request: zip={zip_code}, specialty={specialty}")

        # Validate required parameters
        if not zip_code:
            return Response(
                {'error': 'zip parameter is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Basic ZIP code validation
        import re
        if not re.match(r'^\d{5}(-\d{4})?$', zip_code):
            return Response(
                {'error': 'Invalid ZIP code format. Use 5 digits or ZIP+4 format.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            # Search NPPES for providers
            raw_providers = NPPESService.search_providers(
                zip_code=zip_code,
                specialty=specialty,
                limit=20
            )

            logger.info(f"Raw providers from NPPES: {len(raw_providers)}")

            # Map and sanitize the data
            providers = ProviderDataMapper.map_providers(raw_providers)

            logger.info(f"Mapped providers: {len(providers)}")

            return Response(providers)

        except Exception as e:
            logger.exception(f"Error searching providers: {e}")
            return Response(
                {'error': 'Failed to search providers. Please try again.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class MedicationRecallsView(APIView):
    """
    GET /api/medications/recalls/

    Query openFDA drug enforcement for active medications on the user's latest
    MedicationProfile. Returns mapped classification (I / II / III) and reason_for_recall.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        meds = get_active_medication_names(request.user)
        if not meds:
            return Response(
                {
                    "medications_checked": [],
                    "recalls": [],
                    "errors": [],
                    "detail": "No medication profile found or no active medications.",
                }
            )
        payload = fetch_recalls_for_medications(meds)
        return Response(payload)
