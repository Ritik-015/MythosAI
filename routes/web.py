"""HTTP routes for the MythosAI shell and search service."""
from flask import jsonify, render_template, request

from config import (
    LM_STUDIO_BASE_URL,
    SEARCH_PROVIDER,
    SEARXNG_URL,
)
from core.llm import LLMClient, LLMServiceError
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


    @app.post("/api/research")
    def api_research():
        """Search a provider, then ask the configured LM Studio model using those sources."""
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            return jsonify({"error": "Send a JSON object containing a query."}), 400

        query = payload.get("query")
        provider = payload.get("provider")
        if not isinstance(query, str):
            return jsonify({"error": "Research query must be text."}), 400
        query = query.strip()
        if not query:
            return jsonify({"error": "Enter a research question."}), 400
        if len(query) > 500:
            return jsonify({"error": "Research questions must be 500 characters or fewer."}), 400

        try:
            retrieval = search_web(query, provider=provider, limit=8)
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
        except SearchConfigurationError as exc:
            return jsonify({"error": str(exc)}), exc.status_code
        except SearchError as exc:
            return jsonify({"error": str(exc)}), exc.status_code

        results = retrieval.get("results") if isinstance(retrieval, dict) else None
        results = results if isinstance(results, list) else []
        if not results:
            return jsonify({
                "query": query,
                "provider": retrieval.get("provider", "Selected provider"),
                "answer": "",
                "sources": [],
                "notice": retrieval.get("notice") or "No usable search results were returned. Mythos did not ask the model to answer without source evidence.",
                "answer_status": "no_results",
            })

        try:
            research = LLMClient().answer_with_sources(query, results)
        except LLMServiceError as exc:
            return jsonify({
                "error": str(exc),
                "provider": retrieval.get("provider", "Selected provider"),
                "sources": results,
            }), 502
        except Exception:
            from core.logger import logger
            logger.exception("Unexpected source-grounded research failure.")
            return jsonify({"error": "Research failed unexpectedly. Check logs/mythos.log for details."}), 500

        notice = retrieval.get("notice") or ""
        if not research["local"]:
            remote_notice = "The configured LM Studio-compatible endpoint is not on this computer; the question and retrieved snippets were sent to that configured endpoint."
            notice = f"{notice} {remote_notice}".strip()

        return jsonify({
            "query": query,
            "provider": retrieval.get("provider", "Selected provider"),
            "answer": research["answer"],
            "model": research["model"],
            "local_inference": research["local"],
            "sources": research["sources"],
            "notice": notice,
            "answer_status": "answered",
        })
