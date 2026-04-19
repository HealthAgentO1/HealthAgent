from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.db import models
from django.utils.translation import gettext_lazy as _

from .constants import MAX_EMAIL_LENGTH, MAX_FIRST_NAME_LENGTH, MAX_LAST_NAME_LENGTH


class UserManager(BaseUserManager):
    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError("Users must have an email address")
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        if extra_fields.get("is_staff") is not True:
            raise ValueError("Superuser must have is_staff=True.")
        if extra_fields.get("is_superuser") is not True:
            raise ValueError("Superuser must have is_superuser=True.")
        return self.create_user(email, password, **extra_fields)


class User(AbstractUser):
    username = None
    first_name = models.CharField(_("first name"), max_length=MAX_FIRST_NAME_LENGTH, blank=True)
    last_name = models.CharField(_("last name"), max_length=MAX_LAST_NAME_LENGTH, blank=True)
    email = models.EmailField(_("email address"), max_length=MAX_EMAIL_LENGTH, unique=True)
    date_of_birth = models.DateField(null=True, blank=True)
    # Symptom Check / settings: optional US practice address (same shape as client `UserAddress`).
    default_address = models.JSONField(null=True, blank=True)
    # Symptom Check: coarse insurer bucket id (matches SPA `INSURANCE_OPTIONS` slug), optional.
    default_insurance_slug = models.CharField(max_length=32, null=True, blank=True)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    objects = UserManager()

    def __str__(self):
        return self.email
