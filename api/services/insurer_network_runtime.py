"""Runtime lookups against offline-ingested insurer ↔ NPI rows."""

from __future__ import annotations

from typing import Sequence

from api.models import InsurerNetworkNpi

_CHUNK = 2000

# Posted Fidelis in-network files overwhelmingly list **NPI-1** (individual) providers in
# `provider_groups`, while Symptom Check’s NPPES search is **NPI-2** (organizational) sites.
# Direct NPI equality then falsely marks every hospital as out-of-network; skip hints.
_SLUGS_INDIVIDUAL_NPI_PROJECTION_ONLY: frozenset[str] = frozenset({"fidelis"})


def slug_has_ingested_network_data(insurer_slug: str) -> bool:
    """True when we have at least one offline NPI row for this slug (Symptom Check network hints)."""
    if not insurer_slug or insurer_slug == "other":
        return False
    return InsurerNetworkNpi.objects.filter(insurer_slug=insurer_slug).exists()


def slug_supports_org_facility_network_match(insurer_slug: str) -> bool:
    """
    True when ingested rows can be compared to NPPES organizational (NPI-2) facility NPIs.

    Some payers’ files are dominated by individual clinician NPIs; those never match the
    hospital-style listings returned by `find_nearby_facilities`.
    """
    if not insurer_slug or insurer_slug in _SLUGS_INDIVIDUAL_NPI_PROJECTION_ONLY:
        return False
    return slug_has_ingested_network_data(insurer_slug)


def npis_marked_in_network(insurer_slug: str, npis: Sequence[str]) -> set[str]:
    """
    Return the subset of `npis` that appear in `InsurerNetworkNpi` for the given slug.
    """
    if not insurer_slug or not npis:
        return set()
    unique = [n for n in {str(x).strip() for x in npis} if len(n) == 10 and n.isdigit()]
    if not unique:
        return set()
    found: set[str] = set()
    for i in range(0, len(unique), _CHUNK):
        chunk = unique[i : i + _CHUNK]
        qs = InsurerNetworkNpi.objects.filter(
            insurer_slug=insurer_slug,
            npi__in=chunk,
        ).values_list("npi", flat=True)
        found.update(qs)
    return found
