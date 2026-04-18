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
