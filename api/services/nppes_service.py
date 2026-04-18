import logging
import re
import requests
from typing import Dict, List, Optional, Any
from django.conf import settings

logger = logging.getLogger(__name__)

# NPPES API base URL
NPPES_API_BASE = "https://npiregistry.cms.hhs.gov/api/"

class NPPESService:
    """Service for interacting with the CMS NPI Registry (NPPES) API."""

    @staticmethod
    def search_providers(zip_code: str, specialty: Optional[str] = None, limit: int = 20) -> List[Dict[str, Any]]:
        """
        Search for providers by ZIP code and specialty.

        Args:
            zip_code: US ZIP code (5 digits or ZIP+4)
            specialty: Taxonomy description or code (optional)
            limit: Maximum number of results to return

        Returns:
            List of raw provider data from NPPES API
        """
        params = {
            "version": "2.1",
            "postal_code": zip_code,
            "limit": limit,
        }

        if specialty:
            # Try to determine if it's a taxonomy code or description
            if re.match(r'^\d{10}X?$', specialty):
                # Looks like a taxonomy code
                params["taxonomy_description"] = specialty
            else:
                # Assume it's a description
                params["taxonomy_description"] = specialty

        try:
            response = requests.get(NPPES_API_BASE, params=params, timeout=10)
            response.raise_for_status()
            data = response.json()

            results = data.get("results", [])
            logger.info(f"NPPES search returned {len(results)} providers for ZIP {zip_code}")
            return results

        except requests.RequestException as e:
            logger.error(f"NPPES API request failed: {e}")
            raise
        except Exception as e:
            logger.error(f"Error parsing NPPES response: {e}")
            raise


class ProviderDataMapper:
    """Utility for mapping and sanitizing NPPES provider data to our internal Provider interface."""

    @staticmethod
    def normalize_name(basic: Dict[str, Any]) -> str:
        """Normalize provider name from NPPES basic field."""
        if not basic:
            return ""

        # Check if it's an individual (has first_name/last_name) or organization (has organization_name)
        if basic.get("first_name") and basic.get("last_name"):
            # Individual provider
            first = basic.get("first_name", "").strip()
            last = basic.get("last_name", "").strip()
            middle = basic.get("middle_name", "").strip()
            suffix = basic.get("suffix", "").strip()
            prefix = basic.get("name_prefix", "").strip()

            name_parts = []
            if prefix:
                name_parts.append(prefix)
            name_parts.append(first)
            if middle:
                name_parts.append(middle)
            name_parts.append(last)
            if suffix:
                name_parts.append(suffix)

            return " ".join(name_parts)
        else:
            # Organization
            return basic.get("organization_name", "").strip()

    @staticmethod
    def normalize_address(address_data: List[Dict[str, Any]]) -> str:
        """Normalize address from NPPES addresses array."""
        if not address_data:
            return ""

        # Find primary practice location address
        primary_address = None
        for addr in address_data:
            if addr.get("address_purpose") == "LOCATION":
                primary_address = addr
                break

        if not primary_address:
            primary_address = address_data[0] if address_data else {}

        # Build address string
        parts = []

        # Street address
        if primary_address.get("address_1"):
            parts.append(primary_address["address_1"].strip().title())

        if primary_address.get("address_2"):
            parts.append(primary_address["address_2"].strip().title())

        # City, State ZIP
        city_state_zip = []
        if primary_address.get("city"):
            city_state_zip.append(primary_address["city"].strip().title())

        if primary_address.get("state"):
            city_state_zip.append(primary_address["state"].strip().upper())

        if primary_address.get("postal_code"):
            postal = primary_address["postal_code"].strip()
            # Format ZIP+4 if present
            if len(postal) > 5 and postal[5] != '-':
                postal = f"{postal[:5]}-{postal[5:]}"
            city_state_zip.append(postal)

        if city_state_zip:
            # Format as "City, State ZIP" without comma before ZIP
            if len(city_state_zip) == 3:
                city_state = f"{city_state_zip[0]}, {city_state_zip[1]} {city_state_zip[2]}"
            else:
                city_state = ", ".join(city_state_zip)
            parts.append(city_state)

        address = ", ".join(parts)

        # Clean up address formatting
        return ProviderDataMapper._clean_address_formatting(address)

    @staticmethod
    def _clean_address_formatting(address: str) -> str:
        """Clean up address formatting with proper casing and normalization."""
        if not address:
            return ""

        # Basic cleanup - title case street addresses, handle special cases
        # Most of the casing is already handled in normalize_address
        return address.replace('Po Box', 'PO Box').replace('Us ', 'US ')

    @staticmethod
    def normalize_specialty(taxonomies: List[Dict[str, Any]]) -> str:
        """Normalize specialty from NPPES taxonomies array."""
        if not taxonomies:
            return ""

        # Find primary taxonomy
        primary_taxonomy = None
        for tax in taxonomies:
            if tax.get("primary"):
                primary_taxonomy = tax
                break

        if not primary_taxonomy:
            primary_taxonomy = taxonomies[0] if taxonomies else {}

        # Use desc if available, otherwise code
        desc = primary_taxonomy.get("desc", "").strip()
        if desc:
            return ProviderDataMapper._normalize_taxonomy_name(desc)
        else:
            return primary_taxonomy.get("code", "")

    @staticmethod
    def _normalize_taxonomy_name(name: str) -> str:
        """Normalize taxonomy/specialty names for better UI matching."""
        if not name:
            return ""

        # Common normalizations
        normalizations = {
            "family medicine": "Family Medicine",
            "internal medicine": "Internal Medicine",
            "emergency medicine": "Emergency Medicine",
            "pediatrics": "Pediatrics",
            "obstetrics & gynecology": "Obstetrics & Gynecology",
            "obstetrics and gynecology": "Obstetrics & Gynecology",
            "general practice": "General Practice",
            "cardiovascular disease": "Cardiology",
            "gastroenterology": "Gastroenterology",
            "orthopaedic surgery": "Orthopedic Surgery",
            "psychiatry & neurology": "Psychiatry & Neurology",
            "psychiatry and neurology": "Psychiatry & Neurology",
        }

        # Case-insensitive lookup
        name_lower = name.lower()
        for key, value in normalizations.items():
            if key in name_lower:
                return value

        # Default: title case
        return name.title()

    @staticmethod
    def get_phone_number(addresses: List[Dict[str, Any]]) -> Optional[str]:
        """Extract phone number from addresses."""
        if not addresses:
            return None

        # Find primary practice location
        for addr in addresses:
            if addr.get("address_purpose") == "LOCATION" and addr.get("telephone_number"):
                phone = addr["telephone_number"].strip()
                # Format as +1XXXXXXXXXX if it's 10 digits
                if re.match(r'^\d{10}$', phone):
                    return f"+1{phone}"
                return phone

        return None

    @staticmethod
    def map_provider(raw_provider: Dict[str, Any]) -> Dict[str, Any]:
        """
        Map raw NPPES provider data to our internal Provider interface.

        Args:
            raw_provider: Raw provider data from NPPES API

        Returns:
            Mapped provider data with error handling for missing fields
        """
        try:
            basic = raw_provider.get("basic", {})
            addresses = raw_provider.get("addresses", [])
            taxonomies = raw_provider.get("taxonomies", [])

            provider = {
                "npi": str(raw_provider.get("number", "")),
                "name": ProviderDataMapper.normalize_name(basic),
                "specialty": ProviderDataMapper.normalize_specialty(taxonomies),
                "address": ProviderDataMapper.normalize_address(addresses),
                "phone": ProviderDataMapper.get_phone_number(addresses),
                "taxonomy_code": "",  # Will be set below
            }

            # Get primary taxonomy code
            if taxonomies:
                primary_tax = None
                for tax in taxonomies:
                    if tax.get("primary"):
                        primary_tax = tax
                        break
                if not primary_tax:
                    primary_tax = taxonomies[0]

                provider["taxonomy_code"] = primary_tax.get("code", "")

            # Set distance_approx to empty for now (would need geocoding)
            provider["distance_approx"] = ""

            # Validate required fields
            if not provider["npi"]:
                logger.warning(f"Provider missing NPI: {raw_provider}")
                return None

            if not provider["name"]:
                logger.warning(f"Provider missing name: {raw_provider}")
                return None

            return provider

        except Exception as e:
            logger.error(f"Error mapping provider data: {e}, raw_data: {raw_provider}")
            return None

    @staticmethod
    def map_providers(raw_providers: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Map multiple providers, filtering out invalid ones.

        Args:
            raw_providers: List of raw provider data from NPPES

        Returns:
            List of mapped provider data
        """
        mapped = []
        for raw_provider in raw_providers:
            mapped_provider = ProviderDataMapper.map_provider(raw_provider)
            if mapped_provider:
                mapped.append(mapped_provider)

        logger.info(f"Mapped {len(mapped)} valid providers from {len(raw_providers)} raw results")
        return mapped