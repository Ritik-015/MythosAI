/* MythosAI local workspace view.
 * Files are only read after the user selects/drops them in this browser.
 * File blobs are stored in IndexedDB; contents are not uploaded to Flask.
 */
(() => {
    "use strict";

    const DB_NAME = "mythos-ai-local-workspace";
    const DB_VERSION = 1;
    const STORE_NAME = "files";
    const MAX_PREVIEW_CHARS = 12000;
    const DEFAULT_FOLDERS = [
        { id: "folder-design-assets", name: "Design Assets", parentId: null, tone: "violet", system: true },
        { id: "folder-documents", name: "Documents", parentId: null, tone: "cyan", system: true },
        { id: "folder-media-library", name: "Media Library", parentId: null, tone: "amber", system: true },
        { id: "folder-projects", name: "Projects", parentId: null, tone: "rose", system: true },
    ];
    const FOLDER_TONES = ["violet", "cyan", "amber", "rose", "green"];
    const TEXT_EXTENSIONS = new Set([
        "txt", "md", "markdown", "json", "py", "js", "mjs", "cjs", "ts", "tsx", "jsx",
        "css", "html", "htm", "xml", "yaml", "yml", "toml", "ini", "cfg", "conf", "log",
        "csv", "sql", "sh", "ps1", "bat", "cmd", "java", "c", "h", "cpp", "hpp", "rs", "go",
        "rb", "php", "ipynb", "env.example", "gitignore"
    ]);
    const els = {
        app: document.getElementById("app-shell"),
        fileView: document.getElementById("file-view"),
        chatView: document.getElementById("chat-view"),
        filePageTitle: document.getElementById("file-page-title"),
        filePageSubtitle: document.getElementById("file-page-subtitle"),
        breadcrumbCurrent: document.getElementById("breadcrumb-current"),
        folderGrid: document.getElementById("folder-grid"),
        folderSection: document.querySelector(".folder-section"),
        filesTitle: document.getElementById("files-title"),
        filesSubheading: document.getElementById("files-subheading"),
        fileRows: document.getElementById("file-rows"),
        fileTableWrap: document.getElementById("file-table-wrap"),
        fileEmpty: document.getElementById("file-empty"),
        emptyTitle: document.getElementById("empty-title"),
        emptyDescription: document.getElementById("empty-description"),
        emptyUploadButton: document.getElementById("empty-upload-btn"),
        filePicker: document.getElementById("file-picker"),
        uploadButton: document.getElementById("upload-files-btn"),
        newFolderButton: document.getElementById("new-folder-btn"),
        manageFoldersButton: document.getElementById("manage-folders-btn"),
        folderDialog: document.getElementById("folder-dialog"),
        folderForm: document.getElementById("folder-form"),
        folderName: document.getElementById("folder-name"),
        folderError: document.getElementById("folder-error"),
        cancelFolderButton: document.getElementById("cancel-folder-btn"),
        fileFilter: document.getElementById("file-filter"),
        fileSort: document.getElementById("file-sort"),
        fileFilterButtons: [...document.querySelectorAll("[data-file-filter]")],
        layoutButtons: [...document.querySelectorAll("[data-layout]")],
        breadcrumbHome: document.getElementById("breadcrumb-home"),
        navButtons: [...document.querySelectorAll(".nav-item[data-view]")],
        inspectorEmpty: document.getElementById("inspector-empty"),
        inspectorBody: document.getElementById("inspector-body"),
        inspectorPreview: document.getElementById("inspector-preview"),
        inspectorFileIcon: document.getElementById("inspector-file-icon"),
        inspectorFileName: document.getElementById("inspector-file-name"),
        inspectorFileSubtitle: document.getElementById("inspector-file-subtitle"),
        inspectorDownload: document.getElementById("inspector-download"),
        inspectorStar: document.getElementById("inspector-star"),
        inspectorTrash: document.getElementById("inspector-trash"),
        inspectorRestore: document.getElementById("inspector-restore"),
        inspectorDelete: document.getElementById("inspector-delete"),
        detailKind: document.getElementById("detail-kind"),
        detailSize: document.getElementById("detail-size"),
        detailAdded: document.getElementById("detail-added"),
        detailFolderSelect: document.getElementById("detail-folder-select"),
        navFileCount: document.getElementById("nav-file-count"),
        storageItemCount: document.getElementById("storage-item-count"),
        storageTotalSize: document.getElementById("storage-total-size"),
        allFileCount: document.getElementById("all-file-count"),
        filesResultCount: document.getElementById("files-result-count"),
        dropOverlay: document.getElementById("drop-overlay"),
        localInfoButton: document.getElementById("local-info-button"),
        inspectorClear: document.getElementById("inspector-close-selection"),
    };

    let dbPromise = null;
    let allFiles = [];
    let folders = loadFolders();
    let activeView = "files";
    let activeFolderId = null;
    let activeFileFilter = "all";
    let activeLayout = "list";
    let selectedFileId = null;
    let previewObjectUrl = null;
    let previewSequence = 0;
    let toastTimer = null;

    function createId(prefix = "item") {
        if (window.crypto && typeof window.crypto.randomUUID === "function") return `${prefix}-${window.crypto.randomUUID()}`;
        return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
    }

    function loadFolders() {
        try {
            const saved = JSON.parse(localStorage.getItem("mythos.workspace.folders") || "null");
            if (Array.isArray(saved)) return saved;
        } catch (error) {
            console.warn("Workspace folders could not be read; using defaults.", error);
        }
        try {
            localStorage.setItem("mythos.workspace.folders", JSON.stringify(DEFAULT_FOLDERS));
        } catch (storageError) {
            console.warn("Workspace folder defaults could not be persisted.", storageError);
        }
        return DEFAULT_FOLDERS.map((folder) => ({ ...folder }));
    }

    function saveFolders() {
        try {
            localStorage.setItem("mythos.workspace.folders", JSON.stringify(folders));
            return true;
        } catch (error) {
            showToast("Folder changes may not persist because browser storage is unavailable.");
            console.warn("Workspace folders could not be persisted.", error);
            return false;
        }
    }

    function openDatabase() {
        if (dbPromise) return dbPromise;
        dbPromise = new Promise((resolve, reject) => {
            if (!("indexedDB" in window)) {
                reject(new Error("This browser does not support local workspace storage."));
                return;
            }
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = () => {
                const database = request.result;
                if (!database.objectStoreNames.contains(STORE_NAME)) {
                    const store = database.createObjectStore(STORE_NAME, { keyPath: "id" });
                    store.createIndex("addedAt", "addedAt", { unique: false });
                    store.createIndex("folderId", "folderId", { unique: false });
                    store.createIndex("trashed", "trashed", { unique: false });
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error || new Error("Could not open local workspace storage."));
            request.onblocked = () => reject(new Error("Workspace storage upgrade is blocked by another open Mythos tab. Close older tabs and retry."));
        });
        return dbPromise;
    }

    async function dbRequest(mode, operation) {
        const database = await openDatabase();
        return new Promise((resolve, reject) => {
            const transaction = database.transaction(STORE_NAME, mode);
            let request;
            let result;
            try {
                request = operation(transaction.objectStore(STORE_NAME));
            } catch (error) {
                reject(error);
                return;
            }
            request.onsuccess = () => { result = request.result; };
            request.onerror = () => reject(request.error || new Error("Local file storage request failed."));
            transaction.oncomplete = () => resolve(result);
            transaction.onerror = () => reject(transaction.error || new Error("Local file storage transaction failed."));
            transaction.onabort = () => reject(transaction.error || new Error("Local file storage transaction was cancelled."));
        });
    }

    const getAllStoredFiles = () => dbRequest("readonly", (store) => store.getAll());
    const putStoredFile = (file) => dbRequest("readwrite", (store) => store.put(file));
    const deleteStoredFile = (id) => dbRequest("readwrite", (store) => store.delete(id));
    const getStoredFile = (id) => dbRequest("readonly", (store) => store.get(id));

    function showToast(message) {
        let toast = document.getElementById("workspace-toast");
        if (!toast) {
            toast = document.createElement("div");
            toast.id = "workspace-toast";
            toast.className = "workspace-toast";
            toast.setAttribute("role", "status");
            toast.setAttribute("aria-live", "polite");
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.hidden = false;
        window.clearTimeout(toastTimer);
        toastTimer = window.setTimeout(() => { toast.hidden = true; }, 3600);
    }

    function escapePathName(name) {
        return String(name || "").trim().slice(0, 180);
    }

    function fileExtension(name) {
        const lower = String(name || "").toLowerCase();
        if (lower.endsWith(".env.example")) return "env.example";
        if (lower.endsWith(".gitignore")) return "gitignore";
        const parts = lower.split(".");
        return parts.length > 1 ? parts.pop() : "";
    }

    function fileCategory(file) {
        const ext = fileExtension(file.name);
        const mime = (file.type || "").toLowerCase();
        if (mime.startsWith("image/") || ["svg", "heic", "heif", "webp", "avif"].includes(ext)) return "images";
        if (mime.startsWith("audio/")) return "audio";
        if (mime.startsWith("video/")) return "video";
        if (["pdf"].includes(ext) || ["doc", "docx", "odt", "rtf", "txt", "md", "markdown", "csv", "ppt", "pptx", "xls", "xlsx"].includes(ext)) return "documents";
        if (["zip", "7z", "rar", "tar", "gz", "bz2", "xz"].includes(ext)) return "archives";
        if (TEXT_EXTENSIONS.has(ext) || ["py", "js", "ts", "jsx", "tsx", "css", "html", "sql", "sh", "ps1", "java", "c", "cpp", "rs", "go", "php", "rb"].includes(ext)) return "code";
        return "other";
    }

    function fileKind(file) {
        const category = fileCategory(file);
        const ext = fileExtension(file.name).toUpperCase();
        const labels = { documents: "Document", images: "Image", code: "Code file", archives: "Archive", audio: "Audio", video: "Video", other: "File" };
        if (ext === "PDF") return "PDF document";
        if (ext === "MD" || ext === "MARKDOWN") return "Markdown document";
        if (["PY", "JS", "MJS", "TS", "JSX", "TSX", "CSS", "HTML", "HTM", "JSON", "YAML", "YML", "SQL", "SH", "PS1", "JAVA", "C", "CPP", "H", "HPP", "RS", "GO", "RB", "PHP"].includes(ext)) return `${ext} source file`;
        if (file.type) return file.type;
        return labels[category] || "File";
    }

    function iconLabel(file) {
        const category = fileCategory(file);
        const ext = fileExtension(file.name).toUpperCase();
        if (ext === "PDF") return ["PDF", "pdf"];
        if (category === "images") return ["IMG", "image"];
        if (category === "code") return [ext.slice(0, 4) || "CODE", "code"];
        if (category === "archives") return ["ZIP", "archive"];
        if (category === "documents") return [(["DOC", "DOCX", "PPT", "PPTX", "XLS", "XLSX"].includes(ext) ? ext : "DOC"), "doc"];
        if (category === "audio") return ["AUD", "doc"];
        if (category === "video") return ["VID", "image"];
        return [ext.slice(0, 4) || "FILE", "doc"];
    }

    function formatBytes(bytes) {
        if (!Number.isFinite(bytes) || bytes < 1) return "0 B";
        const units = ["B", "KB", "MB", "GB", "TB"];
        const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
        const amount = bytes / (1024 ** index);
        return `${amount >= 10 || index === 0 ? amount.toFixed(0) : amount.toFixed(1)} ${units[index]}`;
    }

    function formatDate(timestamp) {
        if (!timestamp) return "—";
        try {
            return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(timestamp));
        } catch {
            return "—";
        }
    }

    function iconForFolder() {
        const ns = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(ns, "svg");
        svg.setAttribute("viewBox", "0 0 24 24");
        svg.setAttribute("aria-hidden", "true");
        const path = document.createElementNS(ns, "path");
        path.setAttribute("d", "M3.5 7.5h6l2 2h9v8.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z M3.5 7.5v-2a2 2 0 0 1 2-2h4l2 2h5");
        svg.appendChild(path);
        return svg;
    }

    function makeFileIcon(file, extraClass = "") {
        const [label, tone] = iconLabel(file);
        const icon = document.createElement("span");
        icon.className = `file-type-icon ${tone} ${extraClass}`.trim();
        icon.textContent = label;
        icon.setAttribute("aria-hidden", "true");
        return icon;
    }

    function foldersAt(parentId) {
        return folders.filter((folder) => (folder.parentId || null) === (parentId || null));
    }

    function folderById(id) {
        return folders.find((folder) => folder.id === id) || null;
    }

    function folderName(id) {
        if (!id) return "My Files";
        const folder = folderById(id);
        return folder ? folder.name : "My Files";
    }

    function currentPageTitle() {
        if (activeView === "recent") return "Recent";
        if (activeView === "shared") return "Shared";
        if (activeView === "starred") return "Starred";
        if (activeView === "trash") return "Trash";
        if (activeView === "chat") return "AI Chat";
        return activeFolderId ? folderName(activeFolderId) : "My Files";
    }

    function activateView(view, options = {}) {
        const validViews = new Set(["files", "recent", "shared", "starred", "trash", "chat"]);
        if (!validViews.has(view)) view = "files";
        activeView = view;
        if (view !== "files") activeFolderId = null;
        if (view === "chat") {
            els.app.dataset.view = "chat";
            if (els.fileView) els.fileView.hidden = true;
            if (els.chatView) els.chatView.hidden = false;
        } else {
            els.app.dataset.view = view;
            if (els.fileView) els.fileView.hidden = false;
            if (els.chatView) els.chatView.hidden = true;
        }
        els.navButtons.forEach((button) => {
            const current = button.dataset.view === view;
            button.classList.toggle("active", current);
            if (current) button.setAttribute("aria-current", "page");
            else button.removeAttribute("aria-current");
        });
        renderWorkspace();
        if (options.focusChat && view === "chat") document.getElementById("message")?.focus();
    }

    function setFolder(folderId) {
        activeView = "files";
        activeFolderId = folderId || null;
        els.app.dataset.view = "files";
        if (els.fileView) els.fileView.hidden = false;
        if (els.chatView) els.chatView.hidden = true;
        els.navButtons.forEach((button) => {
            const current = button.dataset.view === "files";
            button.classList.toggle("active", current);
            if (current) button.setAttribute("aria-current", "page");
            else button.removeAttribute("aria-current");
        });
        renderWorkspace();
    }

    function updateHeaderAndHeading() {
        const title = currentPageTitle();
        if (els.breadcrumbCurrent) els.breadcrumbCurrent.textContent = title;
        if (els.filePageTitle) els.filePageTitle.textContent = title;
        if (els.filePageSubtitle) {
            const subtitle = activeView === "shared"
                ? "Shared links are not enabled in this local-first workspace."
                : activeView === "trash"
                    ? "Review items you moved to trash. Restore them or delete them permanently."
                    : activeView === "starred"
                        ? "The files you marked as important."
                        : activeView === "recent"
                            ? "The files most recently imported into your workspace."
                            : activeFolderId
                                ? `Items in ${folderName(activeFolderId)}. Imported files remain on this device.`
                                : "Everything you bring into Mythos, thoughtfully organized.";
            els.filePageSubtitle.textContent = subtitle;
        }
        if (els.filesTitle) els.filesTitle.textContent = activeView === "trash" ? "Trash items" : activeView === "starred" ? "Starred files" : activeView === "recent" ? "Recently added" : activeView === "shared" ? "Shared files" : "Files";
        if (els.filesSubheading) els.filesSubheading.textContent = activeView === "shared" ? "External sharing is not enabled" : activeView === "trash" ? "Items in trash are not shown in regular views" : "Items imported into this browser";
    }

    function renderFolderGrid() {
        if (!els.folderGrid || !els.folderSection) return;
        const visible = activeView === "files";
        els.folderSection.hidden = !visible;
        if (!visible) return;
        els.folderGrid.replaceChildren();
        const children = foldersAt(activeFolderId);
        children.forEach((folder) => {
            const card = document.createElement("button");
            card.type = "button";
            card.className = `folder-card${folder.id === activeFolderId ? " active" : ""}`;
            card.dataset.folderId = folder.id;
            card.setAttribute("aria-label", `Open folder ${folder.name}`);
            const icon = document.createElement("span");
            icon.className = `folder-icon ${folder.tone || "violet"}`;
            icon.appendChild(iconForFolder());
            const copy = document.createElement("span");
            copy.className = "folder-card-copy";
            const name = document.createElement("strong");
            name.textContent = folder.name;
            const childrenCount = allFiles.filter((file) => file.folderId === folder.id && !file.trashed).length;
            const count = document.createElement("small");
            count.textContent = `${childrenCount} ${childrenCount === 1 ? "item" : "items"}`;
            copy.append(name, count);
            card.append(icon, copy);
            card.addEventListener("click", () => setFolder(folder.id));
            els.folderGrid.appendChild(card);
        });
        if (activeFolderId) {
            const parentButton = document.createElement("button");
            parentButton.type = "button";
            parentButton.className = "folder-card parent-folder-card";
            const icon = document.createElement("span");
            icon.className = "folder-icon green";
            icon.textContent = "↰";
            const copy = document.createElement("span");
            copy.className = "folder-card-copy";
            const activeFolder = folderById(activeFolderId);
            const parentId = activeFolder?.parentId || null;
            const name = document.createElement("strong"); name.textContent = parentId ? `Back to ${folderName(parentId)}` : "Back to My Files";
            const note = document.createElement("small"); note.textContent = parentId ? "Parent folder" : "Root folder";
            copy.append(name, note); parentButton.append(icon, copy);
            parentButton.addEventListener("click", () => setFolder(parentId));
            els.folderGrid.appendChild(parentButton);
        }
    }

    function getVisibleFiles() {
        let visible = allFiles.slice();
        if (activeView === "trash") visible = visible.filter((file) => file.trashed);
        else {
            visible = visible.filter((file) => !file.trashed);
            if (activeView === "starred") visible = visible.filter((file) => file.starred);
            else if (activeView === "recent") visible.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
            else if (activeView === "shared") visible = [];
            else visible = visible.filter((file) => (file.folderId || null) === (activeFolderId || null));
        }

        if (activeView !== "shared" && activeFileFilter !== "all") {
            visible = visible.filter((file) => fileCategory(file) === activeFileFilter);
        }
        const query = (els.fileFilter?.value || "").trim().toLowerCase();
        if (query) {
            visible = visible.filter((file) => `${file.name} ${file.type || ""} ${fileKind(file)} ${folderName(file.folderId)}`.toLowerCase().includes(query));
        }
        const sort = els.fileSort?.value || "updated";
        if (sort === "name") visible.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
        else if (sort === "size") visible.sort((a, b) => (b.size || 0) - (a.size || 0));
        else if (sort === "updated") visible.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
        return visible;
    }

    function createCell(text, className) {
        const cell = document.createElement("span");
        if (className) cell.className = className;
        cell.textContent = text;
        return cell;
    }

    function renderFileRow(file) {
        const row = document.createElement("div");
        row.className = `file-row${file.id === selectedFileId ? " selected" : ""}`;
        row.dataset.fileId = file.id;
        row.setAttribute("role", "button");
        row.tabIndex = 0;
        row.setAttribute("aria-label", `Select ${file.name}`);
        if (file.id === selectedFileId) row.setAttribute("aria-current", "true");

        const nameCell = document.createElement("span");
        nameCell.className = "file-name-cell";
        nameCell.appendChild(makeFileIcon(file));
        const nameWrap = document.createElement("span");
        nameWrap.className = "file-name-text";
        const name = document.createElement("strong"); name.textContent = file.name;
        const sub = document.createElement("small"); sub.textContent = file.trashed ? "In trash" : folderName(file.folderId);
        nameWrap.append(name, sub);
        nameCell.appendChild(nameWrap);

        const type = createCell(fileKind(file), "file-type-label");
        const date = createCell(formatDate(file.addedAt), "file-date");
        const size = createCell(formatBytes(file.size), "file-size");
        const actions = document.createElement("span"); actions.className = "file-row-actions";
        const star = document.createElement("button");
        star.type = "button";
        star.className = `icon-action${file.starred ? " starred" : ""}`;
        star.dataset.action = "star";
        star.title = file.starred ? "Remove from Starred" : "Add to Starred";
        star.setAttribute("aria-label", star.title);
        star.textContent = file.starred ? "★" : "☆";
        actions.appendChild(star);
        const fileAction = document.createElement("button");
        fileAction.type = "button";
        fileAction.className = "icon-action";
        fileAction.dataset.action = file.trashed ? "restore" : "trash";
        fileAction.title = file.trashed ? "Restore" : "Move to trash";
        fileAction.setAttribute("aria-label", fileAction.title);
        fileAction.textContent = file.trashed ? "↶" : "⌫";
        actions.appendChild(fileAction);
        row.append(nameCell, type, date, size, actions);
        return row;
    }

    function renderFiles() {
        const visible = getVisibleFiles();
        const totalVisible = visible.length;
        if (els.filesResultCount) els.filesResultCount.textContent = `${totalVisible} ${totalVisible === 1 ? "item" : "items"}`;
        if (els.fileRows) {
            els.fileRows.replaceChildren();
            els.fileRows.classList.toggle("is-grid", activeLayout === "grid");
            visible.forEach((file) => els.fileRows.appendChild(renderFileRow(file)));
        }
        if (els.fileTableWrap) els.fileTableWrap.hidden = totalVisible === 0;
        if (els.fileEmpty) {
            els.fileEmpty.hidden = totalVisible !== 0;
            els.fileEmpty.classList.toggle("compact", totalVisible === 0 && activeView !== "files");
        }
        const query = (els.fileFilter?.value || "").trim();
        if (els.emptyTitle) {
            els.emptyTitle.textContent = query ? "No matching files" : activeView === "shared" ? "Sharing isn't enabled yet" : activeView === "trash" ? "Trash is empty" : activeView === "starred" ? "Nothing starred yet" : activeView === "recent" ? "No recent items" : activeFolderId ? "This folder is empty" : "Your workspace is ready";
        }
        if (els.emptyDescription) {
            els.emptyDescription.textContent = query
                ? "Try another search term or clear the search field."
                : activeView === "shared"
                    ? "This local-first workspace has no share-link service. Your imported files remain private on this device."
                    : activeView === "trash"
                        ? "Files you move to trash will appear here. You can restore them or delete them permanently."
                        : activeView === "starred"
                            ? "Use the star on a file to keep important items easy to find."
                            : activeView === "recent"
                                ? "Files you import will appear here, with the newest first."
                                : activeFolderId
                                    ? "Upload or drop files while inside this folder to organize them here."
                                    : "Upload files to see them here. They stay in this browser on this device until you remove them.";
        }
        if (els.emptyUploadButton) els.emptyUploadButton.hidden = activeView !== "files";
    }

    function updateCounts() {
        const activeFiles = allFiles.filter((file) => !file.trashed);
        const totalSize = activeFiles.reduce((sum, file) => sum + (Number(file.size) || 0), 0);
        if (els.navFileCount) els.navFileCount.textContent = String(activeFiles.length);
        if (els.storageItemCount) els.storageItemCount.textContent = `${activeFiles.length} ${activeFiles.length === 1 ? "item" : "items"}`;
        if (els.storageTotalSize) els.storageTotalSize.textContent = formatBytes(totalSize);
        if (els.allFileCount) els.allFileCount.textContent = String(activeFiles.length);
    }

    function renderWorkspace() {
        updateHeaderAndHeading();
        renderFolderGrid();
        renderFiles();
        updateCounts();
        if (els.fileFilterButtons) {
            els.fileFilterButtons.forEach((button) => {
                const active = button.dataset.fileFilter === activeFileFilter;
                button.classList.toggle("active", active);
                button.setAttribute("aria-pressed", String(active));
            });
        }
        if (els.layoutButtons) {
            els.layoutButtons.forEach((button) => {
                const active = button.dataset.layout === activeLayout;
                button.classList.toggle("active", active);
                button.setAttribute("aria-pressed", String(active));
            });
        }
        if (selectedFileId && !allFiles.some((file) => file.id === selectedFileId)) clearSelection();
        else if (selectedFileId) {
            const selected = allFiles.find((file) => file.id === selectedFileId);
            if (selected) renderInspector(selected);
        }
    }

    function revokePreviewUrl() {
        if (previewObjectUrl) {
            URL.revokeObjectURL(previewObjectUrl);
            previewObjectUrl = null;
        }
    }

    function clearSelection() {
        selectedFileId = null;
        previewSequence += 1;
        revokePreviewUrl();
        if (els.inspectorEmpty) els.inspectorEmpty.hidden = false;
        if (els.inspectorBody) els.inspectorBody.hidden = true;
        if (els.inspectorPreview) els.inspectorPreview.replaceChildren();
        renderFiles();
    }

    async function renderPreview(file) {
        const seq = ++previewSequence;
        revokePreviewUrl();
        els.inspectorPreview.replaceChildren();
        const ext = fileExtension(file.name);
        const category = fileCategory(file);
        if (category === "images" && file.blob) {
            previewObjectUrl = URL.createObjectURL(file.blob);
            const image = document.createElement("img");
            image.alt = `Preview of ${file.name}`;
            image.src = previewObjectUrl;
            els.inspectorPreview.appendChild(image);
            return;
        }
        if (TEXT_EXTENSIONS.has(ext) && file.blob && typeof file.blob.text === "function") {
            const preview = document.createElement("pre");
            preview.textContent = "Loading text preview…";
            els.inspectorPreview.appendChild(preview);
            try {
                const text = await file.blob.slice(0, 100_000).text();
                if (seq !== previewSequence || selectedFileId !== file.id) return;
                preview.textContent = text.slice(0, MAX_PREVIEW_CHARS) + (text.length > MAX_PREVIEW_CHARS ? "\n\n… preview truncated" : "");
            } catch {
                if (seq === previewSequence) preview.textContent = "Preview unavailable for this file.";
            }
            return;
        }
        const card = document.createElement("div");
        card.className = "preview-file-card";
        card.appendChild(makeFileIcon(file));
        const heading = document.createElement("strong"); heading.textContent = fileKind(file);
        const note = document.createElement("span");
        note.textContent = ext === "pdf" ? "Use Open / Download to view the PDF." : "This file type has no inline preview.";
        card.append(heading, note);
        if (ext === "pdf" && file.blob) {
            const open = document.createElement("button");
            open.className = "button-secondary";
            open.type = "button";
            open.textContent = "Open PDF";
            open.addEventListener("click", () => openFileInNewTab(file));
            card.appendChild(open);
        }
        els.inspectorPreview.appendChild(card);
    }

    async function renderInspector(file) {
        if (!els.inspectorBody || !els.inspectorEmpty) return;
        els.inspectorEmpty.hidden = true;
        els.inspectorBody.hidden = false;
        els.inspectorFileIcon.replaceChildren();
        els.inspectorFileIcon.className = "file-type-icon";
        const icon = makeFileIcon(file);
        els.inspectorFileIcon.className = icon.className;
        els.inspectorFileIcon.textContent = icon.textContent;
        els.inspectorFileName.textContent = file.name;
        els.inspectorFileSubtitle.textContent = `${file.trashed ? "In trash" : "Added locally"} · ${formatBytes(file.size)}`;
        els.detailKind.textContent = fileKind(file);
        els.detailSize.textContent = formatBytes(file.size);
        els.detailAdded.textContent = formatDate(file.addedAt);
        renderFolderOptions(file);
        els.inspectorStar.hidden = Boolean(file.trashed);
        els.inspectorStar.innerHTML = `<span>${file.starred ? "★" : "☆"}</span> ${file.starred ? "Unstar" : "Star"}`;
        els.inspectorTrash.hidden = Boolean(file.trashed);
        els.inspectorRestore.hidden = !file.trashed;
        els.inspectorDelete.hidden = !file.trashed;
        els.inspectorDownload.disabled = !file.blob;
        els.inspectorTrash.onclick = () => moveToTrash(file.id);
        els.inspectorRestore.onclick = () => restoreFile(file.id);
        els.inspectorDelete.onclick = () => permanentlyDelete(file.id);
        els.inspectorStar.onclick = () => toggleStar(file.id);
        els.inspectorDownload.onclick = () => downloadFile(file);
        await renderPreview(file);
    }

    function renderFolderOptions(file) {
        const select = els.detailFolderSelect;
        if (!select) return;
        select.replaceChildren();
        const rootOption = document.createElement("option");
        rootOption.value = "";
        rootOption.textContent = "My Files";
        select.appendChild(rootOption);
        folders.forEach((folder) => {
            const option = document.createElement("option");
            option.value = folder.id;
            option.textContent = folder.name;
            select.appendChild(option);
        });
        select.value = file.folderId || "";
        select.disabled = Boolean(file.trashed);
        select.onchange = async () => {
            const item = allFiles.find((candidate) => candidate.id === file.id);
            if (!item) return;
            item.folderId = select.value || null;
            try {
                await putStoredFile(item);
                allFiles = await getAllStoredFiles();
                selectedFileId = item.id;
                renderWorkspace();
                showToast(`Moved “${item.name}” to ${folderName(item.folderId)}.`);
            } catch (error) {
                showToast(`Could not move file: ${error.message}`);
            }
        };
    }

    async function selectFile(id) {
        selectedFileId = id;
        renderFiles();
        const file = allFiles.find((candidate) => candidate.id === id);
        if (file) await renderInspector(file);
    }

    async function reloadFiles() {
        try {
            allFiles = await getAllStoredFiles();
            const validIds = new Set(folders.map((folder) => folder.id));
            let changed = false;
            for (const file of allFiles) {
                if (file.folderId && !validIds.has(file.folderId)) {
                    file.folderId = null;
                    changed = true;
                    await putStoredFile(file);
                }
            }
            if (changed) allFiles = await getAllStoredFiles();
            renderWorkspace();
            if (selectedFileId) {
                const selected = allFiles.find((file) => file.id === selectedFileId);
                if (selected) await renderInspector(selected);
            }
        } catch (error) {
            console.error("Local workspace storage could not be loaded.", error);
            showToast(`Local workspace unavailable: ${error.message}`);
            if (els.emptyTitle) els.emptyTitle.textContent = "Local storage unavailable";
            if (els.emptyDescription) els.emptyDescription.textContent = "Use an up-to-date browser with IndexedDB enabled, then reload Mythos.";
        }
    }

    async function importFiles(fileList) {
        const files = Array.from(fileList || []).filter((file) => file && typeof file.name === "string");
        if (!files.length) return;
        const folderId = activeView === "files" ? activeFolderId : null;
        let imported = 0;
        try {
            const existingKeys = new Set(allFiles.map((file) => `${file.name}\u0000${file.size}\u0000${file.lastModified}`));
            for (const rawFile of files) {
                const key = `${rawFile.name}\u0000${rawFile.size}\u0000${rawFile.lastModified}`;
                if (existingKeys.has(key)) continue;
                const record = {
                    id: createId("file"),
                    name: escapePathName(rawFile.name),
                    type: rawFile.type || "",
                    size: rawFile.size,
                    lastModified: rawFile.lastModified || 0,
                    addedAt: Date.now(),
                    folderId: folderId || null,
                    starred: false,
                    trashed: false,
                    blob: rawFile,
                };
                await putStoredFile(record);
                existingKeys.add(key);
                imported += 1;
            }
            allFiles = await getAllStoredFiles();
            renderWorkspace();
            if (imported) showToast(`Imported ${imported} ${imported === 1 ? "file" : "files"} into ${folderName(folderId)}. Files stayed in this browser.`);
            else showToast("Those files are already in this workspace.");
        } catch (error) {
            showToast(`Import failed: ${error.message}`);
        }
        if (els.filePicker) els.filePicker.value = "";
    }

    async function updateFile(id, updates) {
        const existing = allFiles.find((file) => file.id === id);
        if (!existing) return;
        const updated = { ...existing, ...updates };
        await putStoredFile(updated);
        allFiles = await getAllStoredFiles();
        renderWorkspace();
        if (selectedFileId === id) {
            const current = allFiles.find((file) => file.id === id);
            if (current) await renderInspector(current);
        }
        return updated;
    }

    async function toggleStar(id) {
        const file = allFiles.find((item) => item.id === id);
        if (!file) return;
        try {
            await updateFile(id, { starred: !file.starred });
            showToast(file.starred ? "Removed from Starred." : "Added to Starred.");
        } catch (error) { showToast(`Could not update star: ${error.message}`); }
    }

    async function moveToTrash(id) {
        const file = allFiles.find((item) => item.id === id);
        if (!file) return;
        try {
            await updateFile(id, { trashed: true });
            showToast(`Moved “${file.name}” to Trash.`);
        } catch (error) { showToast(`Could not move file to Trash: ${error.message}`); }
    }

    async function restoreFile(id) {
        const file = allFiles.find((item) => item.id === id);
        if (!file) return;
        try {
            await updateFile(id, { trashed: false });
            showToast(`Restored “${file.name}”.`);
        } catch (error) { showToast(`Could not restore file: ${error.message}`); }
    }

    async function permanentlyDelete(id) {
        const file = allFiles.find((item) => item.id === id);
        if (!file) return;
        if (!window.confirm(`Permanently delete “${file.name}” from this browser? This cannot be undone.`)) return;
        try {
            await deleteStoredFile(id);
            allFiles = await getAllStoredFiles();
            if (selectedFileId === id) clearSelection();
            renderWorkspace();
            showToast(`Permanently deleted “${file.name}”.`);
        } catch (error) { showToast(`Could not delete file: ${error.message}`); }
    }

    function downloadFile(file) {
        if (!file || !file.blob) { showToast("The file's local content is not available."); return; }
        const url = URL.createObjectURL(file.blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = file.name;
        anchor.rel = "noopener";
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 10000);
    }

    function openFileInNewTab(file) {
        if (!file || !file.blob) return;
        const url = URL.createObjectURL(file.blob);
        window.open(url, "_blank", "noopener,noreferrer");
        window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    }

    function showFolderDialog() {
        if (!els.folderDialog) return;
        if (typeof els.folderDialog.showModal === "function") els.folderDialog.showModal();
        else els.folderDialog.setAttribute("open", "");
        if (els.folderError) els.folderError.textContent = "";
        window.setTimeout(() => els.folderName?.focus(), 0);
    }

    function closeFolderDialog() {
        if (els.folderDialog?.open && typeof els.folderDialog.close === "function") els.folderDialog.close();
        else els.folderDialog?.removeAttribute("open");
        if (els.folderForm) els.folderForm.reset();
        if (els.folderError) els.folderError.textContent = "";
    }

    function createFolder(name) {
        const cleanName = String(name || "").trim().replace(/\s+/g, " ").slice(0, 60);
        if (!cleanName) return { error: "Enter a folder name." };
        const duplicate = folders.some((folder) => (folder.parentId || null) === (activeFolderId || null) && folder.name.toLocaleLowerCase() === cleanName.toLocaleLowerCase());
        if (duplicate) return { error: "A folder with that name already exists here." };
        const folder = {
            id: createId("folder"),
            name: cleanName,
            parentId: activeView === "files" ? activeFolderId : null,
            tone: FOLDER_TONES[folders.length % FOLDER_TONES.length],
            system: false,
            createdAt: Date.now(),
        };
        folders.push(folder);
        saveFolders();
        renderWorkspace();
        return { folder };
    }

    function setLayout(layout) {
        activeLayout = layout === "grid" ? "grid" : "list";
        renderFiles();
        els.layoutButtons.forEach((button) => {
            const active = button.dataset.layout === activeLayout;
            button.classList.toggle("active", active);
            button.setAttribute("aria-pressed", String(active));
        });
    }

    function openWebSearch() {
        document.getElementById("search-btn")?.click();
    }

    function bindEvents() {
        els.navButtons.forEach((button) => {
            button.addEventListener("click", () => {
                if (button.dataset.view === "chat") {
                    activateView("chat", { focusChat: false });
                } else if (button.dataset.view === "files") {
                    setFolder(null);
                } else {
                    activateView(button.dataset.view);
                }
            });
        });
        document.getElementById("nav-web-search")?.addEventListener("click", openWebSearch);
        els.breadcrumbHome?.addEventListener("click", () => {
            if (activeView === "chat") activateView("files");
            else setFolder(null);
        });
        document.getElementById("brand-home")?.addEventListener("click", (event) => {
            event.preventDefault();
            activateView("files");
            setFolder(null);
        });
        document.getElementById("global-search-btn")?.addEventListener("click", openWebSearch);
        els.uploadButton?.addEventListener("click", () => els.filePicker?.click());
        els.emptyUploadButton?.addEventListener("click", () => els.filePicker?.click());
        els.filePicker?.addEventListener("change", (event) => importFiles(event.target.files));
        els.newFolderButton?.addEventListener("click", showFolderDialog);
        els.manageFoldersButton?.addEventListener("click", showFolderDialog);
        els.cancelFolderButton?.addEventListener("click", closeFolderDialog);
        els.folderForm?.addEventListener("submit", (event) => {
            event.preventDefault();
            const result = createFolder(els.folderName.value);
            if (result.error) {
                els.folderError.textContent = result.error;
                els.folderName.focus();
                return;
            }
            closeFolderDialog();
            showToast(`Created folder “${result.folder.name}”.`);
        });
        els.fileFilter?.addEventListener("input", renderFiles);
        els.fileSort?.addEventListener("change", renderFiles);
        els.fileFilterButtons.forEach((button) => {
            button.addEventListener("click", () => {
                activeFileFilter = button.dataset.fileFilter || "all";
                renderWorkspace();
            });
        });
        els.layoutButtons.forEach((button) => button.addEventListener("click", () => setLayout(button.dataset.layout)));
        els.fileRows?.addEventListener("click", async (event) => {
            const row = event.target.closest(".file-row[data-file-id]");
            if (!row) return;
            const action = event.target.closest("[data-action]")?.dataset.action;
            if (action) {
                event.stopPropagation();
                if (action === "star") await toggleStar(row.dataset.fileId);
                else if (action === "trash") await moveToTrash(row.dataset.fileId);
                else if (action === "restore") await restoreFile(row.dataset.fileId);
                return;
            }
            await selectFile(row.dataset.fileId);
        });
        els.fileRows?.addEventListener("keydown", async (event) => {
            if ((event.key === "Enter" || event.key === " ") && event.target.classList.contains("file-row")) {
                event.preventDefault();
                await selectFile(event.target.dataset.fileId);
            }
        });
        els.inspectorClear?.addEventListener("click", clearSelection);
        els.localInfoButton?.addEventListener("click", () => showToast("Privacy: imported files are stored in this browser's IndexedDB and are not automatically uploaded to Mythos or LM Studio."));
        els.fileView?.addEventListener("dragenter", (event) => {
            if (event.dataTransfer?.types?.includes("Files")) {
                event.preventDefault();
                els.fileView.classList.add("is-dragover");
            }
        });
        els.fileView?.addEventListener("dragover", (event) => {
            if (event.dataTransfer?.types?.includes("Files")) event.preventDefault();
        });
        els.fileView?.addEventListener("dragleave", (event) => {
            if (!els.fileView.contains(event.relatedTarget)) els.fileView.classList.remove("is-dragover");
        });
        els.fileView?.addEventListener("drop", (event) => {
            if (!event.dataTransfer?.files?.length) return;
            event.preventDefault();
            els.fileView.classList.remove("is-dragover");
            importFiles(event.dataTransfer.files);
        });
        document.addEventListener("keydown", (event) => {
            const tag = event.target?.tagName?.toLowerCase();
            const typing = ["input", "textarea", "select"].includes(tag) || event.target?.isContentEditable;
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
                event.preventDefault();
                openWebSearch();
            } else if (event.key === "/" && !typing && activeView !== "chat") {
                event.preventDefault();
                els.fileFilter?.focus();
            } else if (event.key === "Escape" && els.folderDialog?.open) {
                closeFolderDialog();
            }
        });
    }

    window.MythosWorkspace = { activateView, refresh: reloadFiles, getState: () => ({ activeView, activeFolderId, fileCount: allFiles.length }) };

    bindEvents();
    reloadFiles();
})();