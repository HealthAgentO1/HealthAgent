from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import serializers

User = get_user_model()


class UserProfileSerializer(serializers.ModelSerializer):
    """Current user: name and optional birth date (``AbstractUser`` already has ``first_name`` / ``last_name``)."""

    email = serializers.EmailField(read_only=True)

    class Meta:
        model = User
        fields = ("email", "first_name", "last_name", "date_of_birth")
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
