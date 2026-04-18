from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from users.views import RegisterView

from .views import ExampleItemViewSet, SymptomSessionViewSet, provider_search
from .views_symptom import start_symptom_check, followup_questions, finalize_assessment

router = DefaultRouter()
router.register(r"items", ExampleItemViewSet)
router.register(r"symptom-sessions", SymptomSessionViewSet)

urlpatterns = [
    path("auth/register/", RegisterView.as_view(), name="auth-register"),
    path("token/", TokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("providers/", provider_search, name="provider-search"),
    # Symptom check endpoints
    path("symptom-check/start/", start_symptom_check, name="start-symptom-check"),
    path("symptom-check/<int:session_id>/followup/", followup_questions, name="followup-questions"),
    path("symptom-check/<int:session_id>/finalize/", finalize_assessment, name="finalize-assessment"),
    path("", include(router.urls)),
]
