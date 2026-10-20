# MythosAI project audit — uploaded ZIP and local update

## Source inspected

- Source of truth: the user's uploaded `MythosAI.zip`.
- Embedded Git branch: `feature/ui-redesign`.
- Embedded HEAD: `163f7b9` (`feat: add welcome screen`).
- The archive contains local uncommitted changes relative to that commit. Those files were preserved as the starting point; the Git metadata is not included in the downloadable clean source package.
- Environment reported by the user: Windows x64, Node.js 24.12.0, Lenovo PC, RTX 4060, 16 GB RAM and 1 TB storage. These are user-reported, not hardware-tested here.

## Existing architecture

- Python application using Flask and Flask-SocketIO.
- `core/llm.py` uses the OpenAI Python client against a configured API-compatible endpoint.
- `core/session.py` stores an in-memory message history.
- Existing frontend uses HTML/CSS/JavaScript, Socket.IO, Marked, and Prism.
- `tools/search.py`, several voice modules, and `core/streaming.py` were empty in the uploaded working tree.
- `tests/` had no test files in the uploaded working tree.
- The settings and voice controls were visible in the UI but not fully implemented.

## Defects addressed in this update

1. Converted `requirements.txt` from UTF-16LE to UTF-8. The former encoding includes NUL bytes and is not a suitable pip requirements-file encoding.
2. Added explicit local LM Studio defaults so blank endpoint configuration does not silently select the OpenAI cloud endpoint.
3. Added model auto-discovery when `MODEL_NAME` is blank, a bounded health probe, actionable service errors and failed-stream history rollback.
4. Replaced one global LLM conversation with a separate in-memory client/session for each connected Socket.IO client.
5. Validated Socket.IO payload shape and message length; removed prompt text from routine logging.
6. Removed wildcard Socket.IO CORS and a hard-coded Flask secret. The dev server remains bound to loopback.
7. Added a provider adapter for SearXNG JSON and DuckDuckGo Instant Answers, with result normalization, safe URL schemes, deduplication, result limits, timeouts and transparent fallback notices.
8. Added `GET /api/health` and `POST /api/search`, plus an interactive search dialog in the frontend.
9. Sanitized model-generated Markdown before inserting it into the DOM; external links receive `noopener noreferrer`.
10. Removed duplicate Socket.IO script inclusion and bundled the Socket.IO browser client already present in the supplied dependency tree.
11. Marked attachment, voice and settings controls unavailable until their functionality exists.
12. Added unit tests for search, conversation history and the LM Studio adapter.

## Verification performed in the available environment

- `python -m unittest discover -s tests -v`: 10 passed; 3 LM-adapter tests skipped because the execution environment lacks the `openai` package.
- `python -m compileall -q app.py config.py core routes tools tests`: passed.
- `node --check static/js/app.js`: passed.
- `node --check static/js/services/socketService.js`: passed.
- Jinja template parse and referenced-ID consistency check: passed.
- Confirmed the default LM Studio URL is `http://127.0.0.1:1234/v1`.
- A dependency install attempt failed because the execution environment could not resolve the package index hostname. Therefore the full app could not be started here.

## Not yet verified

- Installation of the pinned dependency set in a fresh Windows virtual environment.
- Live Flask/Socket.IO integration (Flask dependencies were not installed in this execution environment).
- Connection to the user's LM Studio server or model.
- Live network search results (network calls were unavailable during this verification).
- Operation on the user's actual Lenovo PC.

## Search limitations

DuckDuckGo Instant Answers is not a full general web search results API and may return no results. For broader metasearch, configure a SearXNG instance and set `SEARXNG_URL` in `.env`. Automatic mode uses configured SearXNG first, then transparently falls back to DuckDuckGo Instant Answers if SearXNG fails. Full independent crawling/indexing, BM25 ranking and AI-grounded summaries remain future milestones.

## REA status from the user's diagnostic

- REA CLI package identity: 6.5.0.
- Node and Windows host checks: healthy.
- VS Code MCP registration: aligned.
- REA workflow skill: version 42, aligned.
- Overall `environment_healthy` remains false because optional native analysis providers/other clients are not configured and the live MCP server state is unknown.
- The missing Hopper/Ghidra/IDA/JADX providers are not blockers for static JavaScript or authorized web-interface investigation. Do not install them as a blanket requirement.

## Immediate next actions

1. On the user's Windows PC, install dependencies in a fresh virtual environment and run the included tests.
2. Start LM Studio and verify `http://127.0.0.1:1234/v1/models` (or the port shown in LM Studio).
3. Run MythosAI and test chat plus `/api/health`.
4. Configure a SearXNG instance if broader search results are desired.
5. Add Flask-route integration tests, cancellation, capability registry/lifecycle, then search-to-LLM citations.
