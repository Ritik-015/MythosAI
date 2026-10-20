# MythosAI architecture (current prototype)

## Current scope

MythosAI is presently a localhost web application, not a bootable OS. This iteration keeps the existing Flask + Flask-SocketIO design and adds explicit boundaries for LM Studio and web search.

```text
Browser UI
 ├─ Socket.IO ──> per-connection chat session ──> LMStudio adapter ──> configured endpoint
 └─ POST /api/search ──> search adapter ──> SearXNG JSON or DuckDuckGo Instant Answers
```

## Components

- `app.py`: creates the Flask application, registers routes and Socket.IO handlers, and binds the development server to loopback.
- `config.py`: loads environment settings with safe local defaults and validates endpoint URLs and numeric settings.
- `core/session.py`: owns one in-memory conversation's messages and rollback behavior.
- `core/llm.py`: wraps the OpenAI-compatible LM Studio API, auto-discovers the first listed model when `MODEL_NAME` is blank, provides a short health probe, and streams text.
- `routes/socket_events.py`: validates inbound Socket.IO messages and creates one LLM client/history per connected Socket.IO session.
- `routes/web.py`: exposes the shell, `/api/health`, and `POST /api/search`.
- `tools/search.py`: provider adapters, normalization, URL checks, duplicate suppression, timeouts, result bounds, and honest fallback notices.
- `static/js/app.js`: chat interaction, sanitized Markdown rendering, service status, and search dialog/results.
- `static/vendor/socket.io.min.js`: bundled Socket.IO browser client copied from the project's supplied dependency tree.
- `static/css/search.css`: search dialog and results styling.

## Search flow

1. Browser submits a JSON query to `POST /api/search`.
2. Server validates the query length and provider.
3. Automatic mode uses the configured SearXNG JSON API first when available.
4. If SearXNG is configured but fails, automatic mode transparently falls back to DuckDuckGo Instant Answers.
5. Results are normalized to `title`, `url`, `snippet`, and `source`; unsafe URL schemes are omitted and tracking-only query parameters are ignored for deduplication.
6. The browser renders result metadata using `textContent` and opens external links with `noopener noreferrer`.

DuckDuckGo Instant Answers is a limited topic/summary endpoint, not a general web search result API. The independent crawler/index, BM25 ranking, search-to-LLM grounding and citation pipeline remain future work.

## Trust and privacy boundaries

- Default LM Studio endpoint is `http://127.0.0.1:1234/v1`, preventing an empty configuration from silently selecting a cloud endpoint.
- A non-loopback LM Studio endpoint is possible only when explicitly configured; `/api/health` reports whether the configured endpoint is local.
- Queries are sent to the selected search provider. Automatic mode can send the same query to DuckDuckGo Instant Answers as a fallback after SearXNG fails.
- Socket.IO uses the default same-origin policy; the development app binds to `127.0.0.1`.
- Model output is untrusted: the browser allows a small set of Markdown tags and restricts link protocols before adding parsed content to the DOM.
- Chat history is isolated per connection but remains in process memory and is discarded when that connection ends.
- The backend never logs chat message contents. Local logs rotate at a bounded size.
- Socket.IO is bundled locally. Marked and Prism are currently loaded from a CDN for Markdown/highlighting; a completely offline shell should vendor those assets too.
- This configuration is for local development, not an internet-facing production deployment.

## Next architecture steps

1. Add automated tests for the Flask routes and LM Studio adapter with mocked API responses.
2. Add explicit provider health/timeouts and persisted capability definitions.
3. Ground optional AI search summaries in retrieved result metadata and produce citations.
4. Add a local document index and search corpus only after file permissions, inclusion/exclusion rules and deletion behavior are designed.
5. Integrate voice recognition/synthesis as replaceable services driven by actual application state.
