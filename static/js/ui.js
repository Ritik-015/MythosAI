
// ==========================================
// UI Functions
// ==========================================


function addMessage(sender, message, type) {

    const div = document.createElement("div");

    div.className = `message ${type}`;

    div.innerHTML = `

        <div class="message-body">

            <div class="content">

                ${message}

            </div>

        </div>

    `;

    chat.appendChild(div);

    chat.scrollTop = chat.scrollHeight;

    return div;

}

function autoResizeTextarea() {

    messageBox.style.height = "auto";

    messageBox.style.height =
        Math.min(messageBox.scrollHeight, MAX_HEIGHT) + "px";

}

window.UI = {

    addMessage,

    autoResizeTextarea

};