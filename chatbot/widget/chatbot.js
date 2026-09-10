(() => {
    "use strict";

    if (window.__omgChatbotLoaded) return;
    window.__omgChatbotLoaded = true;

    const script = document.currentScript;
    const apiUrl = script?.dataset.api || "http://127.0.0.1:8000/api/chat";
    const feedbackApiUrl =
        script?.dataset.feedbackApi ||
        apiUrl.replace(/\/api\/chat\/?$/, "/api/feedback");
    const emojiGifUrl = script?.src
        ? new URL("../../Resources/Assests/Shocked%20No%20Way%20Sticker%20by%20Emoji.gif", script.src).href
        : "Resources/Assests/Shocked%20No%20Way%20Sticker%20by%20Emoji.gif";
    const brandLogoUrl = script?.src
        ? new URL("../../Resources/Assests/logo-B3-header.webp", script.src).href
        : "Resources/Assests/logo-B3-header.webp";
    const MAX_CONTEXT_MESSAGES = 20;
    const PREVIEW_DELAY_MS = 2500;
    const SLIDE_INTERVAL_MS = 1500;
    const STATUS_INTERVAL_MS = 1800;
    const generationStatuses = [
        "Thinking…",
        "Looking through Bhutan Airlines information…",
        "Preparing a response…",
    ];

    if (script?.src && !document.querySelector("link[data-omg-chatbot-style]")) {
        const stylesheet = document.createElement("link");
        stylesheet.rel = "stylesheet";
        stylesheet.href = new URL("chatbot.css", script.src).href;
        stylesheet.dataset.omgChatbotStyle = "";
        document.head.appendChild(stylesheet);
    }

    const CHAT_STATES = {
        MINIMIZED: "minimized",
        PREVIEW: "preview",
        OPEN: "open",
        CLOSE_CONFIRMATION: "close-confirmation",
    };

    const starters = [
        "How do I Book & Hold a flight from Bangkok?",
        "Which destinations do you fly to from Bangkok?",
        "What is the Bangkok to Paro group fare?",
        "Do I need a visa for Bhutan?",
        "What is the baggage allowance?",
    ];

    const feedbackOptions = [
        "The assistant was helpful",
        "Answers were incomplete or inaccurate",
        "I could not find booking or fare information",
        "The chat was hard to use",
        "Other",
    ];

    const wrapper = document.createElement("div");
    wrapper.id = "omg-chatbot";
    wrapper.innerHTML = `
        <section
            class="omg-chat-window"
            data-state="minimized"
            role="dialog"
            aria-modal="false"
            aria-labelledby="omg-chat-title"
        >
            <header class="omg-chat-header">
                <div class="omg-chat-controls">
                    <button
                        class="omg-chat-control omg-chat-minimize"
                        type="button"
                        aria-label="Minimize chat"
                    ></button>
                    <button
                        class="omg-chat-control omg-chat-close"
                        type="button"
                        aria-label="Close chat"
                    ></button>
                </div>
                <div class="omg-chat-brand">
                    <img src="${brandLogoUrl}" alt="" aria-hidden="true">
                    <span class="omg-chat-brand-copy">
                        <strong class="omg-chat-brand-welcome">OMG’s AI Expert</strong>
                        <strong class="omg-chat-brand-thread">OMG Chipies AI Expert</strong>
                        <small>Bhutan Airlines Thailand</small>
                    </span>
                </div>
                <h2 class="omg-chat-title" id="omg-chat-title">
                    <span class="omg-chat-greeting"></span>
                    <span>Where would you like to fly?</span>
                </h2>
            </header>

            <div class="omg-chat-body">
                <div class="omg-chat-start-title">Where should we start?</div>
                <div class="omg-chat-suggestions"></div>
                <div
                    class="omg-chat-messages"
                    data-active="false"
                    aria-live="polite"
                    aria-relevant="additions"
                ></div>
            </div>

            <div class="omg-chat-input-section">
                <form class="omg-chat-form">
                    <input
                        class="omg-chat-input"
                        type="text"
                        maxlength="2000"
                        autocomplete="off"
                        aria-label="How can I help?"
                        placeholder="How can I help?"
                    >
                    <button class="omg-chat-send" type="submit" aria-label="Send message">
                        <svg viewBox="0 0 24 24" width="22" height="22" fill="none"
                             stroke="currentColor" stroke-width="1.6"
                             stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <path d="M5 12h12M13 6l6 6-6 6"></path>
                        </svg>
                    </button>
                </form>
            </div>

            <footer class="omg-chat-footer">
                AI can make mistakes. Double check accuracy with official sources.
            </footer>

            <section class="omg-chat-confirm" aria-hidden="true">
                <div class="omg-chat-confirm-inner">
                    <h3 class="omg-chat-confirm-title" tabindex="-1">
                        Are you sure you want to end this chat?
                    </h3>
                    <div class="omg-chat-confirm-actions">
                        <button class="omg-chat-confirm-btn" type="button" data-confirm-yes>Yes</button>
                        <button class="omg-chat-confirm-btn" type="button" data-confirm-no>No</button>
                    </div>
                    <form class="omg-chat-feedback-form" data-feedback-form>
                        <p class="omg-chat-feedback-heading">Before you go</p>
                        <p class="omg-chat-feedback-lead">Give us your feedback about our support agent. We send it to the OMG Experience team automatically.</p>
                        <fieldset class="omg-chat-feedback-options">
                            <legend class="visually-hidden">Feedback options</legend>
                        </fieldset>
                        <label class="omg-chat-feedback-comment">
                            <span>Anything else? (optional)</span>
                            <textarea name="comment" rows="3" maxlength="2000" placeholder="Tell us more"></textarea>
                        </label>
                        <button class="omg-chat-feedback-send" type="submit">Send feedback</button>
                        <p class="omg-chat-feedback-status" role="status" aria-live="polite"></p>
                    </form>
                </div>
            </section>
        </section>

        <button class="omg-chat-launcher" type="button" aria-label="Open AI travel suggestions">
            <span class="omg-chat-launcher-copy" aria-hidden="true">
                <strong>Questions? I’m here</strong>
                <small>Meet your travel assistant</small>
            </span>
            <span class="omg-chat-launcher-icon" aria-hidden="true">
                <img src="${emojiGifUrl}" alt="">
            </span>
        </button>

        <aside class="omg-chat-preview" hidden aria-label="AI travel assistant suggestions">
            <div class="omg-chat-preview-glow" aria-hidden="true"></div>
            <button class="omg-chat-preview-dismiss" type="button" aria-label="Dismiss suggestions">×</button>
            <div class="omg-chat-preview-brand">
                <img src="${brandLogoUrl}" alt="" aria-hidden="true">
                <span>OMG’s AI Expert</span>
            </div>
            <p class="omg-chat-preview-kicker">A little inspiration for your trip</p>
            <button class="omg-chat-preview-question" type="button">
                <span></span>
                <b aria-hidden="true">→</b>
            </button>
            <div class="omg-chat-preview-dots" aria-label="Suggestion slides"></div>
            <button class="omg-chat-preview-open" type="button">
                <span>Ask me anything</span>
                <svg viewBox="0 0 24 24" width="25" height="25" fill="none"
                     stroke="currentColor" stroke-width="1.7" stroke-linecap="round"
                     stroke-linejoin="round" aria-hidden="true">
                    <path d="M5 12h12M13 6l6 6-6 6"></path>
                </svg>
            </button>
        </aside>
    `;
    document.body.appendChild(wrapper);

    const windowElement = wrapper.querySelector(".omg-chat-window");
    const launcher = wrapper.querySelector(".omg-chat-launcher");
    const preview = wrapper.querySelector(".omg-chat-preview");
    const previewQuestion = wrapper.querySelector(".omg-chat-preview-question");
    const previewQuestionText = previewQuestion.querySelector("span");
    const previewDots = wrapper.querySelector(".omg-chat-preview-dots");
    const previewOpen = wrapper.querySelector(".omg-chat-preview-open");
    const previewDismiss = wrapper.querySelector(".omg-chat-preview-dismiss");
    const closeButton = wrapper.querySelector(".omg-chat-close");
    const minimizeButton = wrapper.querySelector(".omg-chat-minimize");
    const greeting = wrapper.querySelector(".omg-chat-greeting");
    const startTitle = wrapper.querySelector(".omg-chat-start-title");
    const suggestions = wrapper.querySelector(".omg-chat-suggestions");
    const messages = wrapper.querySelector(".omg-chat-messages");
    const form = wrapper.querySelector(".omg-chat-form");
    const input = wrapper.querySelector(".omg-chat-input");
    const sendButton = wrapper.querySelector(".omg-chat-send");
    const confirmPanel = wrapper.querySelector(".omg-chat-confirm");
    const confirmTitle = wrapper.querySelector(".omg-chat-confirm-title");
    const confirmYes = wrapper.querySelector("[data-confirm-yes]");
    const confirmNo = wrapper.querySelector("[data-confirm-no]");
    const feedbackForm = wrapper.querySelector("[data-feedback-form]");
    const feedbackOptionsBox = wrapper.querySelector(".omg-chat-feedback-options");
    const feedbackStatus = wrapper.querySelector(".omg-chat-feedback-status");
    const feedbackSend = wrapper.querySelector(".omg-chat-feedback-send");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let previewDelay;
    let slideTimer;
    let activeSlide = 0;
    let previewPaused = false;

    starters.forEach((_, index) => {
        const dot = document.createElement("button");
        dot.type = "button";
        dot.setAttribute("aria-label", `Show suggestion ${index + 1}`);
        dot.addEventListener("click", () => showSlide(index));
        previewDots.appendChild(dot);
    });

    feedbackOptions.forEach((label, index) => {
        const option = document.createElement("label");
        option.className = "omg-chat-feedback-option";
        option.innerHTML = '<input type="radio" name="feedback-option"><span></span>';
        option.querySelector("input").value = label;
        if (index === 0) option.querySelector("input").checked = true;
        option.querySelector("span").textContent = label;
        feedbackOptionsBox.appendChild(option);
    });

    const hour = new Date().getHours();
    greeting.textContent =
        hour < 12
            ? "Good morning,"
            : hour < 18
              ? "Good afternoon,"
              : "Good evening,";

    starters.forEach((question) => {
        const button = document.createElement("button");
        button.className = "omg-chat-suggestion";
        button.type = "button";
        button.innerHTML = '<span aria-hidden="true">→</span><span></span>';
        button.lastElementChild.textContent = question;
        button.addEventListener("click", () => sendMessage(question));
        suggestions.appendChild(button);
    });

    let history = [];
    let waiting = false;

    function getState() {
        return windowElement.dataset.state;
    }

    function stopSlideRotation() {
        window.clearInterval(slideTimer);
        slideTimer = undefined;
    }

    function startSlideRotation() {
        stopSlideRotation();
        if (reducedMotion.matches || previewPaused || getState() !== CHAT_STATES.PREVIEW) {
            return;
        }
        slideTimer = window.setInterval(() => {
            showSlide((activeSlide + 1) % starters.length);
        }, SLIDE_INTERVAL_MS);
    }

    function showSlide(index) {
        activeSlide = (index + starters.length) % starters.length;
        previewQuestionText.textContent = starters[activeSlide];
        [...previewDots.children].forEach((dot, dotIndex) => {
            const current = dotIndex === activeSlide;
            dot.dataset.active = String(current);
            dot.setAttribute("aria-current", current ? "true" : "false");
        });
    }

    function setState(state) {
        windowElement.dataset.state = state;
        const minimized = state === CHAT_STATES.MINIMIZED;
        const previewing = state === CHAT_STATES.PREVIEW;
        const confirming = state === CHAT_STATES.CLOSE_CONFIRMATION;
        launcher.hidden = !minimized;
        preview.hidden = !previewing;
        confirmPanel.setAttribute("aria-hidden", String(!confirming));
        if (previewing) {
            showSlide(activeSlide);
            startSlideRotation();
        } else {
            stopSlideRotation();
        }
    }

    /* ---- State transitions ---- */

    function openChat() {
        window.clearTimeout(previewDelay);
        setState(CHAT_STATES.OPEN);
        input.focus();
    }

    function minimizeChat() {
        window.clearTimeout(previewDelay);
        setState(CHAT_STATES.MINIMIZED);
        launcher.focus();
    }

    function showPreview(moveFocus = false) {
        if (getState() !== CHAT_STATES.MINIMIZED) return;
        const launcherHadFocus = document.activeElement === launcher;
        setState(CHAT_STATES.PREVIEW);
        if (moveFocus || launcherHadFocus) {
            previewOpen.focus({ preventScroll: true });
        }
    }

    function askPreviewQuestion() {
        const question = starters[activeSlide];
        openChat();
        sendMessage(question);
    }

    function requestClose() {
        setState(CHAT_STATES.CLOSE_CONFIRMATION);
        confirmTitle.focus();
    }

    function cancelClose() {
        setState(CHAT_STATES.OPEN);
        input.focus();
    }

    function confirmClose() {
        resetConversation();
        minimizeChat();
    }

    function resetConversation() {
        history = [];
        windowElement.dataset.conversation = "false";
        messages.innerHTML = "";
        messages.dataset.active = "false";
        suggestions.hidden = false;
        startTitle.hidden = false;
        input.value = "";
        input.placeholder = "How can I help?";
        feedbackForm.reset();
        const firstOption = feedbackForm.querySelector('input[name="feedback-option"]');
        if (firstOption) firstOption.checked = true;
        feedbackStatus.textContent = "";
        feedbackSend.disabled = false;
    }

    /* ---- Messaging ---- */

    function activateConversation() {
        windowElement.dataset.conversation = "true";
        input.placeholder = "Message OMG Chipies AI Expert";
    }

    function startGenerationStatus(message) {
        const statusText = message.querySelector(".omg-chat-status-text");
        let statusIndex = 0;
        let statusTimer;

        if (!reducedMotion.matches) {
            statusTimer = window.setInterval(() => {
                statusIndex = (statusIndex + 1) % generationStatuses.length;
                statusText.textContent = generationStatuses[statusIndex];
            }, STATUS_INTERVAL_MS);
        }

        return () => window.clearInterval(statusTimer);
    }

    function resolveAssistantMessage(message, content) {
        delete message.dataset.loading;
        message.removeAttribute("role");
        message.removeAttribute("aria-label");
        message.textContent = content;
        message.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    function addMessage(content, role, loading = false) {
        const message = document.createElement("div");
        message.className = "omg-chat-message";
        message.dataset.role = role;
        if (loading) {
            message.dataset.loading = "true";
            message.setAttribute("role", "status");
            message.setAttribute("aria-label", "AI response status");
            message.innerHTML = `
                <span class="omg-chat-status-indicator" aria-hidden="true">
                    <i></i><i></i><i></i>
                </span>
                <span class="omg-chat-status-text">${generationStatuses[0]}</span>
            `;
        } else {
            message.textContent = content;
        }
        messages.dataset.active = "true";
        suggestions.hidden = true;
        startTitle.hidden = true;
        messages.appendChild(message);
        message.scrollIntoView({ behavior: "smooth", block: "nearest" });
        return message;
    }

    async function sendMessage(rawMessage) {
        const message = rawMessage.trim();
        if (!message || waiting) return;

        activateConversation();
        const priorHistory = history.slice(-MAX_CONTEXT_MESSAGES);
        history.push({ role: "user", content: message });
        addMessage(message, "user");
        input.value = "";
        waiting = true;
        sendButton.disabled = true;
        const loadingMessage = addMessage("", "assistant", true);
        const stopGenerationStatus = startGenerationStatus(loadingMessage);

        try {
            const response = await fetch(apiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message, history: priorHistory }),
            });

            if (!response.ok) {
                throw new Error(`Chat request failed with ${response.status}`);
            }

            const data = await response.json();
            if (!data.answer || typeof data.answer !== "string") {
                throw new Error("Chat response did not include an answer");
            }

            stopGenerationStatus();
            history.push({ role: "assistant", content: data.answer });
            resolveAssistantMessage(loadingMessage, data.answer);
        } catch (error) {
            console.error("OMG chatbot request failed:", error);
            const fallback =
                "I’m unable to reach the travel assistant right now. " +
                "Please call +66 2 630 4600 or email info@omgexp.com.";
            stopGenerationStatus();
            history.push({ role: "assistant", content: fallback });
            resolveAssistantMessage(loadingMessage, fallback);
        } finally {
            stopGenerationStatus();
            waiting = false;
            sendButton.disabled = false;
            if (getState() === CHAT_STATES.OPEN) input.focus();
        }
    }

    /* ---- Event wiring ---- */

    launcher.addEventListener("click", () => showPreview(true));
    previewOpen.addEventListener("click", openChat);
    previewDismiss.addEventListener("click", minimizeChat);
    previewQuestion.addEventListener("click", askPreviewQuestion);
    preview.addEventListener("pointerenter", () => {
        previewPaused = true;
        stopSlideRotation();
    });
    preview.addEventListener("pointerleave", () => {
        previewPaused = false;
        startSlideRotation();
    });
    preview.addEventListener("focusin", () => {
        previewPaused = true;
        stopSlideRotation();
    });
    preview.addEventListener("focusout", (event) => {
        if (preview.contains(event.relatedTarget)) return;
        previewPaused = false;
        startSlideRotation();
    });
    minimizeButton.addEventListener("click", minimizeChat);
    closeButton.addEventListener("click", () => {
        if (getState() === CHAT_STATES.CLOSE_CONFIRMATION) {
            confirmClose();
        } else {
            requestClose();
        }
    });
    confirmNo.addEventListener("click", cancelClose);
    confirmYes.addEventListener("click", confirmClose);

    feedbackForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const selected = feedbackForm.querySelector(
            'input[name="feedback-option"]:checked'
        );
        const comment = feedbackForm.querySelector("textarea").value.trim();
        if (!selected) {
            feedbackStatus.textContent = "Choose a feedback option first.";
            return;
        }

        feedbackSend.disabled = true;
        feedbackStatus.textContent = "Sending…";

        try {
            const response = await fetch(feedbackApiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    option: selected.value,
                    comment,
                }),
            });
            const data = await response.json();
            if (!response.ok || !data.ok) {
                throw new Error(data.error || "Feedback could not be sent");
            }
            feedbackStatus.textContent = data.emailed
                ? "Thanks — your feedback has been emailed to the team."
                : "Thanks — your feedback has been recorded.";
            window.setTimeout(confirmClose, 700);
        } catch (error) {
            console.error("OMG chatbot feedback failed:", error);
            feedbackStatus.textContent =
                "We could not send that just now. You can still close the chat.";
            feedbackSend.disabled = false;
        }
    });

    form.addEventListener("submit", (event) => {
        event.preventDefault();
        sendMessage(input.value);
    });

    // Outside click minimizes the widget. Clicks anywhere inside the chatbot
    // (window or launcher) never change the open/minimized state on their own.
    document.addEventListener("click", (event) => {
        const state = getState();
        if (state === CHAT_STATES.MINIMIZED) return;
        if (!wrapper.contains(event.target)) {
            minimizeChat();
        }
    });

    document.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;
        const state = getState();
        if (state === CHAT_STATES.CLOSE_CONFIRMATION) {
            cancelClose();
        } else if (state === CHAT_STATES.OPEN || state === CHAT_STATES.PREVIEW) {
            minimizeChat();
        }
    });

    if (script?.dataset.open === "true") {
        openChat();
    } else {
        showSlide(0);
        previewDelay = window.setTimeout(showPreview, PREVIEW_DELAY_MS);
    }
})();
