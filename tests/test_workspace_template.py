"""Static checks for the spatial workspace template and its key controls."""
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]


class _IdParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.ids = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        value = attrs.get("id")
        if value:
            self.ids.append(value)


class WorkspaceTemplateTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.template = (ROOT / "templates" / "index.html").read_text(encoding="utf-8")
        cls.workspace_js = (ROOT / "static" / "js" / "workspace.js").read_text(encoding="utf-8")
        cls.workspace_css = (ROOT / "static" / "css" / "workspace.css").read_text(encoding="utf-8")

    def test_required_workspace_elements_exist_and_ids_are_unique(self):
        parser = _IdParser()
        parser.feed(self.template)
        duplicate_ids = [value for value, count in Counter(parser.ids).items() if count > 1]
        self.assertEqual(duplicate_ids, [])
        expected = {
            "app-shell", "file-view", "chat-view", "file-picker", "folder-dialog",
            "folder-form", "folder-grid", "file-rows", "file-filter", "file-sort",
            "inspector-panel", "inspector-body", "search-dialog", "search-form", "message",
        }
        self.assertTrue(expected.issubset(set(parser.ids)), expected - set(parser.ids))

    def test_workspace_css_is_loaded_after_glass_theme(self):
        glass_index = self.template.index("css/glass.css")
        workspace_index = self.template.index("css/workspace.css")
        self.assertLess(glass_index, workspace_index)

    def test_chat_and_search_entry_points_are_preserved(self):
        self.assertIn('id="nav-chat"', self.template)
        self.assertIn('id="nav-web-search"', self.template)
        self.assertIn('id="search-btn"', self.template)
        self.assertIn('activateView("chat")', (ROOT / "static" / "js" / "app.js").read_text(encoding="utf-8"))

    def test_local_file_handling_uses_indexeddb_and_no_server_upload(self):
        self.assertIn("indexedDB.open(DB_NAME, DB_VERSION)", self.workspace_js)
        self.assertIn("importFiles(event.dataTransfer.files)", self.workspace_js)
        self.assertIn("They stay in this browser on this device", self.template)
        self.assertNotIn('fetch("/api/upload', self.workspace_js)

    def test_research_button_and_answer_region_are_present(self):
        self.assertIn('id="research-submit"', self.template)
        self.assertIn('id="research-answer-content"', self.template)
        self.assertIn('id="research-sources"', self.template)
        app_js = (ROOT / "static" / "js" / "app.js").read_text(encoding="utf-8")
        self.assertIn('fetch("/api/research"', app_js)
        self.assertIn("renderResearchSources(payload.sources)", app_js)

    def test_research_privacy_disclosure_is_present(self):
        self.assertIn("retrieved titles/snippets and your question", self.template)
        self.assertIn("If your endpoint is remote", self.template)

    def test_responsive_three_pane_layout_and_reduced_motion_exist(self):
        self.assertIn("grid-template-columns: 238px minmax(0, 1fr) 292px", self.workspace_css)
        self.assertIn("@media (max-width: 780px)", self.workspace_css)
        self.assertIn("prefers-reduced-motion: reduce", self.workspace_css)


if __name__ == "__main__":
    unittest.main()
