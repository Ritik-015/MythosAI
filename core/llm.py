"""LM Studio adapter for MythosAI.

The default endpoint is local loopback. No cloud provider is selected implicitly.
"""
from __future__ import annotations

from urllib.parse import urlsplit
from threading import Lock
from typing import Iterator

from openai import (
    APIConnectionError,
    APIStatusError,
    APITimeoutError,
    OpenAI,
    OpenAIError,
)

from config import (
    LM_STUDIO_API_KEY,
    LM_STUDIO_BASE_URL,
    MODEL_NAME,
    TEMPERATURE,
    MAX_TOKENS,
    MAX_CHAT_MESSAGE_CHARS,
)
from core.logger import logger
from core.session import ChatSession
from core.research import build_research_messages


class LLMServiceError(RuntimeError):
    """A safe, actionable message suitable for the UI."""


def _is_loopback_endpoint(url: str) -> bool:
    try:
        host = (urlsplit(url).hostname or "").lower()
        return host in {"localhost", "127.0.0.1", "::1"}
    except ValueError:
        return False


class LLMClient:
    """One client and conversation history per connected UI session."""

    def __init__(self, session: ChatSession | None = None) -> None:
        self.client = OpenAI(
            base_url=LM_STUDIO_BASE_URL,
            api_key=LM_STUDIO_API_KEY,
            timeout=120.0,
            max_retries=0,
        )
        self.session = session or ChatSession()
        self._model_id = MODEL_NAME
        self._request_lock = Lock()
        logger.info("LM Studio client initialized (local endpoint: %s)", _is_loopback_endpoint(LM_STUDIO_BASE_URL))

    @staticmethod
    def check_health() -> dict:
        """Probe the configured endpoint with a short timeout; never return secrets."""
        try:
            client = OpenAI(
                base_url=LM_STUDIO_BASE_URL,
                api_key=LM_STUDIO_API_KEY,
                timeout=4.0,
                max_retries=0,
            )
            models = client.models.list().data
            model_ids = [str(item.id) for item in models if getattr(item, "id", None)]
            chosen = MODEL_NAME or (model_ids[0] if model_ids else None)
            if not model_ids:
                return {
                    "ok": False,
                    "base_url": LM_STUDIO_BASE_URL,
                    "local": _is_loopback_endpoint(LM_STUDIO_BASE_URL),
                    "model": chosen,
                    "models": [],
                    "error": "LM Studio responded but did not report any available models. Load a model and start the local server.",
                }
            return {
                "ok": True,
                "base_url": LM_STUDIO_BASE_URL,
                "local": _is_loopback_endpoint(LM_STUDIO_BASE_URL),
                "model": chosen,
                "models": model_ids,
                "error": None,
            }
        except Exception:
            return {
                "ok": False,
                "base_url": LM_STUDIO_BASE_URL,
                "local": _is_loopback_endpoint(LM_STUDIO_BASE_URL),
                "model": MODEL_NAME,
                "models": [],
                "error": "Cannot reach the configured LM Studio API. Check the server status, endpoint, and port.",
            }

    def _resolve_model(self) -> str:
        if self._model_id:
            return self._model_id
        try:
            models = self.client.with_options(timeout=5.0).models.list().data
        except (APIConnectionError, APITimeoutError) as exc:
            raise LLMServiceError(
                "Cannot reach LM Studio. Open LM Studio, load your model, and start its local server."
            ) from None
        except OpenAIError as exc:
            logger.warning("LM Studio model discovery failed: %s", type(exc).__name__)
            raise LLMServiceError(
                "Could not list models from LM Studio. Check its local server configuration."
            ) from None
        if not models:
            raise LLMServiceError(
                "LM Studio is reachable but no model is available. Load a model before chatting."
            )
        self._model_id = str(models[0].id)
        return self._model_id

    def answer_with_sources(self, question: str, sources: list[dict]) -> dict:
        """Generate a non-streaming answer grounded in retrieved source snippets.

        This is intentionally stateless: research prompts and source snippets do
        not get appended to the user's ordinary chat history.
        """
        try:
            messages, normalized_sources = build_research_messages(question, sources)
        except ValueError as exc:
            raise LLMServiceError(str(exc)) from None

        with self._request_lock:
            model = self._resolve_model()
            try:
                response = self.client.chat.completions.create(
                    model=model,
                    messages=messages,
                    temperature=TEMPERATURE,
                    max_tokens=MAX_TOKENS,
                    stream=False,
                )
            except (APIConnectionError, APITimeoutError):
                raise LLMServiceError(
                    "Could not connect to LM Studio. Confirm that its local server is running."
                ) from None
            except APIStatusError as exc:
                if exc.status_code == 404:
                    raise LLMServiceError(
                        "The configured model was not found. Load it in LM Studio or clear MODEL_NAME to auto-detect a model."
                    ) from None
                raise LLMServiceError(
                    f"LM Studio returned HTTP {exc.status_code} during research. Check the model and server logs."
                ) from None
            except OpenAIError:
                raise LLMServiceError(
                    "LM Studio rejected the research request. Check model compatibility and generation settings."
                ) from None

        choices = getattr(response, "choices", None) or []
        answer = getattr(getattr(choices[0], "message", None), "content", "") if choices else ""
        if not isinstance(answer, str) or not answer.strip():
            raise LLMServiceError(
                "LM Studio returned an empty research answer. Try a shorter question or a model with a larger context window."
            )

        return {
            "answer": answer.strip(),
            "model": getattr(response, "model", None) or model,
            "local": _is_loopback_endpoint(LM_STUDIO_BASE_URL),
            "sources": normalized_sources,
        }

    def chat(self, user_message: str) -> str:
        return "".join(self.stream_chat(user_message))

    def stream_chat(self, user_message: str) -> Iterator[str]:
        if not isinstance(user_message, str):
            raise LLMServiceError("Message must be text.")
        user_message = user_message.strip()
        if not user_message:
            raise LLMServiceError("Enter a message before sending it.")
        if len(user_message) > MAX_CHAT_MESSAGE_CHARS:
            raise LLMServiceError(
                f"Message is too long. Limit it to {MAX_CHAT_MESSAGE_CHARS:,} characters."
            )

        # Prevent overlapping requests from corrupting one conversation's history.
        with self._request_lock:
            prior_length = len(self.session.messages)
            self.session.add_user_message(user_message)
            stream = None
            completed = False
            chunks: list[str] = []
            try:
                model = self._resolve_model()
                try:
                    stream = self.client.chat.completions.create(
                        model=model,
                        messages=self.session.history(),
                        temperature=TEMPERATURE,
                        max_tokens=MAX_TOKENS,
                        stream=True,
                    )
                except (APIConnectionError, APITimeoutError):
                    raise LLMServiceError(
                        "Could not connect to LM Studio. Confirm that the local server is running."
                    ) from None
                except APIStatusError as exc:
                    if exc.status_code == 404:
                        raise LLMServiceError(
                            "The configured model was not found. Load it in LM Studio or clear MODEL_NAME to auto-detect the available model."
                        ) from None
                    raise LLMServiceError(
                        f"LM Studio returned HTTP {exc.status_code}. Check the model and server logs."
                    ) from None
                except OpenAIError:
                    raise LLMServiceError(
                        "LM Studio rejected the request. Check model compatibility and generation settings."
                    ) from None

                try:
                    for chunk in stream:
                        if not getattr(chunk, "choices", None):
                            continue
                        delta = chunk.choices[0].delta.content
                        if isinstance(delta, str) and delta:
                            chunks.append(delta)
                            yield delta
                except (APIConnectionError, APITimeoutError):
                    raise LLMServiceError(
                        "The connection to LM Studio was interrupted while generating the response."
                    ) from None
                except OpenAIError:
                    raise LLMServiceError(
                        "LM Studio failed while streaming the response. Check its server logs."
                    ) from None

                self.session.add_assistant_message("".join(chunks))
                completed = True
            finally:
                if stream is not None:
                    try:
                        stream.close()
                    except Exception:
                        pass
                if not completed:
                    self.session.truncate(prior_length)

    def reset(self) -> None:
        with self._request_lock:
            self.session.clear()
