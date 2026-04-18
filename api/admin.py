from django.contrib import admin

from .models import ExampleItem, MedicationProfile, SymptomSession


@admin.register(ExampleItem)
class ExampleItemAdmin(admin.ModelAdmin):
    list_display = ("name", "is_active", "created_at")
    search_fields = ("name", "description")
    list_filter = ("is_active", "created_at")


@admin.register(SymptomSession)
class SymptomSessionAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "user",
        "triage_level",
        "booking_status",
        "provider_npi",
        "created_at",
    )
    list_filter = ("triage_level", "booking_status", "created_at")
    search_fields = ("user__email", "provider_npi")
    raw_id_fields = ("user",)


@admin.register(MedicationProfile)
class MedicationProfileAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "created_at")
    search_fields = ("user__email", "medications_raw")
    raw_id_fields = ("user",)
