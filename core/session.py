from typing import List, Dict

from core.prompts import DEFAULT_SYSTEM_PROMPT


class ChatSession:
    """
    Stores the current conversation.
    """

    def __init__(self):

        self.messages: List[Dict[str, str]] = [
            {
                "role": "system",
                "content": DEFAULT_SYSTEM_PROMPT,
            }
        ]

    def add_user_message(self, text: str):

        self.messages.append(
            {
                "role": "user",
                "content": text,
            }
        )

    def add_assistant_message(self, text: str):

        self.messages.append(
            {
                "role": "assistant",
                "content": text,
            }
        )

    def clear(self):

        self.messages = [
            {
                "role": "system",
                "content": DEFAULT_SYSTEM_PROMPT,
            }
        ]

    def history(self):

        return self.messages