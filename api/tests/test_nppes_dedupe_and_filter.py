from django.test import SimpleTestCase

from api.services.nppes_nearby import (
    _dedupe_facilities_by_location,
    _should_skip_mismatched_primary_specialty,
)


class NppesPrimarySpecialtyFilterTests(SimpleTestCase):
    def test_skips_when_primary_is_eye_but_search_was_urgent_care(self):
        row = {
            "taxonomies": [
                {"code": "261QE0800X", "desc": "Eye and Vision Services", "primary": True},
                {"code": "261QU0200X", "desc": "Clinic/Center; Urgent Care", "primary": False},
            ],
        }
        self.assertTrue(_should_skip_mismatched_primary_specialty(row, "261QU0200X"))

    def test_keeps_when_primary_matches_search_family(self):
        row = {
            "taxonomies": [
                {"code": "261QU0200X", "desc": "Clinic/Center; Urgent Care", "primary": True},
            ],
        }
        self.assertFalse(_should_skip_mismatched_primary_specialty(row, "261QU0200X"))


class NppesDedupeTests(SimpleTestCase):
    def test_collapses_same_street_zip_different_suite(self):
        facs = [
            {
                "name": "Same Org",
                "address_line": "100 Main St STE 1, Austin, TX 78701",
            },
            {
                "name": "Same Org",
                "address_line": "100 Main St Suite 200, Austin, TX 78701",
            },
        ]
        out = _dedupe_facilities_by_location(facs)
        self.assertEqual(len(out), 1)

    def test_keeps_two_campuses_same_zip_different_street(self):
        facs = [
            {"name": "Example Health System", "address_line": "1 A St, Austin, TX 78701"},
            {"name": "Example Health System, Inc", "address_line": "200 Other Rd, Austin, TX 78701"},
        ]
        out = _dedupe_facilities_by_location(facs)
        self.assertEqual(len(out), 2)

    def test_collapses_identical_address_line(self):
        row = {"name": "A", "address_line": "50 Oak Ave, Dallas, TX 75201"}
        out = _dedupe_facilities_by_location([row, dict(row)])
        self.assertEqual(len(out), 1)
