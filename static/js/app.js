console.log("App.js Loaded");

const socket = io();

const sendButton = document.getElementById("send");
const messageBox = document.getElementById("message");
const chat = document.getElementById("chat");
let currentAssistantMessage = null;

socket.on("connect", () => {
    // console.log("Connected");
});

function addMessage(sender, message, type) {

    const div = document.createElement("div");

    div.className = `message ${type}`;

    div.innerHTML = `
        <div class="content">${message}</div>
    `;

    chat.appendChild(div);

    chat.scrollTop = chat.scrollHeight;

    return div;
}

sendButton.addEventListener("click", () => {

    const message = messageBox.value.trim();

    if(message === "")
        return;

    addMessage("", message, "user");

    currentAssistantMessage = addMessage("", "● Thinking...", "assistant");

    isThinking = true;

    socket.emit("send_message", {
        message: message
    });

    messageBox.value = "";

    messageBox.focus();
});

messageBox.addEventListener("keydown", (event) => {

    if(event.key === "Enter"){
        sendButton.click();
    }

});

socket.on("stream_token", (data) => {

    if(isThinking){

    const content =
        currentAssistantMessage.querySelector(".content");

    content.textContent = "";

    isThinking = false;
}

    const content = currentAssistantMessage.querySelector(".content");

    content.textContent += data.token;

    chat.scrollTop = chat.scrollHeight;

});

socket.on("stream_end", () => {

    currentAssistantMessage = null;
    let isThinking = false;

});