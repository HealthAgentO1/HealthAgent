from rest_framework import generics
from rest_framework.permissions import AllowAny

from .serializers import RegisterSerializer


class RegisterView(generics.CreateAPIView):
    """Create a new user account (public)."""

    permission_classes = [AllowAny]
    serializer_class = RegisterSerializer
