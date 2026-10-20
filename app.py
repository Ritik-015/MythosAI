"""Local web application entry point for MythosAI."""
import os

from flask import Flask
from flask_socketio import SocketIO

from config import DEBUG, FLASK_SECRET_KEY, APP_PORT

# Keep the development app on loopback and same-origin by default.
# Socket.IO's default CORS policy permits the same origin; do not use "*".
socketio = SocketIO(async_mode="threading")


def create_app() -> Flask:
    app = Flask(__name__)
    app.config.update(
        SECRET_KEY=FLASK_SECRET_KEY,
        MAX_CONTENT_LENGTH=1024 * 1024,
    )

    from routes.web import register_routes
    register_routes(app)

    socketio.init_app(app)

    from routes.socket_events import register_socket_events
    register_socket_events(socketio)

    return app


app = create_app()


if __name__ == "__main__":
    # Development server only. Bind to loopback so the app is not exposed to the LAN.
    socketio.run(
        app,
        host="127.0.0.1",
        port=APP_PORT,
        debug=DEBUG,
        use_reloader=False,
        allow_unsafe_werkzeug=True,
    )
