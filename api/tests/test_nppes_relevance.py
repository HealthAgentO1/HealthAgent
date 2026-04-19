from django.test import SimpleTestCase

from api.services.nppes_relevance import (
    combined_rank_score,
    relevance_score_from_nppes_row,
)


class NppesRelevanceTests(SimpleTestCase):
    def test_hospital_beats_ambiguous_short_name(self):
        big = relevance_score_from_nppes_row(
            {"practiceLocations": [], "endpoints": []},
            "Memorial Hospital Emergency Department",
            "General Acute Care Hospital",
        )
        small = relevance_score_from_nppes_row(
            {"practiceLocations": [], "endpoints": []},
            "J Smith LLC",
            "Clinic/Center; Urgent Care",
        )
        self.assertGreater(big, small)

    def test_combined_prefers_notable_farther_than_weak_nearby(self):
        # Strong name 12 relevance, 8 mi -> combined = 12 - 0.32*8 = 9.44
        strong_far = combined_rank_score(12.0, 8.0)
        # Weak name 2 relevance, 1 mi -> 2 - 0.32 = 1.68
        weak_near = combined_rank_score(2.0, 1.0)
        self.assertGreater(strong_far, weak_near)
