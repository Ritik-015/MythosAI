from typing import Dict, List

from core.prompts import DEFAULT_SYSTEM_PROMPT


class ChatSession:
    """In-memory conversation history scoped to one connected client."""

    def __init__(self) -> None:
        self.messages: List[Dict[str, str]] = [
            {"role": "system", "content": DEFAULT_SYSTEM_PROMPT}
        ]

    def add_user_message(self, text: str) -> None:
        self.messages.append({"role": "user", "content": text})

    def add_assistant_message(self, text: str) -> None:
        self.messages.append({"role": "assistant", "content": text})

    def clear(self) -> None:
        self.messages = [{"role": "system", "content": DEFAULT_SYSTEM_PROMPT}]

    def history(self) -> List[Dict[str, str]]:
        # Return copies so callers cannot mutate session internals accidentally.
        return [message.copy() for message in self.messages]

    def truncate(self, length: int) -> None:
        """Roll back a failed/incomplete request to its prior history length."""
        self.messages = self.messages[:max(1, length)]
        if not self.messages or self.messages[0].get("role") != "system":
            self.clear()
