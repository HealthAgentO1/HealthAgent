from django.contrib import admin
from .models import ExampleItem

@admin.register(ExampleItem)
class ExampleItemAdmin(admin.ModelAdmin):
    list_display = ('name', 'is_active', 'created_at')
    search_fields = ('name', 'description')
    list_filter = ('is_active', 'created_at')
