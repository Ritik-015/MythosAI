import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

try:
    from core.llm import LLMClient
    OPENAI_AVAILABLE = True
except ModuleNotFoundError as exc:
    if exc.name != "openai":
        raise
    LLMClient = None
    OPENAI_AVAILABLE = False


class FakeStream(list):
    def close(self):
        pass


def chunk(text):
    return SimpleNamespace(
        choices=[SimpleNamespace(delta=SimpleNamespace(content=text))]
    )


@unittest.skipUnless(OPENAI_AVAILABLE, "openai package is not installed in this test environment")
class LLMClientTests(unittest.TestCase):
    @patch("core.llm.OpenAI")
    def test_streaming_saves_complete_conversation(self, openai_constructor):
        client_api = MagicMock()
        openai_constructor.return_value = client_api
        client_api.with_options.return_value.models.list.return_value.data = [
            SimpleNamespace(id="test-local-model")
        ]
        client_api.chat.completions.create.return_value = FakeStream([
            chunk("Hello "),
            chunk("from LM Studio."),
        ])

        client = LLMClient()
        client._model_id = None
        result = "".join(client.stream_chat("Hi"))

        self.assertEqual(result, "Hello from LM Studio.")
        self.assertEqual(client.session.history()[-2]["content"], "Hi")
        self.assertEqual(client.session.history()[-1]["content"], "Hello from LM Studio.")
        client_api.chat.completions.create.assert_called_once()
        self.assertEqual(client_api.chat.completions.create.call_args.kwargs["model"], "test-local-model")

    @patch("core.llm.OpenAI")
    def test_failed_request_rolls_back_user_message(self, openai_constructor):
        client_api = MagicMock()
        openai_constructor.return_value = client_api
        client_api.with_options.return_value.models.list.return_value.data = [
            SimpleNamespace(id="test-local-model")
        ]
        client_api.chat.completions.create.side_effect = RuntimeError("simulated failure")

        client = LLMClient()
        client._model_id = None
        with self.assertRaises(RuntimeError):
            list(client.stream_chat("This request fails"))

        self.assertEqual(len(client.session.history()), 1)

    @patch("core.llm.OpenAI")
    def test_research_answers_use_sources_without_mutating_chat_history(self, openai_constructor):
        client_api = MagicMock()
        openai_constructor.return_value = client_api
        client_api.with_options.return_value.models.list.return_value.data = [
            SimpleNamespace(id="test-local-model")
        ]
        client_api.chat.completions.create.return_value = SimpleNamespace(
            model="test-local-model",
            choices=[SimpleNamespace(message=SimpleNamespace(content="Flask is a WSGI web framework [1]."))],
        )

        client = LLMClient()
        client._model_id = None
        before = client.session.history()
        result = client.answer_with_sources("What is Flask?", [{
            "title": "Flask docs",
            "url": "https://flask.palletsprojects.com/",
            "snippet": "Flask is a lightweight WSGI web application framework.",
            "source": "SearXNG",
        }])

        self.assertIn("[1]", result["answer"])
        self.assertEqual(result["sources"][0]["reference"], 1)
        self.assertEqual(client.session.history(), before)
        call = client_api.chat.completions.create.call_args.kwargs
        self.assertFalse(call["stream"])
        self.assertIn("UNTRUSTED_SOURCE_RECORDS_JSON", call["messages"][1]["content"])
        self.assertIn("untrusted external", call["messages"][0]["content"])

    def test_clients_have_independent_histories(self):
        with patch("core.llm.OpenAI"):
            first = LLMClient()
            second = LLMClient()
        first.session.add_user_message("private to first")
        self.assertEqual(len(second.session.history()), 1)


if __name__ == "__main__":
    unittest.main()
