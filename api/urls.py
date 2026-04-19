from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from users.views import MeView, RegisterView

from .views import (
    ExampleItemViewSet,
    MedicationRecallsView,
    ProvidersView,
    SymptomSessionViewSet,
    UserSymptomSessionRetrieveUpdateDestroyView,
    UserSymptomSessionsListView,
)
from .views_medication import (
    MedicationCheckView,
    MedicationProfileExtractView,
    RegimenSafetyView,
)
from .views_symptom import (
    SymptomChatView,
    SymptomNearbyFacilitiesView,
    SymptomSurveyLlmView,
)
from .views_admin import AdminBroadcastEligibilityView, AdminBroadcastEmailView

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
        "medication/check/",
        MedicationCheckView.as_view(),
        name="medication-check",
    ),
    path(
        "medication/regimen-safety/",
        RegimenSafetyView.as_view(),
        name="medication-regimen-safety",
    ),
    path(
        "sessions/<uuid:session_public_id>/",
        UserSymptomSessionRetrieveUpdateDestroyView.as_view(),
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
    path(
        "medications/recalls/",
        MedicationRecallsView.as_view(),
        name="medication-recalls",
    ),
    path("auth/register/", RegisterView.as_view(), name="auth-register"),
    path("auth/me/", MeView.as_view(), name="auth-me"),
    path(
        "admin/broadcast-eligibility/",
        AdminBroadcastEligibilityView.as_view(),
        name="admin-broadcast-eligibility",
    ),
    path(
        "admin/broadcast-email/",
        AdminBroadcastEmailView.as_view(),
        name="admin-broadcast-email",
    ),
    path("token/", TokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("", include(router.urls)),
]
