from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework import status
import uuid
from .models import ExampleItem, SymptomSession
from .serializers import ExampleItemSerializer, SymptomSessionSerializer

class ExampleItemViewSet(viewsets.ModelViewSet):
    """
    A simple ViewSet for viewing and editing example items.
    ModelViewSet automatically provides `list`, `create`, `retrieve`, `update` and `destroy` actions.
    """
    queryset = ExampleItem.objects.all().order_by('-created_at')
    serializer_class = ExampleItemSerializer


class SymptomSessionViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing symptom sessions.
    Users can only access their own sessions.
    """
    queryset = SymptomSession.objects.all()
    serializer_class = SymptomSessionSerializer
    # permission_classes = [IsAuthenticated]  # Temporarily disabled for testing

    def get_queryset(self):
        # return self.queryset.filter(user=self.request.user)
        return self.queryset  # Temporarily allow all for testing

    def perform_create(self, serializer):
        # serializer.save(user=self.request.user)
        serializer.save()  # Temporarily no user for testing

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
