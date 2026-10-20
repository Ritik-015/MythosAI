"""Socket.IO handlers with isolated in-memory conversations per client."""
from __future__ import annotations

from threading import Lock

from flask import request
from flask_socketio import emit

from config import MAX_CHAT_MESSAGE_CHARS
from core.llm import LLMClient, LLMServiceError
from core.logger import logger


def register_socket_events(socketio) -> None:
    clients: dict[str, LLMClient] = {}
    clients_lock = Lock()

    def client_for(sid: str) -> LLMClient:
        with clients_lock:
            client = clients.get(sid)
            if client is None:
                client = LLMClient()
                clients[sid] = client
            return client

    @socketio.on("connect")
    def connected(auth=None):
        client_for(request.sid)
        emit("server_status", {"connected": True})

    @socketio.on("disconnect")
    def disconnected(reason=None):
        with clients_lock:
            clients.pop(request.sid, None)

    @socketio.on("reset_chat")
    def reset_chat():
        client_for(request.sid).reset()
        emit("chat_reset", {"ok": True})

    @socketio.on("send_message")
    def receive_message(data):
        if not isinstance(data, dict):
            emit("stream_error", {"error": "Invalid message payload."})
            emit("stream_end")
            return

        message = data.get("message")
        if not isinstance(message, str) or not message.strip():
            emit("stream_error", {"error": "Enter a message before sending it."})
            emit("stream_end")
            return
        if len(message) > MAX_CHAT_MESSAGE_CHARS:
            emit(
                "stream_error",
                {"error": f"Message is too long. Limit it to {MAX_CHAT_MESSAGE_CHARS:,} characters."},
            )
            emit("stream_end")
            return

        client = client_for(request.sid)
        try:
            for token in client.stream_chat(message):
                emit("stream_token", {"token": token})
                socketio.sleep(0)
        except LLMServiceError as exc:
            logger.warning("LM Studio request failed: %s", str(exc))
            emit("stream_error", {"error": str(exc)})
        except Exception:
            logger.exception("Unexpected chat streaming failure.")
            emit(
                "stream_error",
                {"error": "An unexpected server error interrupted the response. Check logs/mythos.log for details."},
            )
        finally:
            emit("stream_end")
