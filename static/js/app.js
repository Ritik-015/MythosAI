/* MythosAI browser client. All server/model output is treated as untrusted text. */
"use strict";

const socket = SocketService.socket;

const sendButton = document.getElementById("send");
const messageBox = document.getElementById("message");
const chat = document.getElementById("chat");
const welcomeScreen = document.getElementById("welcome");
const statusBadge = document.querySelector(".workspace-header .status");
const searchButton = document.getElementById("search-btn");
const searchDialog = document.getElementById("search-dialog");
const searchForm = document.getElementById("search-form");
const searchInput = document.getElementById("search-query");
const searchProvider = document.getElementById("search-provider");
const searchStatus = document.getElementById("search-status");
const searchResults = document.getElementById("search-results");
const searchSubmit = document.getElementById("search-submit");
const researchSubmit = document.getElementById("research-submit");
const researchAnswer = document.getElementById("research-answer");
const researchMeta = document.getElementById("research-meta");
const researchAnswerContent = document.getElementById("research-answer-content");
const researchSources = document.getElementById("research-sources");
const researchNotice = document.getElementById("research-notice");
const newChatButton = document.querySelector(".new-chat");
const MAX_HEIGHT = 180;
const MAX_QUERY_CHARS = 500;

let currentAssistantMessage = null;
let isThinking = false;
let isGenerating = false;
let lastStreamFailed = false;
let activeSearchController = null;
let activeResearchController = null;

function setStatus(message, state = "ready") {
    if (!statusBadge) return;
    statusBadge.textContent = message;
    statusBadge.dataset.state = state;
}

function startConversation() {
    // Keep chat as a workspace destination without removing the new Files view.
    window.MythosWorkspace?.activateView("chat");
    if (welcomeScreen) welcomeScreen.style.display = "none";
    if (chat) chat.style.display = "block";
}

function lockInput() {
    isGenerating = true;
    if (messageBox) messageBox.disabled = true;
    if (sendButton) sendButton.disabled = true;
    if (newChatButton) newChatButton.disabled = true;
}

function unlockInput() {
    isGenerating = false;
    if (messageBox) {
        messageBox.disabled = false;
        messageBox.focus();
    }
    if (sendButton) sendButton.disabled = false;
    if (newChatButton) newChatButton.disabled = false;
}

function autoResizeTextarea() {
    if (!messageBox) return;
    messageBox.style.height = "auto";
    messageBox.style.height = `${Math.min(messageBox.scrollHeight, MAX_HEIGHT)}px`;
}

/* Sanitize Markdown parsed from the model. Do not trust model output as HTML. */
const ALLOWED_MARKDOWN_TAGS = new Set([
    "p", "br", "hr", "h1", "h2", "h3", "h4", "h5", "h6",
    "strong", "b", "em", "i", "del", "s", "blockquote",
    "ul", "ol", "li", "pre", "code", "a",
    "table", "thead", "tbody", "tr", "th", "td"
]);
const DROP_ENTIRELY_TAGS = new Set([
    "script", "style", "iframe", "object", "embed", "svg", "math",
    "form", "input", "button", "link", "meta", "base", "img",
    "video", "audio", "source", "template"
]);

function safeWebUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== "string") return null;
    try {
        const url = new URL(rawUrl, window.location.origin);
        return ["http:", "https:"].includes(url.protocol) ? url.href : null;
    } catch {
        return null;
    }
}

function sanitizeMarkdownNode(sourceNode) {
    if (sourceNode.nodeType === Node.TEXT_NODE) {
        return document.createTextNode(sourceNode.textContent || "");
    }
    if (sourceNode.nodeType !== Node.ELEMENT_NODE) return null;

    const tag = sourceNode.tagName.toLowerCase();
    if (DROP_ENTIRELY_TAGS.has(tag)) return null;

    if (!ALLOWED_MARKDOWN_TAGS.has(tag)) {
        const fragment = document.createDocumentFragment();
        for (const child of sourceNode.childNodes) {
            const safeChild = sanitizeMarkdownNode(child);
            if (safeChild) fragment.append(safeChild);
        }
        return fragment;
    }

    const cleanNode = document.createElement(tag);
    if (tag === "a") {
        const href = safeWebUrl(sourceNode.getAttribute("href"));
        if (href) {
            cleanNode.setAttribute("href", href);
            cleanNode.setAttribute("target", "_blank");
            cleanNode.setAttribute("rel", "noopener noreferrer");
            const title = sourceNode.getAttribute("title");
            if (title) cleanNode.setAttribute("title", title.slice(0, 300));
        } else {
            const fragment = document.createDocumentFragment();
            for (const child of sourceNode.childNodes) {
                const safeChild = sanitizeMarkdownNode(child);
                if (safeChild) fragment.append(safeChild);
            }
            return fragment;
        }
    } else if (tag === "code") {
        const className = sourceNode.getAttribute("class") || "";
        const match = className.match(/(?:^|\s)language-([a-zA-Z0-9_+-]{1,40})(?:\s|$)/);
        if (match) cleanNode.className = `language-${match[1].toLowerCase()}`;
    }

    for (const child of sourceNode.childNodes) {
        const safeChild = sanitizeMarkdownNode(child);
        if (safeChild) cleanNode.append(safeChild);
    }
    return cleanNode;
}

function renderAssistantMarkdown(container, rawText) {
    if (!window.marked || typeof window.marked.parse !== "function") {
        container.textContent = rawText;
        return;
    }

    try {
        const parsed = new DOMParser().parseFromString(
            window.marked.parse(rawText, { gfm: true }),
            "text/html"
        );
        const fragment = document.createDocumentFragment();
        for (const child of parsed.body.childNodes) {
            const safeChild = sanitizeMarkdownNode(child);
            if (safeChild) fragment.append(safeChild);
        }
        container.replaceChildren(fragment);
        if (window.Prism && typeof window.Prism.highlightAllUnder === "function") {
            window.Prism.highlightAllUnder(container);
        }
        decorateCodeBlocks(container);
    } catch (error) {
        console.error("Markdown rendering failed; showing plain text.", error);
        container.textContent = rawText;
    }
}

function addMessage(message, type) {
    const div = document.createElement("div");
    div.className = `message ${type}`;

    const body = document.createElement("div");
    body.className = "message-body";
    const content = document.createElement("div");
    content.className = "content";
    body.appendChild(content);
    div.appendChild(body);

    if (type === "assistant") {
        content.dataset.raw = String(message ?? "");
        renderAssistantMarkdown(content, content.dataset.raw);
    } else {
        content.textContent = String(message ?? "");
    }

    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
    return div;
}

function decorateCodeBlocks(container) {
    container.querySelectorAll("pre").forEach((pre) => {
        if (pre.parentElement && pre.parentElement.classList.contains("code-wrapper")) return;

        const wrapper = document.createElement("div");
        wrapper.className = "code-wrapper";
        const toolbar = document.createElement("div");
        toolbar.className = "code-toolbar";
        const language = document.createElement("span");
        language.className = "code-language";

        const code = pre.querySelector("code");
        const languageClass = code
            ? [...code.classList].find((cls) => cls.startsWith("language-"))
            : "";
        const lang = languageClass ? languageClass.slice("language-".length) : "text";
        language.textContent = lang.charAt(0).toUpperCase() + lang.slice(1);

        const copyButton = document.createElement("button");
        copyButton.className = "copy-btn";
        copyButton.type = "button";
        copyButton.textContent = "Copy code";
        copyButton.addEventListener("click", async () => {
            try {
                await navigator.clipboard.writeText(pre.innerText);
                copyButton.textContent = "Copied";
            } catch {
                copyButton.textContent = "Copy unavailable";
            }
            window.setTimeout(() => { copyButton.textContent = "Copy code"; }, 1800);
        });

        toolbar.append(language, copyButton);
        pre.parentNode.insertBefore(wrapper, pre);
        wrapper.append(toolbar, pre);
    });
}

function openSearch() {
    if (!searchDialog) {
        setStatus("Search interface unavailable", "error");
        return;
    }
    if (typeof searchDialog.showModal === "function") {
        if (!searchDialog.open) searchDialog.showModal();
    } else {
        searchDialog.setAttribute("open", "");
    }
    window.setTimeout(() => searchInput?.focus(), 0);
}

function closeSearch() {
    if (activeSearchController) {
        activeSearchController.abort();
        activeSearchController = null;
    }
    if (activeResearchController) {
        activeResearchController.abort();
        activeResearchController = null;
    }
    if (searchDialog?.open && typeof searchDialog.close === "function") searchDialog.close();
    else searchDialog?.removeAttribute("open");
}

function renderSearchResults(results) {
    searchResults.replaceChildren();
    for (const result of results) {
        const url = safeWebUrl(result.url);
        if (!url) continue;

        const article = document.createElement("article");
        article.className = "search-result";
        const title = document.createElement("a");
        title.className = "search-result-title";
        title.href = url;
        title.target = "_blank";
        title.rel = "noopener noreferrer";
        title.textContent = result.title || url;

        const host = document.createElement("div");
        host.className = "search-result-url";
        host.textContent = new URL(url).hostname;

        const snippet = document.createElement("p");
        snippet.className = "search-result-snippet";
        snippet.textContent = result.snippet || "No summary was provided by this source.";

        const source = document.createElement("span");
        source.className = "search-result-source";
        source.textContent = result.source || "Search provider";

        article.append(title, host, snippet, source);
        searchResults.appendChild(article);
    }
}

async function executeSearch() {
    if (activeResearchController) {
        activeResearchController.abort();
        activeResearchController = null;
    }
    if (researchAnswer) researchAnswer.hidden = true;
    const query = (searchInput?.value || "").trim();
    if (!query) {
        searchStatus.textContent = "Enter a search query.";
        searchInput?.focus();
        return;
    }
    if (query.length > MAX_QUERY_CHARS) {
        searchStatus.textContent = `Keep the query to ${MAX_QUERY_CHARS} characters or fewer.`;
        return;
    }

    if (activeSearchController) activeSearchController.abort();
    activeSearchController = new AbortController();
    const controller = activeSearchController;
    searchSubmit.disabled = true;
    searchResults.replaceChildren();
    searchStatus.textContent = "Searching the selected provider…";

    try {
        const response = await fetch("/api/search", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Accept": "application/json" },
            body: JSON.stringify({ query, provider: searchProvider?.value || "auto" }),
            signal: controller.signal,
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || `Search failed (HTTP ${response.status}).`);

        renderSearchResults(Array.isArray(payload.results) ? payload.results : []);
        const count = searchResults.childElementCount;
        const providerName = payload.provider || "Selected provider";
        searchStatus.textContent = count
            ? `${count} result${count === 1 ? "" : "s"} · ${providerName}`
            : `No results · ${providerName}`;
        if (payload.notice) {
            const notice = document.createElement("p");
            notice.className = "search-notice";
            notice.textContent = payload.notice;
            searchResults.prepend(notice);
        }
    } catch (error) {
        if (error.name === "AbortError") return;
        searchStatus.textContent = error.message || "Search failed. Check your provider configuration.";
    } finally {
        if (activeSearchController === controller) activeSearchController = null;
        searchSubmit.disabled = false;
    }
}

function renderResearchSources(sources) {
    researchSources?.replaceChildren();
    if (!researchSources) return;

    (Array.isArray(sources) ? sources : []).forEach((source, index) => {
        const url = safeWebUrl(source?.url);
        if (!url) return;

        const item = document.createElement("li");
        item.className = "research-source";
        const heading = document.createElement("div");
        heading.className = "research-source-heading";
        const reference = document.createElement("span");
        reference.className = "research-source-reference";
        reference.textContent = `[${Number.isInteger(source.reference) ? source.reference : index + 1}]`;

        const title = document.createElement("a");
        title.href = url;
        title.target = "_blank";
        title.rel = "noopener noreferrer";
        title.textContent = source.title || new URL(url).hostname;
        heading.append(reference, title);

        const host = document.createElement("div");
        host.className = "research-source-url";
        host.textContent = `${new URL(url).hostname}${source.source ? ` · ${source.source}` : ""}`;

        const snippet = document.createElement("p");
        snippet.className = "research-source-snippet";
        snippet.textContent = source.snippet || "The provider returned no snippet for this source.";
        item.append(heading, host, snippet);
        researchSources.appendChild(item);
    });
}

async function executeResearch() {
    const query = (searchInput?.value || "").trim();
    if (!query) {
        searchStatus.textContent = "Enter a research question.";
        searchInput?.focus();
        return;
    }
    if (query.length > MAX_QUERY_CHARS) {
        searchStatus.textContent = `Keep the question to ${MAX_QUERY_CHARS} characters or fewer.`;
        return;
    }

    if (activeSearchController) {
        activeSearchController.abort();
        activeSearchController = null;
    }
    if (activeResearchController) activeResearchController.abort();
    const controller = new AbortController();
    activeResearchController = controller;

    if (researchAnswer) researchAnswer.hidden = false;
    if (researchAnswerContent) {
        researchAnswerContent.textContent = "Searching the selected provider, then asking your configured LM Studio model to answer from the retrieved evidence…";
    }
    if (researchMeta) researchMeta.textContent = "This can take a little longer than a normal search.";
    if (researchSources) researchSources.replaceChildren();
    if (researchNotice) {
        researchNotice.hidden = true;
        researchNotice.textContent = "";
    }
    if (searchResults) searchResults.replaceChildren();
    if (researchSubmit) researchSubmit.disabled = true;
    if (searchSubmit) searchSubmit.disabled = true;
    if (searchStatus) searchStatus.textContent = "Researching with retrieved sources…";

    try {
        const response = await fetch("/api/research", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Accept": "application/json" },
            body: JSON.stringify({ query, provider: searchProvider?.value || "auto" }),
            signal: controller.signal,
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            const error = new Error(payload.error || `Research failed (HTTP ${response.status}).`);
            error.sources = payload.sources;
            throw error;
        }

        if (payload.answer_status === "no_results" || !Array.isArray(payload.sources) || payload.sources.length === 0) {
            if (researchAnswerContent) {
                researchAnswerContent.textContent = "No usable search results were returned, so Mythos did not ask the model to generate an answer without source evidence.";
            }
            if (researchMeta) researchMeta.textContent = `Search provider: ${payload.provider || "selected provider"}`;
            searchStatus.textContent = "No usable sources found.";
        } else {
            if (researchAnswerContent) {
                researchAnswerContent.dataset.raw = String(payload.answer || "");
                renderAssistantMarkdown(researchAnswerContent, researchAnswerContent.dataset.raw);
            }
            renderResearchSources(payload.sources);
            const locationLabel = payload.local_inference === true
                ? "local endpoint"
                : payload.local_inference === false ? "remote endpoint" : "configured endpoint";
            if (researchMeta) {
                researchMeta.textContent = `${payload.model || "LM Studio model"} · ${locationLabel} · ${payload.provider || "search provider"}`;
            }
            searchStatus.textContent = `Research answer ready · ${payload.sources.length} cited source${payload.sources.length === 1 ? "" : "s"}`;
        }

        if (payload.notice && researchNotice) {
            researchNotice.textContent = payload.notice;
            researchNotice.hidden = false;
        }
        setStatus(payload.local_inference === false ? "Research used remote endpoint" : "Research complete", payload.local_inference === false ? "warning" : "ready");
    } catch (error) {
        if (error.name === "AbortError") return;
        if (researchAnswerContent) {
            researchAnswerContent.textContent = error.message || "Research failed. Check search provider and LM Studio settings.";
        }
        if (error.sources) renderResearchSources(error.sources);
        if (researchMeta) researchMeta.textContent = "The answer was not completed.";
        if (researchNotice) {
            researchNotice.textContent = "No generated answer is shown as verified when the research request fails.";
            researchNotice.hidden = false;
        }
        searchStatus.textContent = error.message || "Research failed.";
        setStatus("Research failed", "error");
    } finally {
        if (activeResearchController === controller) activeResearchController = null;
        if (researchSubmit) researchSubmit.disabled = false;
        if (searchSubmit) searchSubmit.disabled = false;
    }
}

function sendMessage(messageOverride = null) {
    if (isGenerating) return;
    const message = (messageOverride ?? messageBox?.value ?? "").trim();
    if (!message) return;

    lockInput();
    lastStreamFailed = false;
    setStatus("Thinking…", "busy");
    startConversation();
    addMessage(message, "user");
    currentAssistantMessage = addMessage("Thinking…", "assistant");
    isThinking = true;

    socket.emit("send_message", { message });
    if (messageBox) {
        messageBox.value = "";
        autoResizeTextarea();
    }
}

sendButton?.addEventListener("click", () => sendMessage());
messageBox?.addEventListener("input", autoResizeTextarea);
messageBox?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        sendButton?.click();
    }
});

searchButton?.addEventListener("click", openSearch);
document.getElementById("search-close")?.addEventListener("click", closeSearch);
searchForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    executeSearch();
});
researchSubmit?.addEventListener("click", executeResearch);
searchDialog?.addEventListener("close", () => {
    if (activeSearchController) activeSearchController.abort();
    if (activeResearchController) activeResearchController.abort();
});

newChatButton?.addEventListener("click", () => {
    if (isGenerating) return;
    window.MythosWorkspace?.activateView("chat");
    socket.emit("reset_chat");
    chat.replaceChildren();
    chat.style.display = "none";
    if (welcomeScreen) welcomeScreen.style.display = "flex";
    currentAssistantMessage = null;
    isThinking = false;
    if (messageBox) {
        messageBox.value = "";
        autoResizeTextarea();
        messageBox.focus();
    }
    setStatus("New conversation", "ready");
});

document.querySelectorAll(".suggestion-card").forEach((button) => {
    button.addEventListener("click", () => {
        const label = button.textContent.trim();
        if (label.includes("Research Anything")) {
            openSearch();
        } else if (label.includes("Continue MythosAI")) {
            messageBox.value = "Help me continue developing MythosAI from its current project state.";
            messageBox.focus();
            autoResizeTextarea();
        } else if (label.includes("Analyze Documents")) {
            setStatus("Document analysis is not implemented yet", "warning");
        } else if (label.includes("Voice Mode")) {
            setStatus("Voice is not integrated yet", "warning");
        }
    });
});

socket.on("connect", () => {
    setStatus("Checking services…", "busy");
    refreshHealth();
});

socket.on("disconnect", () => setStatus("App disconnected", "error"));
socket.on("connect_error", () => setStatus("App connection failed", "error"));
socket.on("server_status", () => refreshHealth());

socket.on("stream_token", (data) => {
    if (!currentAssistantMessage || typeof data?.token !== "string") return;
    const content = currentAssistantMessage.querySelector(".content");
    if (isThinking) {
        content.dataset.raw = "";
        isThinking = false;
    }
    content.dataset.raw = (content.dataset.raw || "") + data.token;
    renderAssistantMarkdown(content, content.dataset.raw);
    chat.scrollTop = chat.scrollHeight;
});

socket.on("stream_error", (data) => {
    lastStreamFailed = true;
    if (currentAssistantMessage) {
        const content = currentAssistantMessage.querySelector(".content");
        content.textContent = data?.error || "The response failed.";
        content.removeAttribute("data-raw");
    }
    setStatus("AI unavailable", "error");
});

socket.on("stream_end", () => {
    currentAssistantMessage = null;
    isThinking = false;
    unlockInput();
    if (!lastStreamFailed) setStatus("Connected", "ready");
});

socket.on("chat_reset", () => {
    // The server confirms only that this socket's in-memory history was cleared.
});

async function refreshHealth() {
    try {
        const response = await fetch("/api/health", { headers: { "Accept": "application/json" } });
        if (!response.ok) throw new Error("Health check failed.");
        const payload = await response.json();
        const lm = payload.lm_studio || {};
        if (!lm.ok) {
            setStatus("LM Studio offline", "warning");
        } else if (lm.local === false) {
            setStatus("Remote AI endpoint", "warning");
        } else {
            setStatus("LM Studio connected", "ready");
        }
    } catch {
        setStatus("Service status unknown", "warning");
    }
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", refreshHealth, { once: true });
} else {
    refreshHealth();
}
