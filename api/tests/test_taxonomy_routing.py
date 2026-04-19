from django.test import SimpleTestCase

from api.services.taxonomy_routing import resolve_nppes_taxonomy_codes


class TaxonomyRoutingTests(SimpleTestCase):
    def test_emergency_orders_hospitals_first_despite_llm_primary_care_first(self):
        out = resolve_nppes_taxonomy_codes(
            "emergency_department",
            ["261QP2300X", "282N00000X"],
        )
        self.assertEqual(out[0], "282N00000X")

    def test_drops_disallowed_llm_codes(self):
        out = resolve_nppes_taxonomy_codes(
            "urgent_care",
            ["207W00000X", "261QE0800X", "261QU0200X"],
        )
        self.assertNotIn("207W00000X", out)
        self.assertNotIn("261QE0800X", out)
        self.assertIn("261QU0200X", out)

    def test_unknown_setting_uses_default_priority(self):
        out = resolve_nppes_taxonomy_codes(None, [])
        self.assertEqual(out[0], "282N00000X")
