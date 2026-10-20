# Changelog

## Local update — search and reliability foundation

- Added SearXNG JSON and DuckDuckGo Instant Answers search adapters, normalization, deduplication and honest provider limitations.
- Added `POST /api/search` and `GET /api/health`.
- Added a search dialog with provider selection, results, loading/error states and a query privacy notice.
- Set a safe loopback default for LM Studio and optional model auto-discovery.
- Added LM Studio health checks and actionable streaming errors.
- Isolated in-memory conversation state per Socket.IO client, validated message payloads and added reset-chat handling.
- Removed wildcard Socket.IO CORS and the hard-coded Flask secret; retained a loopback-only development server.
- Sanitized model-generated Markdown before inserting it into the DOM.
- Fixed script ordering and duplicate Socket.IO script inclusion; bundled the Socket.IO browser client locally.
- Converted `requirements.txt` to UTF-8 so Windows-created UTF-16 files do not break dependency installation.
- Disabled attachment, voice and settings controls until their implementations exist.
- Added unit tests for search normalization, validation and provider fallback.

## Known remaining work

- Run a full integration test with the user's local LM Studio model on Windows.
- Verify this exact requirements set installs cleanly in a fresh Windows virtual environment.
- Add model stream cancellation and chat persistence beyond a live connection.
- Build capability lifecycle and configuration service.
- Build independent crawler/index, BM25 ranking and search evaluation.
- Ground AI summaries in retrieved search evidence.
- Implement real voice capture, transcription, speech synthesis and orb-state synchronization.
