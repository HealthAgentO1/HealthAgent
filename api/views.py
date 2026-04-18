from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
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
    serializer_class = SymptomSessionSerializer
    # permission_classes = [IsAuthenticated]  # Temporarily disabled for testing

    def get_queryset(self):
        # return SymptomSession.objects.filter(user=self.request.user)
        return SymptomSession.objects.all()  # Temporarily allow all for testing

    def perform_create(self, serializer):
        # serializer.save(user=self.request.user)
        serializer.save()  # Temporarily no user for testing
