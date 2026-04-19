from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from users.views import RegisterView

from .views import (
    ExampleItemViewSet,
    ProvidersView,
    SymptomSessionViewSet,
    UserSymptomSessionRetrieveView,
    UserSymptomSessionsListView,
)
from .views_medication import MedicationProfileExtractView
from .views_symptom import (
    SymptomChatView,
    SymptomNearbyFacilitiesView,
    SymptomSurveyLlmView,
)

router = DefaultRouter()
router.register(r"items", ExampleItemViewSet)
router.register(r"symptom-sessions", SymptomSessionViewSet)

urlpatterns = [
    path(
        "medication-profile/extract/",
        MedicationProfileExtractView.as_view(),
        name="medication-profile-extract",
    ),
    path(
        "sessions/<uuid:session_public_id>/",
        UserSymptomSessionRetrieveView.as_view(),
        name="symptom-session-detail",
    ),
    path("sessions/", UserSymptomSessionsListView.as_view(), name="symptom-sessions-list"),
    path("symptom/chat/", SymptomChatView.as_view(), name="symptom-chat"),
    # Symptom Check SPA: two-phase JSON LLM (follow-up questions + condition list)
    path("symptom/survey-llm/", SymptomSurveyLlmView.as_view(), name="symptom-survey-llm"),
    path(
        "symptom/nearby-facilities/",
        SymptomNearbyFacilitiesView.as_view(),
        name="symptom-nearby-facilities",
    ),
    path("providers/", ProvidersView.as_view(), name="providers"),
    path("auth/register/", RegisterView.as_view(), name="auth-register"),
    path("token/", TokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("", include(router.urls)),
]
