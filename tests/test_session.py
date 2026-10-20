import unittest

from core.session import ChatSession


class ChatSessionTests(unittest.TestCase):
    def test_clear_preserves_system_prompt(self):
        session = ChatSession()
        session.add_user_message("hello")
        session.add_assistant_message("hi")
        session.clear()
        self.assertEqual(len(session.history()), 1)
        self.assertEqual(session.history()[0]["role"], "system")

    def test_history_returns_copies(self):
        session = ChatSession()
        history = session.history()
        history[0]["content"] = "changed outside"
        self.assertNotEqual(session.history()[0]["content"], "changed outside")

    def test_truncate_rolls_back_failed_request(self):
        session = ChatSession()
        initial_length = len(session.history())
        session.add_user_message("incomplete request")
        session.truncate(initial_length)
        self.assertEqual(len(session.history()), initial_length)


if __name__ == "__main__":
    unittest.main()
