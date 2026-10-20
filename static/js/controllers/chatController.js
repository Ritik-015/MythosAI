// // ==========================================
// // MythosAI
// // Chat Controller
// // ==========================================

// const ChatController = (() => {

//     let chat = null;
//     let currentAssistantMessage = null;
//     let isThinking = false;

//     function init(chatElement) {

//         chat = chatElement;

//     }

//     function addMessage(message, type) {

//         const div = document.createElement("div");

//         div.className = `message ${type}`;

//         div.innerHTML = `
//             <div class="message-body">
//                 <div class="content">
//                     ${message}
//                 </div>
//             </div>
//         `;

//         chat.appendChild(div);

//         chat.scrollTop = chat.scrollHeight;

//         return div;

//     }

//     function startThinking() {

//         currentAssistantMessage = addMessage(
//             "● Thinking...",
//             "assistant"
//         );

//         isThinking = true;

//     }

//     function streamToken(token) {

//         if (!currentAssistantMessage)
//             return;

//         const content =
//             currentAssistantMessage.querySelector(".content");

//         if (isThinking) {

//             content.textContent = "";

//             isThinking = false;

//         }

//         content.textContent += token;

//         chat.scrollTop = chat.scrollHeight;

//     }

//     function finishStreaming() {

//         currentAssistantMessage = null;

//         isThinking = false;

//     }

//     return {

//         init,
//         addMessage,
//         startThinking,
//         streamToken,
//         finishStreaming

//     };

// })();
