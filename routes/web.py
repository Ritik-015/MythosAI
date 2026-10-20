"""HTTP routes for the MythosAI shell and search service."""
from flask import jsonify, render_template, request

from config import (
    LM_STUDIO_BASE_URL,
    SEARCH_PROVIDER,
    SEARXNG_URL,
)
from core.llm import LLMClient
from tools.search import (
    SearchConfigurationError,
    SearchError,
    search_provider_status,
    search_web,
)


def register_routes(app) -> None:
    @app.route("/")
    def index():
        return render_template("index.html")

    @app.get("/api/health")
    def health():
        return jsonify({
            "app": "MythosAI",
            "lm_studio": LLMClient.check_health(),
            "search": {
                "default_provider": SEARCH_PROVIDER,
                "searxng_configured": bool(SEARXNG_URL),
                "providers": search_provider_status(),
            },
        })

    @app.post("/api/search")
    def api_search():
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            return jsonify({"error": "Send a JSON object containing a query."}), 400

        query = payload.get("query")
        provider = payload.get("provider")
        if not isinstance(query, str):
            return jsonify({"error": "Search query must be text."}), 400
        try:
            result = search_web(query, provider=provider)
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
        except SearchConfigurationError as exc:
            return jsonify({"error": str(exc)}), exc.status_code
        except SearchError as exc:
            return jsonify({"error": str(exc)}), exc.status_code

        return jsonify(result)
