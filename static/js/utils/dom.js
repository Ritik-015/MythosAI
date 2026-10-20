// ==========================================
// MythosAI
// DOM Utilities
// ==========================================

const DOM = {

    get(id) {
        return document.getElementById(id);
    },

    create(tag) {
        return document.createElement(tag);
    },

    scrollBottom(element) {
        element.scrollTop = element.scrollHeight;
    }

};