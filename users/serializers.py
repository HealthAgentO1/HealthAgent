import re

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import serializers

from .us_states import US_STATE_CODES

User = get_user_model()

_ZIP_RE = re.compile(r"^\d{5}$")


class DefaultAddressSerializer(serializers.Serializer):
    """
    Validated US address for `User.default_address` — rules align with
    `SymptomNearbyFacilitiesSerializer` and the Symptom Check client (`addressValidation.ts`).
    """

    street = serializers.CharField(max_length=240, trim_whitespace=True)
    city = serializers.CharField(max_length=120, trim_whitespace=True)
    state = serializers.CharField(max_length=2, trim_whitespace=True)
    postal_code = serializers.CharField(trim_whitespace=True)

    def validate_state(self, value: str) -> str:
        v = value.strip().upper()
        if v not in US_STATE_CODES:
            raise serializers.ValidationError("Select a valid US state.")
        return v

    def validate_postal_code(self, value: str) -> str:
        v = value.strip()
        if not _ZIP_RE.match(v):
            raise serializers.ValidationError("ZIP must be exactly 5 digits.")
        return v

    def validate(self, attrs):
        street = attrs["street"].strip()
        if len(street) < 3:
            raise serializers.ValidationError(
                {"street": "Enter a street address (at least a few characters)."}
            )
        city = attrs["city"].strip()
        if len(city) < 2:
            raise serializers.ValidationError({"city": "Enter a city."})
        attrs["street"] = street
        attrs["city"] = city
        return attrs


class UserProfileSerializer(serializers.ModelSerializer):
    """Current user: name, optional birth date, optional default US address (JSON)."""

    email = serializers.EmailField(read_only=True)
    default_address = serializers.JSONField(required=False, allow_null=True)

    class Meta:
        model = User
        fields = ("email", "first_name", "last_name", "date_of_birth", "default_address")
        extra_kwargs = {
            "first_name": {"required": False, "allow_blank": True},
            "last_name": {"required": False, "allow_blank": True},
            "date_of_birth": {"required": False, "allow_null": True},
        }

    def validate_date_of_birth(self, value):
        if value is None:
            return value
        if value > timezone.now().date():
            raise serializers.ValidationError("Birth date cannot be in the future.")
        return value

    def validate_default_address(self, value):
        if value is None:
            return None
        if value == {}:
            return None
        ser = DefaultAddressSerializer(data=value)
        ser.is_valid(raise_exception=True)
        return ser.validated_data


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8, style={"input_type": "password"})

    class Meta:
        model = User
        fields = ("id", "email", "password", "first_name", "last_name")
        read_only_fields = ("id",)
        extra_kwargs = {
            "first_name": {"required": False, "allow_blank": True},
            "last_name": {"required": False, "allow_blank": True},
        }

    def create(self, validated_data):
        password = validated_data.pop("password")
        return User.objects.create_user(password=password, **validated_data)
