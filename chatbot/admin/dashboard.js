(() => {
    "use strict";

    const TOKEN_KEY = "omg-admin-dashboard-token";
    const PAGE_SIZE = 20;
    const state = {
        offset: 0,
        total: 0,
        token: window.sessionStorage.getItem(TOKEN_KEY) || "",
    };

    const elements = {
        total: document.querySelector("#metric-total"),
        today: document.querySelector("#metric-today"),
        sessions: document.querySelector("#metric-sessions"),
        breakdown: document.querySelector("#feedback-breakdown"),
        feedbackTotal: document.querySelector("#feedback-total-label"),
        resultCount: document.querySelector("#result-count"),
        list: document.querySelector("#session-list"),
        status: document.querySelector("#dashboard-status"),
        filters: document.querySelector("#feedback-filters"),
        search: document.querySelector("#search-filter"),
        option: document.querySelector("#option-filter"),
        reset: document.querySelector("#reset-filters"),
        refresh: document.querySelector("#refresh-data"),
        previous: document.querySelector("#previous-page"),
        next: document.querySelector("#next-page"),
        pageLabel: document.querySelector("#page-label"),
        changeToken: document.querySelector("#change-token"),
        tokenDialog: document.querySelector("#token-dialog"),
        tokenForm: document.querySelector("#token-form"),
        tokenInput: document.querySelector("#token-input"),
        tokenError: document.querySelector("#token-error"),
        clearToken: document.querySelector("#clear-token"),
    };

    function createElement(tag, className, text) {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (text !== undefined) element.textContent = text;
        return element;
    }

    function formatDate(value) {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return value || "Unknown date";
        return new Intl.DateTimeFormat(undefined, {
            dateStyle: "medium",
            timeStyle: "short",
        }).format(date);
    }

    function shortSessionId(value) {
        return value?.length > 18
            ? `${value.slice(0, 8)}…${value.slice(-6)}`
            : value || "Unknown session";
    }

    function showTokenDialog(message = "") {
        elements.tokenError.textContent = message;
        elements.tokenInput.value = state.token;
        if (!elements.tokenDialog.open) elements.tokenDialog.showModal();
        elements.tokenInput.focus();
    }

    function renderSummary(summary) {
        elements.total.textContent = String(summary.total_conversations || 0);
        elements.today.textContent = String(summary.today_conversations || 0);
        elements.sessions.textContent = String(summary.unique_sessions || 0);
        const feedbackTotal = summary.total_feedback || 0;
        elements.feedbackTotal.textContent =
            `${feedbackTotal} submission${feedbackTotal === 1 ? "" : "s"}`;
        elements.breakdown.replaceChildren();

        const counts = Object.entries(summary.option_counts || {}).sort(
            (left, right) => right[1] - left[1]
        );
        const largest = Math.max(...counts.map(([, count]) => count), 1);
        if (!counts.length) {
            elements.breakdown.appendChild(
                createElement("span", "admin-session-meta", "No feedback recorded yet.")
            );
            return;
        }

        counts.forEach(([label, count]) => {
            const row = createElement("div", "admin-breakdown-row");
            const name = createElement("span", "", label);
            name.title = label;
            const track = createElement("span", "admin-breakdown-track");
            const bar = document.createElement("i");
            bar.style.width = `${Math.max((count / largest) * 100, 5)}%`;
            track.appendChild(bar);
            row.append(name, track, createElement("strong", "", String(count)));
            elements.breakdown.appendChild(row);
        });
    }

    function renderConversation(interaction) {
        const details = createElement("details", "admin-conversation");
        const messageCount = Array.isArray(interaction) ? interaction.length : 0;
        details.appendChild(
            createElement(
                "summary",
                "",
                `View conversation · ${messageCount} message${messageCount === 1 ? "" : "s"}`
            )
        );
        const messages = createElement("div", "admin-messages");

        if (!messageCount) {
            messages.appendChild(
                createElement("p", "admin-empty", "No conversation was recorded.")
            );
        } else {
            interaction.forEach((item) => {
                const role = item?.role === "user" ? "user" : "assistant";
                const message = createElement(
                    "div",
                    "admin-message",
                    String(item?.content || "")
                );
                message.dataset.role = role;
                messages.appendChild(message);
            });
        }
        details.appendChild(messages);
        return details;
    }

    function renderRecords(records) {
        elements.list.replaceChildren();
        if (!records.length) {
            elements.list.appendChild(
                createElement(
                    "div",
                    "admin-empty",
                    "No conversations match these filters."
                )
            );
            return;
        }

        records.forEach((record) => {
            const feedback = record.feedback || {};
            const hasFeedback = Boolean(feedback.option);
            const article = createElement("article", "admin-session");
            const header = createElement("div", "admin-session-header");
            const identity = document.createElement("div");
            const title = createElement("div", "admin-session-title");
            const id = createElement(
                "strong",
                "",
                `Conversation ${shortSessionId(record.conversation_id || record.id)}`
            );
            id.title = record.conversation_id || record.id || "";
            title.append(
                id,
                createElement(
                    "span",
                    "admin-badge",
                    feedback.option || "No feedback yet"
                )
            );
            identity.append(
                title,
                createElement(
                    "p",
                    "admin-session-meta",
                    `Visitor ${shortSessionId(record.user_id)} · ${formatDate(record.created_at)} · Record ${record.id.slice(0, 8)}`
                )
            );
            const comment = createElement(
                "p",
                "admin-comment",
                hasFeedback
                    ? feedback.comment || "No additional comment"
                    : "Feedback has not been submitted"
            );
            header.append(identity, comment);
            article.append(header, renderConversation(record.interaction));
            elements.list.appendChild(article);
        });
    }

    function updatePagination() {
        const currentPage = Math.floor(state.offset / PAGE_SIZE) + 1;
        const pageCount = Math.max(Math.ceil(state.total / PAGE_SIZE), 1);
        elements.pageLabel.textContent = `Page ${currentPage} of ${pageCount}`;
        elements.previous.disabled = state.offset === 0;
        elements.next.disabled = state.offset + PAGE_SIZE >= state.total;
    }

    async function loadFeedback() {
        const parameters = new URLSearchParams({
            limit: String(PAGE_SIZE),
            offset: String(state.offset),
        });
        if (elements.search.value.trim()) {
            parameters.set("search", elements.search.value.trim());
        }
        if (elements.option.value) {
            parameters.set("option", elements.option.value);
        }

        elements.status.textContent = "Loading conversations…";
        elements.refresh.disabled = true;
        try {
            const headers = state.token
                ? { Authorization: `Bearer ${state.token}` }
                : {};
            const response = await fetch(`/api/admin/feedback?${parameters}`, {
                headers,
            });
            if (response.status === 401) {
                showTokenDialog("Enter a valid admin token to continue.");
                throw new Error("Admin authentication required");
            }
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.detail || "Dashboard data could not be loaded");
            }

            state.total = data.filtered_total;
            renderSummary(data.summary);
            renderRecords(data.records);
            elements.resultCount.textContent =
                `${state.total} result${state.total === 1 ? "" : "s"}`;
            elements.status.textContent = data.records.length
                ? `Showing ${state.offset + 1}–${state.offset + data.records.length}`
                : "No matching sessions";
            updatePagination();
        } catch (error) {
            if (error.message !== "Admin authentication required") {
                elements.status.textContent = error.message;
            }
        } finally {
            elements.refresh.disabled = false;
        }
    }

    elements.filters.addEventListener("submit", (event) => {
        event.preventDefault();
        state.offset = 0;
        loadFeedback();
    });

    elements.reset.addEventListener("click", () => {
        elements.filters.reset();
        state.offset = 0;
        loadFeedback();
    });

    elements.refresh.addEventListener("click", loadFeedback);
    elements.previous.addEventListener("click", () => {
        state.offset = Math.max(0, state.offset - PAGE_SIZE);
        loadFeedback();
    });
    elements.next.addEventListener("click", () => {
        if (state.offset + PAGE_SIZE < state.total) {
            state.offset += PAGE_SIZE;
            loadFeedback();
        }
    });

    elements.changeToken.addEventListener("click", () => showTokenDialog());
    elements.tokenForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const token = elements.tokenInput.value.trim();
        if (!token) {
            elements.tokenError.textContent = "Enter the configured admin token.";
            return;
        }
        state.token = token;
        window.sessionStorage.setItem(TOKEN_KEY, token);
        elements.tokenDialog.close();
        loadFeedback();
    });
    elements.clearToken.addEventListener("click", () => {
        state.token = "";
        window.sessionStorage.removeItem(TOKEN_KEY);
        elements.tokenInput.value = "";
        elements.tokenError.textContent = "";
        elements.tokenDialog.close();
        loadFeedback();
    });

    loadFeedback();
})();
