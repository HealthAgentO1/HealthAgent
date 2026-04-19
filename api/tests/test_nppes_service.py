"""
NPPESService.search_providers — NPPES Read API v2.1 query params.

CMS documents ``taxonomy_description`` for description-based taxonomy search.
NUCC codes must be sent as ``taxonomy_code``; using ``taxonomy_description`` with a
code value yields API error 14.
"""

from unittest.mock import MagicMock, patch

from django.test import SimpleTestCase

from api.services.nppes_service import NPPESService, _looks_like_nucc_taxonomy_code


class NuccTaxonomyCodeHeuristicTests(SimpleTestCase):
    def test_recognizes_standard_codes(self):
        self.assertTrue(_looks_like_nucc_taxonomy_code("207Q00000X"))
        self.assertTrue(_looks_like_nucc_taxonomy_code("282N00000X"))
        self.assertTrue(_looks_like_nucc_taxonomy_code("261QU0200X"))

    def test_rejects_descriptions_and_garbage(self):
        self.assertFalse(_looks_like_nucc_taxonomy_code("Family Medicine"))
        self.assertFalse(_looks_like_nucc_taxonomy_code("1234567890"))
        self.assertFalse(_looks_like_nucc_taxonomy_code(""))


class NPPESServiceSearchProvidersTests(SimpleTestCase):
    def _mock_response(self):
        resp = MagicMock()
        resp.json.return_value = {"results": []}
        resp.raise_for_status.return_value = None
        return resp

    @patch("api.services.nppes_service.requests.get")
    def test_uses_taxonomy_code_for_nucc_code(self, mock_get):
        mock_get.return_value = self._mock_response()
        NPPESService.search_providers("78701", specialty="207Q00000X")
        mock_get.assert_called_once()
        _args, kwargs = mock_get.call_args
        params = kwargs["params"]
        self.assertEqual(params.get("taxonomy_code"), "207Q00000X")
        self.assertNotIn("taxonomy_description", params)

    @patch("api.services.nppes_service.requests.get")
    def test_uses_taxonomy_description_for_text_specialty(self, mock_get):
        mock_get.return_value = self._mock_response()
        NPPESService.search_providers("78701", specialty="Family Medicine")
        mock_get.assert_called_once()
        _args, kwargs = mock_get.call_args
        params = kwargs["params"]
        self.assertEqual(params.get("taxonomy_description"), "Family Medicine")
        self.assertNotIn("taxonomy_code", params)

    @patch("api.services.nppes_service.requests.get")
    def test_no_taxonomy_params_without_specialty(self, mock_get):
        mock_get.return_value = self._mock_response()
        NPPESService.search_providers("78701", specialty=None)
        params = mock_get.call_args.kwargs["params"]
        self.assertNotIn("taxonomy_code", params)
        self.assertNotIn("taxonomy_description", params)
        self.assertEqual(params["version"], "2.1")
        self.assertEqual(params["postal_code"], "78701")
