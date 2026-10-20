import unittest
from unittest.mock import patch

from tools import search


class SearchAdapterTests(unittest.TestCase):
    def test_rejects_empty_and_oversized_queries(self):
        with self.assertRaises(ValueError):
            search.search_web("   ", provider="duckduckgo_ia")
        with self.assertRaises(ValueError):
            search.search_web("x" * 501, provider="duckduckgo_ia")

    def test_rejects_unknown_provider(self):
        with self.assertRaises(ValueError):
            search.search_web("example", provider="google-scrape")

    def test_rejects_non_string_provider(self):
        with self.assertRaises(ValueError):
            search.search_web("example", provider={"provider": "auto"})

    def test_explicit_searxng_requires_configuration(self):
        with patch.object(search, "SEARXNG_URL", ""):
            with self.assertRaises(search.SearchConfigurationError):
                search.search_web("example", provider="searxng")

    def test_searxng_normalizes_and_deduplicates_results(self):
        payload = {
            "results": [
                {
                    "title": "Example <b>Home</b>",
                    "url": "https://example.com/page?utm_source=test",
                    "content": "A <strong>useful</strong> snippet.",
                    "engine": "test-engine",
                },
                {
                    "title": "Duplicate",
                    "url": "https://EXAMPLE.com/page",
                    "content": "Duplicate snippet",
                    "engine": "another-engine",
                },
                {
                    "title": "Unsafe result",
                    "url": "javascript:alert(1)",
                    "content": "Must be dropped",
                },
            ]
        }
        with patch.object(search, "SEARXNG_URL", "http://127.0.0.1:8080"), \
             patch.object(search, "_fetch_json", return_value=payload):
            result = search.search_web("example", provider="searxng")

        self.assertEqual(result["provider"], "SearXNG")
        self.assertEqual(len(result["results"]), 1)
        self.assertEqual(result["results"][0]["title"], "Example Home")
        self.assertEqual(result["results"][0]["snippet"], "A useful snippet.")
        self.assertEqual(result["results"][0]["url"], "https://example.com/page?utm_source=test")

    def test_duckduckgo_instant_answers_are_labeled_limited(self):
        payload = {
            "Heading": "Python",
            "AbstractText": "Python is a programming language.",
            "AbstractURL": "https://www.python.org/",
            "RelatedTopics": [],
        }
        with patch.object(search, "_fetch_json", return_value=payload):
            result = search.search_web("Python", provider="duckduckgo_ia")

        self.assertEqual(result["provider"], "DuckDuckGo Instant Answers")
        self.assertEqual(len(result["results"]), 1)
        self.assertIn("not a complete web search", result["notice"])
        self.assertEqual(result["results"][0]["url"], "https://www.python.org/")

    def test_auto_falls_back_transparently_when_searxng_fails(self):
        payload = {
            "Heading": "Flask",
            "AbstractText": "A Python web framework.",
            "AbstractURL": "https://flask.palletsprojects.com/",
            "RelatedTopics": [],
        }
        with patch.object(search, "SEARXNG_URL", "http://127.0.0.1:8080"), \
             patch.object(search, "_fetch_json", side_effect=[
                 search.SearchProviderError("searx down"),
                 payload,
             ]):
            result = search.search_web("Flask", provider="auto")

        self.assertTrue(result["fallback"])
        self.assertEqual(result["provider"], "DuckDuckGo Instant Answers")
        self.assertIn("SearXNG was unavailable", result["notice"])


if __name__ == "__main__":
    unittest.main()
