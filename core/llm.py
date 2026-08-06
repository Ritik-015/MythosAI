from openai import OpenAI
from config import (
    LM_STUDIO_API_KEY,
    LM_STUDIO_BASE_URL,
    MODEL_NAME,
    TEMPERATURE, MAX_TOKENS,
)

from core.logger import logger
from core.session import ChatSession


class LLMClient:

    def __init__(self):

        self.client = OpenAI(
            base_url=LM_STUDIO_BASE_URL,
            api_key=LM_STUDIO_API_KEY,
        )

        self.session = ChatSession()
        logger.info("LLM Client Initialized")


    def chat(self, user_message: str) -> str:

        self.session.add_user_message(user_message)
        response = self.client.chat.completions.create(
            model=MODEL_NAME,
            messages=self.session.history(),
            temperature=TEMPERATURE,
            max_tokens=MAX_TOKENS,
        )    

        answer = response.choices[0].message.content
        self.session.add_assistant_message(answer)
        return answer

    def reset(self):
        self.session.clear()