import json
import unittest

from core.research import build_research_messages, normalize_research_sources


class ResearchPromptTests(unittest.TestCase):
    def test_builds_grounded_messages_with_citable_source_numbers(self):
        messages, normalized = build_research_messages(
            "What is Flask?",
            [{
                "title": "Flask docs",
                "url": "https://flask.palletsprojects.com/",
                "snippet": "Flask is a lightweight WSGI web application framework.",
                "source": "SearXNG",
            }],
        )
        self.assertEqual([item["role"] for item in messages], ["system", "user"])
        self.assertIn("Cite supported factual claims inline", messages[0]["content"])
        self.assertIn("untrusted external", messages[0]["content"])
        self.assertIn("Research question:\nWhat is Flask?", messages[1]["content"])
        data = messages[1]["content"].split("UNTRUSTED_SOURCE_RECORDS_JSON:\n", 1)[1]
        records = json.loads(data)
        self.assertEqual(records[0]["reference"], 1)
        self.assertEqual(records[0]["url"], normalized[0]["url"])
        self.assertEqual(records[0]["title"], "Flask docs")

    def test_rejects_empty_or_oversized_question(self):
        with self.assertRaises(ValueError):
            build_research_messages("   ", [{"url": "https://example.com"}])
        with self.assertRaises(ValueError):
            build_research_messages("x" * 501, [{"url": "https://example.com"}])

    def test_rejects_no_usable_sources(self):
        with self.assertRaises(ValueError):
            build_research_messages("A question", [{"url": "javascript:alert(1)", "title": "bad"}])

    def test_source_normalization_rejects_unsafe_urls_and_deduplicates(self):
        result = normalize_research_sources([
            {"title": "Unsafe", "url": "javascript:alert(1)", "snippet": "no"},
            {"title": "One", "url": "https://example.com/a", "snippet": "evidence"},
            {"title": "Duplicate", "url": "https://example.com/a", "snippet": "duplicate"},
            {"title": "Credential URL", "url": "https://user:pass@example.com", "snippet": "no"},
        ])
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["reference"], 1)
        self.assertEqual(result[0]["title"], "One")

    def test_limits_source_count_and_snippet_size(self):
        sources = [
            {"title": f"Source {i}", "url": f"https://example.com/{i}", "snippet": "x" * 3000}
            for i in range(12)
        ]
        normalized = normalize_research_sources(sources)
        self.assertEqual(len(normalized), 8)
        self.assertEqual(len(normalized[0]["snippet"]), 1600)
        self.assertEqual(normalized[-1]["reference"], 8)


if __name__ == "__main__":
    unittest.main()
