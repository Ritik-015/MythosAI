from flask_socketio import emit
from core.llm import LLMClient

llm = LLMClient()

def register_socket_events(socketio):

    @socketio.on("connect")
    def connected():
        print("Client Connected")

    @socketio.on("disconnect")
    def disconnected():
        print("Client Disconnected")

    @socketio.on("send_message")
    def receive_message(data):

        print("User:", data["message"])

        for token in llm.stream_chat(data["message"]):

            print(repr(token))

            emit(
                "stream_token",
                {
                    "token": token
                }
            )

            socketio.sleep(0)

        print("Streaming Finished")

        emit("stream_end")