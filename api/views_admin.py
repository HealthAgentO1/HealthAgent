"""Admin-only utilities (guarded by server-side configuration)."""

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.mail import send_mass_mail
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

User = get_user_model()


class AdminBroadcastEligibilityView(APIView):
    """
    Returns whether the signed-in user should see the post-login broadcast UI.

    Uses ``BROADCAST_ADMIN_EMAIL`` only (no duplicate frontend env required).
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        admin = getattr(settings, "BROADCAST_ADMIN_EMAIL", "") or ""
        if not admin:
            return Response({"eligible": False, "configured": False})
        user_email = request.user.email.strip().lower()
        return Response(
            {
                "eligible": user_email == admin,
                "configured": True,
            },
        )


class AdminBroadcastEmailView(APIView):
    """
    Send one email (same subject and body) to every registered user's address.

    Only the user whose email matches ``settings.BROADCAST_ADMIN_EMAIL`` may call this.
    Configure real delivery via ``EMAIL_BACKEND`` and related settings (see Django email docs).
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        admin = getattr(settings, "BROADCAST_ADMIN_EMAIL", "") or ""
        if not admin:
            return Response(
                {"detail": "Broadcast is not configured (missing BROADCAST_ADMIN_EMAIL)."},
                status=503,
            )
        if request.user.email.strip().lower() != admin:
            return Response({"detail": "Forbidden."}, status=403)

        subject = (request.data.get("subject") or "").strip() or "Update from HealthOS"
        message = (request.data.get("message") or "").strip()
        if not message:
            return Response({"detail": "Message body is required."}, status=400)

        emails = list(
            User.objects.exclude(email="")
            .values_list("email", flat=True)
            .distinct()
        )
        if not emails:
            return Response({"detail": "No recipients.", "sent": 0}, status=200)

        from_email = settings.DEFAULT_FROM_EMAIL
        datatuple = [(subject, message, from_email, [addr]) for addr in emails]
        try:
            send_mass_mail(datatuple, fail_silently=False)
        except Exception as e:  # noqa: BLE001 — surface mail errors to the admin client
            return Response({"detail": f"Mail error: {e!s}"}, status=502)

        return Response({"sent": len(emails)}, status=200)
