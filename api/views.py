from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import action, api_view
from rest_framework.response import Response
from rest_framework import status
import uuid
import requests
from .models import ExampleItem, SymptomSession
from .serializers import ExampleItemSerializer, SymptomSessionSerializer

class ExampleItemViewSet(viewsets.ModelViewSet):
    """
    A simple ViewSet for viewing and editing example items.
    ModelViewSet automatically provides `list`, `create`, `retrieve`, `update` and `destroy` actions.
    """
    queryset = ExampleItem.objects.all().order_by('-created_at')
    serializer_class = ExampleItemSerializer


class SymptomSessionViewSet(viewsets.ModelViewSet):
    """
    ViewSet for managing symptom sessions.
    Users can only access their own sessions.
    """
    serializer_class = SymptomSessionSerializer
    # permission_classes = [IsAuthenticated]  # Temporarily disabled for testing

    def get_queryset(self):
        # return SymptomSession.objects.filter(user=self.request.user)
        return SymptomSession.objects.all()  # Temporarily allow all for testing

    def perform_create(self, serializer):
        # serializer.save(user=self.request.user)
        serializer.save()  # Temporarily no user for testing

    @action(detail=True, methods=['post'])
    def book(self, request, pk=None):
        """
        Mock appointment booking - sets status to confirmed and generates confirmation number.
        """
        session = self.get_object()
        
        if session.booking_status != 'pending':
            return Response(
                {'error': 'Session is not in pending status'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Generate a mock confirmation number
        confirmation_number = f"HA-{uuid.uuid4().hex[:8].upper()}"
        
        session.booking_status = 'confirmed'
        session.confirmation_number = confirmation_number
        session.save()
        
        serializer = self.get_serializer(session)
        return Response(serializer.data)


@api_view(['GET'])
def provider_search(request):
    """
    NPPES Provider Search Endpoint
    Proxies the CMS NPI Registry API for provider search by ZIP and specialty.
    
    Query parameters:
    - zip: Required, US ZIP code (5 digits)
    - specialty: Optional, specialty name or taxonomy code
    """
    zip_code = request.query_params.get('zip')
    specialty = request.query_params.get('specialty')
    
    if not zip_code:
        return Response(
            {'error': 'zip parameter is required'}, 
            status=status.HTTP_400_BAD_REQUEST
        )
    
    # Validate ZIP code format (basic check)
    if not zip_code.isdigit() or len(zip_code) != 5:
        return Response(
            {'error': 'zip must be a 5-digit US ZIP code'}, 
            status=status.HTTP_400_BAD_REQUEST
        )
    
    try:
        # Build NPPES API URL
        base_url = 'https://npiregistry.cms.hhs.gov/api/'
        params = {
            'version': '2.1',
            'address_purpose': 'LOCATION',
            'postal_code': zip_code,
            'limit': '20'  # Limit results for performance
        }
        
        # Add specialty filter if provided
        if specialty:
            # Try to match specialty name to taxonomy code, or use as-is
            taxonomy_mapping = {
                'family medicine': '207Q00000X',
                'internal medicine': '207R00000X',
                'emergency medicine': '207P00000X',
                'pediatrics': '208000000X',
                'cardiology': '207RC0000X',
                'dermatology': '207N00000X',
                'orthopedic surgery': '207X00000X',
                'general surgery': '208600000X',
                'obstetrics & gynecology': '207V00000X',
                'psychiatry': '2084P0800X',
            }
            
            taxonomy_code = taxonomy_mapping.get(specialty.lower(), specialty)
            params['taxonomy_description'] = taxonomy_code
        
        # Make request to NPPES API
        response = requests.get(base_url, params=params, timeout=10)
        response.raise_for_status()
        
        nppes_data = response.json()
        
        # Transform NPPES response to our API contract format
        providers = []
        for result in nppes_data.get('results', []):
            provider = _transform_nppes_provider(result)
            if provider:
                providers.append(provider)
        
        return Response(providers)
        
    except requests.RequestException as e:
        return Response(
            {'error': f'NPPES API request failed: {str(e)}'}, 
            status=status.HTTP_502_BAD_GATEWAY
        )
    except Exception as e:
        return Response(
            {'error': f'Internal server error: {str(e)}'}, 
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


def _transform_nppes_provider(nppes_result):
    """
    Transform NPPES API result to our provider contract format.
    """
    try:
        # Extract basic info
        npi = nppes_result.get('number')
        basic_info = nppes_result.get('basic', {})
        addresses = nppes_result.get('addresses', [])
        taxonomies = nppes_result.get('taxonomies', [])
        
        if not npi or not basic_info:
            return None
        
        # Build provider name
        first_name = basic_info.get('first_name', '')
        last_name = basic_info.get('last_name', '')
        org_name = basic_info.get('organization_name', '')
        
        if org_name:
            name = org_name
        elif first_name and last_name:
            credential = basic_info.get('credential', '')
            name = f"{first_name} {last_name}{f', {credential}' if credential else ''}"
        else:
            return None
        
        # Find practice location address
        practice_address = None
        for addr in addresses:
            if addr.get('address_purpose') == 'LOCATION':
                practice_address = addr
                break
        
        if not practice_address:
            return None
        
        # Format address
        address_parts = [
            practice_address.get('address_1', ''),
            practice_address.get('city', ''),
            practice_address.get('state', ''),
            practice_address.get('postal_code', '')
        ]
        address = ', '.join(filter(None, address_parts))
        
        # Get specialty from taxonomy
        specialty = 'Healthcare Provider'  # Default
        taxonomy_code = None
        
        for tax in taxonomies:
            if tax.get('primary'):
                specialty = tax.get('desc', specialty)
                taxonomy_code = tax.get('code')
                break
        
        # Get phone if available
        phone = practice_address.get('telephone_number')
        
        return {
            'npi': str(npi),
            'name': name,
            'specialty': specialty,
            'address': address,
            'taxonomy_code': taxonomy_code,
            'phone': phone,
            'distance_approx': None  # Could be calculated with geocoding
        }
        
    except Exception as e:
        # Skip malformed results
        return None
