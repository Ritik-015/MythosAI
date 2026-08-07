# from core.llm import test_connection

# if __name__ == "__main__":
#     test_connection()         ## Here my first intention was to test the connection to the LM Studio.


# from core.llm import LLMClient

# llm = LLMClient()

# print("=".center(50, "="))
# print("Mythos AI".center(50, " "))
# print("=".center(50, "="))

# while True:

#     user = input("\nYou: ")

#     if user.lower() in ["exit", "quit", "sleep", "q"]:
#         break

#     answer = llm.chat(user)

#     print("\n Mythos: \n ")

#     print(answer)


from flask import Flask
from flask_socketio import SocketIO

from config import DEBUG

socketio = SocketIO(
    cors_allowed_origins="*"
)


def create_app():

    app = Flask(__name__)

    app.config["SECRET_KEY"] = "mythos-secret"

    socketio.init_app(app)

    from routes.web import register_routes
    register_routes(app)

    from routes.socket_events import register_socket_events
    register_socket_events(socketio)

    return app


app = create_app()

if __name__ == "__main__":

    socketio.run(
        app, 
        host="127.0.0.1",
        port=5000,
        debug=DEBUG
    )

