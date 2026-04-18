from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from users.views import RegisterView

from .views import ExampleItemViewSet
from .views_symptom import SymptomChatView

router = DefaultRouter()
router.register(r"items", ExampleItemViewSet)

urlpatterns = [
    path("symptom/chat/", SymptomChatView.as_view(), name="symptom-chat"),
    path("auth/register/", RegisterView.as_view(), name="auth-register"),
    path("token/", TokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("", include(router.urls)),
]
