from rest_framework import serializers
from .models import ExampleItem

class ExampleItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = ExampleItem
        fields = '__all__'
