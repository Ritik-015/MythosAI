# MythosAI — local-first assistant and search foundation

MythosAI is currently a **local web application prototype**, built with Python, Flask, Flask-SocketIO and an OpenAI-compatible client for LM Studio. It is not yet a bootable operating system or a complete independent web search index.

This working copy preserves the existing Flask/Socket.IO architecture and adds a provider-based search endpoint, local LM Studio defaults, safer assistant-message rendering, and per-connection chat history.

## Requirements

- Windows 10/11, macOS, or Linux
- Python 3.11+ recommended
- Dependencies from `requirements.txt`
- LM Studio for local AI chat (optional for opening the app, required for chat responses)
- A modern browser
- Optional: a SearXNG instance for broader metasearch results

## Run on Windows

Open PowerShell in the extracted `MythosAI` folder:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
Copy-Item .env.example .env
python app.py
```

If PowerShell blocks virtual-environment activation under your policy, you can run the virtual-environment Python explicitly instead:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe app.py
```

Open `http://127.0.0.1:5000`.

If you already have a `.env`, keep a private backup and merge the new settings from `.env.example` rather than replacing your existing LM Studio settings blindly.

## LM Studio

1. Open LM Studio and load your model.
2. Open its Developer tab and start the local server.
3. Confirm the server address shown by LM Studio. The default is `http://127.0.0.1:1234`.
4. Set `LM_STUDIO_BASE_URL` in `.env` to the server's OpenAI-compatible base URL, normally `http://127.0.0.1:1234/v1`.
5. Set `MODEL_NAME` to the exact ID shown by `/v1/models`, or leave it blank for automatic selection of the first reported model.

The configuration defaults to loopback. If you deliberately configure a remote endpoint, your messages will be sent to that endpoint; MythosAI does not silently switch to a cloud model.

## Search

Use the **Search** button in the composer or choose **Research Anything** from the welcome screen.

Supported choices:
- **Automatic** — uses configured SearXNG when `SEARXNG_URL` is set; otherwise uses DuckDuckGo Instant Answers.
- **SearXNG** — requires your SearXNG instance to expose JSON results. Set `SEARXNG_URL`, for example `http://127.0.0.1:8080`.
- **DuckDuckGo Instant Answers** — an external summary/topic API. It does not provide a complete Google-like result page and may return no results for many queries.

Search queries are sent to the selected provider. Automatic mode may send a query to DuckDuckGo Instant Answers as a fallback if a configured SearXNG instance fails. MythosAI does not scrape Google/Yahoo result pages or fabricate missing search results.

For broader search, configure a SearXNG instance with the engines you choose, or add a documented/licensed provider adapter. Full independent crawling, indexing and BM25 ranking are future milestones, not yet implemented by this search adapter.

## Verification

Run unit tests:

```powershell
python -m unittest discover -s tests -v
```

Compile-check Python source without starting the server:

```powershell
python -m compileall -q app.py config.py core routes tools
```

The app exposes:
- `GET /api/health` — app, LM Studio reachability, and configured search-provider status.
- `POST /api/search` — accepts JSON such as `{"query":"Python Flask","provider":"auto"}`.

## Current limitations

- Search currently integrates SearXNG JSON and DuckDuckGo Instant Answers, not a proprietary full-text search index.
- Search summaries are not yet passed into LM Studio as grounded context.
- Conversation history is held in memory per active Socket.IO connection and is lost on disconnect/restart.
- Voice recognition/synthesis, document attachments, and the settings panel are not integrated yet; their unfinished controls are visibly disabled or report that status.
- Markdown and syntax-highlighting libraries are loaded from a CDN, so those visual enhancements require internet access. The AI inference default itself is local.
- This is a localhost-only development app, not a production-ready multi-user service. Do not expose it to the network without adding authentication, CSRF/origin review, secret persistence, rate limits, and a production server.

## Privacy and secrets

Do not commit `.env`, local logs, conversation exports, or API keys. The update ZIP intentionally excludes `.env`, `.git`, `node_modules`, and logs. Use `.env.example` as a starting point and keep personal credentials local.
