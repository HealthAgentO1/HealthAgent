from rest_framework import serializers
from .models import ExampleItem, SymptomSession

class ExampleItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExampleItem
        fields = '__all__'


class SymptomSessionSerializer(serializers.ModelSerializer):
    class Meta:
        model = SymptomSession
        fields = [
            'id',
            'ai_conversation_log',
            'triage_level',
            'provider_npi',
            'insurance_details',
            'booking_status',
            'confirmation_number',
            'pre_visit_report',
            'created_at',
        ]
        read_only_fields = ['id', 'created_at']
