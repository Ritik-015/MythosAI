"""Provider-independent web search adapters for MythosAI.

Supported sources:
- SearXNG JSON API (recommended for broad metasearch when configured)
- DuckDuckGo Instant Answers API (limited summaries/topics; not a full SERP)

Search queries are sent to the selected external provider when a request is made.
No query is sent to an AI model by this module.
"""
from __future__ import annotations

from html import unescape
from html.parser import HTMLParser
import json
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from urllib.request import Request, urlopen

from config import SEARCH_MAX_RESULTS, SEARCH_PROVIDER, SEARCH_TIMEOUT_SECONDS, SEARXNG_URL


_MAX_RESPONSE_BYTES = 3 * 1024 * 1024
_ALLOWED_PROVIDERS = {"auto", "searxng", "duckduckgo_ia"}
_TRACKING_KEYS = {"fbclid", "gclid", "dclid", "mc_cid", "mc_eid"}


class SearchError(Exception):
    """Safe-to-display search error with an HTTP status code."""

    status_code = 502


class SearchConfigurationError(SearchError):
    status_code = 503


class SearchProviderError(SearchError):
    status_code = 502


class _TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []

    def handle_data(self, data: str) -> None:
        self.parts.append(data)


def _plain_text(value: Any) -> str:
    if value is None:
        return ""
    extractor = _TextExtractor()
    try:
        extractor.feed(str(value))
        extractor.close()
        value = " ".join(extractor.parts)
    except Exception:
        value = str(value)
    return " ".join(unescape(value).split())


def _valid_http_url(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    value = value.strip()
    try:
        parts = urlsplit(value)
        if parts.scheme.lower() not in {"http", "https"} or not parts.hostname:
            return None
        # Accessing .port raises on malformed values such as :notaport.
        _ = parts.port
        if parts.username or parts.password:
            return None
        return value
    except ValueError:
        return None


def _canonical_key(url: str) -> str:
    parts = urlsplit(url)
    query = [
        (key, value)
        for key, value in parse_qsl(parts.query, keep_blank_values=True)
        if not key.lower().startswith("utm_") and key.lower() not in _TRACKING_KEYS
    ]
    path = parts.path.rstrip("/") or "/"
    return urlunsplit((parts.scheme.lower(), parts.netloc.lower(), path, urlencode(sorted(query)), ""))


def _normalize_results(items: list[dict[str, Any]], source: str, limit: int) -> list[dict[str, str]]:
    results: list[dict[str, str]] = []
    seen: set[str] = set()
    for item in items:
        url = _valid_http_url(item.get("url") or item.get("href") or item.get("firstURL"))
        if not url:
            continue
        key = _canonical_key(url)
        if key in seen:
            continue
        seen.add(key)

        parsed = urlsplit(url)
        title = _plain_text(item.get("title")) or parsed.hostname or url
        snippet = _plain_text(item.get("snippet") or item.get("content") or item.get("text"))
        engine = _plain_text(item.get("engine"))
        results.append({
            "title": title[:300],
            "url": url,
            "snippet": snippet[:2000],
            "source": f"{source} · {engine}" if engine and engine.lower() != source.lower() else source,
        })
        if len(results) >= limit:
            break
    return results


def _fetch_json(url: str) -> dict[str, Any]:
    request = Request(
        url,
        headers={
            "Accept": "application/json",
            "User-Agent": "MythosAI/0.2 (user-initiated search)",
        },
        method="GET",
    )
    try:
        with urlopen(request, timeout=SEARCH_TIMEOUT_SECONDS) as response:
            raw = response.read(_MAX_RESPONSE_BYTES + 1)
            if len(raw) > _MAX_RESPONSE_BYTES:
                raise SearchProviderError("The search provider returned an unexpectedly large response.")
            status = getattr(response, "status", 200)
            if status < 200 or status >= 300:
                raise SearchProviderError(f"The search provider returned HTTP {status}.")
    except HTTPError as exc:
        raise SearchProviderError(f"The search provider returned HTTP {exc.code}.") from None
    except (URLError, TimeoutError, OSError) as exc:
        # Deliberately avoid returning internal exception details or URLs to the UI.
        raise SearchProviderError("Could not reach the search provider. Check its availability and your network connection.") from None

    try:
        payload = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise SearchProviderError("The search provider returned invalid JSON.") from None
    if not isinstance(payload, dict):
        raise SearchProviderError("The search provider returned an unexpected response.")
    return payload


def _search_searxng(query: str, limit: int) -> dict[str, Any]:
    if not SEARXNG_URL:
        raise SearchConfigurationError(
            "SearXNG is not configured. Set SEARXNG_URL in .env, or select Automatic/DuckDuckGo Instant Answers."
        )
    endpoint = SEARXNG_URL.rstrip("/") + "/search?" + urlencode({
        "q": query,
        "format": "json",
        "safesearch": "1",
    })
    payload = _fetch_json(endpoint)
    items = payload.get("results")
    if not isinstance(items, list):
        raise SearchProviderError(
            "SearXNG did not return JSON search results. Confirm JSON format is enabled in its settings."
        )
    valid_items = [item for item in items if isinstance(item, dict)]
    results = _normalize_results(valid_items, "SearXNG", limit)
    return {
        "query": query,
        "provider": "SearXNG",
        "results": results,
        "notice": "" if results else "SearXNG responded but returned no usable results.",
        "fallback": False,
    }


def _flatten_ddg_topics(topics: Any, out: list[dict[str, Any]]) -> None:
    if not isinstance(topics, list):
        return
    for topic in topics:
        if not isinstance(topic, dict):
            continue
        if isinstance(topic.get("Topics"), list):
            _flatten_ddg_topics(topic["Topics"], out)
        else:
            out.append({
                "title": topic.get("Text", ""),
                "url": topic.get("FirstURL", ""),
                "snippet": topic.get("Text", ""),
            })


def _search_duckduckgo_ia(query: str, limit: int) -> dict[str, Any]:
    endpoint = "https://api.duckduckgo.com/?" + urlencode({
        "q": query,
        "format": "json",
        "no_html": "1",
        "skip_disambig": "1",
    })
    payload = _fetch_json(endpoint)

    items: list[dict[str, Any]] = []
    if payload.get("AbstractURL"):
        items.append({
            "title": payload.get("Heading") or query,
            "url": payload.get("AbstractURL"),
            "snippet": payload.get("AbstractText") or payload.get("Definition") or "",
        })
    _flatten_ddg_topics(payload.get("RelatedTopics"), items)

    results = _normalize_results(items, "DuckDuckGo Instant Answers", limit)
    notice = (
        "DuckDuckGo Instant Answers is a limited summary/topic API, not a complete web search results API. "
        "Configure SearXNG for broader metasearch. This search query was sent to DuckDuckGo."
    )
    if not results:
        notice = (
            "DuckDuckGo Instant Answers returned no usable results. It is not a complete web search API; "
            "configure a SearXNG instance or another permitted search API for broader results."
        )
    return {
        "query": query,
        "provider": "DuckDuckGo Instant Answers",
        "results": results,
        "notice": notice,
        "fallback": False,
    }


def search_web(query: str, provider: str | None = None, limit: int | None = None) -> dict[str, Any]:
    """Run a real query through a configured provider; never fabricate results."""
    if not isinstance(query, str):
        raise ValueError("Search query must be text.")
    query = query.strip()
    if not query:
        raise ValueError("Enter a search query.")
    if len(query) > 500:
        raise ValueError("Search queries must be 500 characters or fewer.")

    if provider is not None and not isinstance(provider, str):
        raise ValueError("Search provider must be a string.")
    selected = (provider or SEARCH_PROVIDER or "auto").strip().lower()
    if selected not in _ALLOWED_PROVIDERS:
        raise ValueError(f"Unknown search provider: {selected}.")
    result_limit = max(1, min(int(limit or SEARCH_MAX_RESULTS), 50))

    if selected == "searxng":
        return _search_searxng(query, result_limit)
    if selected == "duckduckgo_ia":
        return _search_duckduckgo_ia(query, result_limit)

    if SEARXNG_URL:
        try:
            return _search_searxng(query, result_limit)
        except SearchProviderError:
            fallback = _search_duckduckgo_ia(query, result_limit)
            fallback["fallback"] = True
            fallback["notice"] = (
                "SearXNG was unavailable, so Mythos used DuckDuckGo Instant Answers as a limited fallback. "
                + fallback["notice"]
            )
            return fallback
    return _search_duckduckgo_ia(query, result_limit)


def search_provider_status() -> dict[str, dict[str, Any]]:
    return {
        "auto": {
            "label": "Automatic",
            "available": True,
            "description": "Uses configured SearXNG, otherwise DuckDuckGo Instant Answers.",
        },
        "searxng": {
            "label": "SearXNG",
            "available": bool(SEARXNG_URL),
            "configured": bool(SEARXNG_URL),
            "description": "Self-hosted metasearch; requires SEARXNG_URL and JSON output.",
        },
        "duckduckgo_ia": {
            "label": "DuckDuckGo Instant Answers",
            "available": True,
            "description": "Limited topic/summary results, not a full web search API.",
        },
    }
