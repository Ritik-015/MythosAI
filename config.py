"""Application configuration for MythosAI.

Defaults deliberately point LM Studio at loopback so an empty .env never
silently falls back to a cloud AI endpoint.
"""
import os
import secrets
from urllib.parse import urlsplit

from dotenv import load_dotenv

load_dotenv()


def _env_int(name: str, default: int, minimum: int, maximum: int) -> int:
    raw = os.getenv(name, "").strip()
    if not raw:
        value = default
    else:
        try:
            value = int(raw)
        except ValueError as exc:
            raise RuntimeError(f"{name} must be an integer.") from exc
    if not minimum <= value <= maximum:
        raise RuntimeError(f"{name} must be between {minimum} and {maximum}.")
    return value


def _env_float(name: str, default: float, minimum: float, maximum: float) -> float:
    raw = os.getenv(name, "").strip()
    if not raw:
        value = default
    else:
        try:
            value = float(raw)
        except ValueError as exc:
            raise RuntimeError(f"{name} must be a number.") from exc
    if not minimum <= value <= maximum:
        raise RuntimeError(f"{name} must be between {minimum} and {maximum}.")
    return value


def _http_url(name: str, value: str) -> str:
    value = value.strip().rstrip("/")
    parts = urlsplit(value)
    if parts.scheme not in {"http", "https"} or not parts.hostname:
        raise RuntimeError(f"{name} must be a valid http:// or https:// URL.")
    if parts.username or parts.password or parts.query or parts.fragment:
        raise RuntimeError(f"{name} must not embed credentials, query parameters, or fragments.")
    return value


# Local-only default. The user may explicitly configure another endpoint.
LM_STUDIO_BASE_URL = _http_url(
    "LM_STUDIO_BASE_URL",
    os.getenv("LM_STUDIO_BASE_URL", "").strip() or "http://127.0.0.1:1234/v1",
)
LM_STUDIO_API_KEY = os.getenv("LM_STUDIO_API_KEY", "").strip() or "lm-studio"
MODEL_NAME = os.getenv("MODEL_NAME", "").strip() or None

TEMPERATURE = _env_float("TEMPERATURE", 0.7, 0.0, 2.0)
MAX_TOKENS = _env_int("MAX_TOKENS", 2048, 1, 131072)
MAX_CHAT_MESSAGE_CHARS = _env_int("MAX_CHAT_MESSAGE_CHARS", 12000, 1, 100000)

DEBUG = os.getenv("DEBUG", "false").strip().lower() in {"1", "true", "yes", "on"}
FLASK_SECRET_KEY = os.getenv("FLASK_SECRET_KEY", "").strip() or secrets.token_urlsafe(32)

SEARCH_PROVIDER = os.getenv("SEARCH_PROVIDER", "auto").strip().lower() or "auto"
_raw_searxng_url = os.getenv("SEARXNG_URL", "").strip()
SEARXNG_URL = _http_url("SEARXNG_URL", _raw_searxng_url) if _raw_searxng_url else ""
SEARCH_TIMEOUT_SECONDS = _env_float("SEARCH_TIMEOUT_SECONDS", 8.0, 1.0, 30.0)
SEARCH_MAX_RESULTS = _env_int("SEARCH_MAX_RESULTS", 10, 1, 50)
APP_PORT = _env_int("PORT", 5000, 1, 65535)
