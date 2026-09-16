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
    const PREVIEW_RETURN_DELAY_MS = 60_000;
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

    const defaultStarters = [
        "How do I Book & Hold a flight from Bangkok?",
        "Which destinations do you fly to from Bangkok?",
        "What is the Bangkok to Paro group fare?",
        "Do I need a visa for Bhutan?",
        "What is the baggage allowance?",
    ];
    const pageName = window.location.pathname.split("/").pop()?.toLowerCase() || "index.html";
    const pageEngagement = {
        "offers.html": {
            kicker: "Need help choosing the right fare?",
            starters: [
                "Compare the current group fares from Bangkok.",
                "What is included in the Bangkok to Paro group fare?",
                "How does the flexible Gaya group charter work?",
            ],
        },
        "destinations.html": {
            kicker: "Planning where to fly next?",
            starters: [
                "Compare Paro, Gaya and Kolkata from Bangkok.",
                "Show me the Bangkok to Paro flight information.",
                "Which destination is best for my first trip?",
            ],
        },
        "travel_info.html": {
            kicker: "Questions before you fly?",
            starters: [
                "What is the baggage allowance?",
                "Do I need a visa for Bhutan?",
                "What should I prepare before flying to Paro?",
            ],
        },
        "book_hold.html": {
            kicker: "Ready to plan your booking?",
            starters: [
                "How does Book & Hold work?",
                "What details do I need to request a seat hold?",
                "When and how will my fare be confirmed?",
            ],
        },
    }[pageName] || {
        kicker: "A little inspiration for your trip",
        starters: defaultStarters,
    };
    const starters = pageEngagement.starters;
    const previewSessionKey = `omg-chat-preview-seen:${window.location.pathname}`;
    const feedbackSessionKey = "omg-chat-feedback-shown";
    const resourceUrl = (filename) => new URL(filename, window.location.href).href;
    const guidedFlows = {
        main: {
            title: "Choose an option",
            items: [
                { label: "Plan a trip", next: "plan" },
                { label: "Destinations and schedules", next: "destinations" },
                { label: "Fares and group travel", next: "fares" },
                { label: "Baggage, visa and travel information", next: "travel" },
                { label: "Book and hold", next: "booking" },
                { label: "Contact the Bangkok team", next: "contact" },
            ],
        },
        plan: {
            title: "Plan a trip",
            items: [
                { label: "Help me choose a destination", prompt: "Help me choose between Paro, Gaya and Kolkata from Bangkok." },
                { label: "Plan my first Bhutan visit", prompt: "What should a first-time visitor know about planning a trip to Bhutan?" },
                { label: "Find the best time to visit", prompt: "What is the best time to visit Bhutan and why?" },
            ],
        },
        destinations: {
            title: "Destinations and schedules",
            items: [
                { label: "Compare all destinations", prompt: "Compare Paro, Gaya and Kolkata flights from Bangkok." },
                { label: "Bangkok to Paro", prompt: "Show me the Bangkok to Paro flight information." },
                { label: "Bangkok to Gaya", prompt: "Show me the Bangkok to Gaya seasonal flight information." },
                { label: "Bangkok to Kolkata", prompt: "Show me the Bangkok to Kolkata flight information." },
            ],
        },
        fares: {
            title: "Fares and group travel",
            items: [
                { label: "Compare current fares", prompt: "Compare the current published fares from Bangkok in a table." },
                { label: "Paro group fare", prompt: "Explain the Bangkok to Paro group fare and what it includes." },
                { label: "Gaya group fare", prompt: "Explain the Bangkok to Gaya group fare and what it includes." },
                { label: "Flexible group charter", prompt: "How does the flexible Gaya group charter work?" },
            ],
        },
        travel: {
            title: "Before you fly",
            items: [
                { label: "Baggage allowance", prompt: "Compare the baggage allowance by route and cabin." },
                { label: "Bhutan visa and SDF", prompt: "Explain the Bhutan visa and Sustainable Development Fee requirements." },
                { label: "India visa", prompt: "What are the India visa requirements for Gaya or Kolkata?" },
                { label: "Preparing for Paro", prompt: "What should I prepare before flying to Paro?" },
            ],
        },
        booking: {
            title: "Book and hold",
            items: [
                { label: "How Book and Hold works", prompt: "How does Book & Hold work and what details do I need?" },
                { label: "Open Book and Hold page", href: resourceUrl("book_hold.html") },
            ],
        },
        contact: {
            title: "Contact the Bangkok team",
            items: [
                { label: "Show contact information", prompt: "How can I contact the Bangkok reservation team?" },
                { label: "Call +66 2 630 4600", href: "tel:+6626304600" },
                { label: "Email info@omgexp.com", href: "mailto:info@omgexp.com" },
                { label: "Open contact page", href: resourceUrl("contact.html") },
            ],
        },
    };

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
                        <strong class="omg-chat-brand-welcome">OMG's AI Expert</strong>
                        <strong class="omg-chat-brand-thread">OMG's AI Expert</strong>
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
                <div class="omg-chat-flow-menu" hidden>
                    <div class="omg-chat-flow-header">
                        <button class="omg-chat-flow-back" type="button" aria-label="Back to main options" hidden>←</button>
                        <strong class="omg-chat-flow-title" id="omg-chat-flow-title">Choose an option</strong>
                        <button class="omg-chat-flow-close" type="button" aria-label="Close options">×</button>
                    </div>
                    <div class="omg-chat-flow-options" id="omg-chat-flow-options" role="menu" aria-labelledby="omg-chat-flow-title"></div>
                </div>
                <form class="omg-chat-form">
                    <button
                        class="omg-chat-menu-toggle"
                        type="button"
                        aria-label="Choose a guided option"
                        aria-controls="omg-chat-flow-options"
                        aria-expanded="false"
                        aria-haspopup="menu"
                    >
                        <span></span><span></span><span></span>
                    </button>
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
                <span>OMG's AI Expert</span>
            </div>
            <p class="omg-chat-preview-kicker">${pageEngagement.kicker}</p>
            <div class="omg-chat-preview-slider" aria-label="Suggestion slides">
                <button class="omg-chat-preview-arrow omg-chat-preview-previous" type="button" aria-label="Previous suggestion">←</button>
                <button class="omg-chat-preview-question" type="button">
                    <span></span>
                </button>
                <button class="omg-chat-preview-arrow omg-chat-preview-next" type="button" aria-label="Next suggestion">→</button>
            </div>
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
    const previewPrevious = wrapper.querySelector(".omg-chat-preview-previous");
    const previewNext = wrapper.querySelector(".omg-chat-preview-next");
    const previewOpen = wrapper.querySelector(".omg-chat-preview-open");
    const previewDismiss = wrapper.querySelector(".omg-chat-preview-dismiss");
    const closeButton = wrapper.querySelector(".omg-chat-close");
    const minimizeButton = wrapper.querySelector(".omg-chat-minimize");
    const greeting = wrapper.querySelector(".omg-chat-greeting");
    const startTitle = wrapper.querySelector(".omg-chat-start-title");
    const suggestions = wrapper.querySelector(".omg-chat-suggestions");
    const messages = wrapper.querySelector(".omg-chat-messages");
    const form = wrapper.querySelector(".omg-chat-form");
    const flowMenu = wrapper.querySelector(".omg-chat-flow-menu");
    const flowTitle = wrapper.querySelector(".omg-chat-flow-title");
    const flowOptions = wrapper.querySelector(".omg-chat-flow-options");
    const flowBack = wrapper.querySelector(".omg-chat-flow-back");
    const flowClose = wrapper.querySelector(".omg-chat-flow-close");
    const menuToggle = wrapper.querySelector(".omg-chat-menu-toggle");
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
    let engagementObserver;
    let engagementScrollHandler;
    let activeFlow = "main";
    let feedbackShownInRuntime = false;
    let activeSlide = 0;
    let previewPaused = false;

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

    function schedulePreview(delay = PREVIEW_RETURN_DELAY_MS) {
        window.clearTimeout(previewDelay);
        previewDelay = window.setTimeout(() => {
            if (getState() === CHAT_STATES.MINIMIZED) {
                showPreview();
            }
        }, delay);
    }

    function openChat() {
        window.clearTimeout(previewDelay);
        setState(CHAT_STATES.OPEN);
        input.focus();
    }

    function minimizeChat() {
        window.clearTimeout(previewDelay);
        setState(CHAT_STATES.MINIMIZED);
        launcher.focus();
        schedulePreview();
    }

    function showPreview(moveFocus = false) {
        if (getState() !== CHAT_STATES.MINIMIZED) return;
        window.clearTimeout(previewDelay);
        const launcherHadFocus = document.activeElement === launcher;
        setState(CHAT_STATES.PREVIEW);
        if (moveFocus || launcherHadFocus) {
            previewOpen.focus({ preventScroll: true });
        }
    }

    function hasShownProactivePreview() {
        try {
            return window.sessionStorage.getItem(previewSessionKey) === "true";
        } catch {
            return false;
        }
    }

    function markProactivePreviewShown() {
        try {
            window.sessionStorage.setItem(previewSessionKey, "true");
        } catch {
            // The preview still works when storage is blocked.
        }
    }

    function stopEngagementTracking() {
        engagementObserver?.disconnect();
        engagementObserver = undefined;
        if (engagementScrollHandler) {
            window.removeEventListener("scroll", engagementScrollHandler);
            engagementScrollHandler = undefined;
        }
    }

    function revealProactivePreview() {
        if (hasShownProactivePreview()) return;
        markProactivePreviewShown();
        stopEngagementTracking();
        showPreview();
    }

    function openPreviewManually() {
        markProactivePreviewShown();
        stopEngagementTracking();
        showPreview(true);
    }

    function startEngagementTracking() {
        if (hasShownProactivePreview()) return;

        const offersSection = document.querySelector("#offers");
        if (offersSection && "IntersectionObserver" in window) {
            engagementObserver = new IntersectionObserver(
                (entries) => {
                    if (entries.some((entry) => entry.isIntersecting)) {
                        revealProactivePreview();
                    }
                },
                { threshold: 0.2 }
            );
            engagementObserver.observe(offersSection);
            return;
        }

        engagementScrollHandler = () => {
            const documentHeight = Math.max(
                document.documentElement.scrollHeight,
                document.body.scrollHeight
            );
            const viewedDepth = (window.scrollY + window.innerHeight) / documentHeight;
            if (viewedDepth >= 0.55) {
                revealProactivePreview();
            }
        };
        window.addEventListener("scroll", engagementScrollHandler, { passive: true });
        engagementScrollHandler();
    }

    function askPreviewQuestion() {
        const question = starters[activeSlide];
        openChat();
        sendMessage(question);
    }

    function hasShownFeedback() {
        if (feedbackShownInRuntime) return true;
        try {
            return window.sessionStorage.getItem(feedbackSessionKey) === "true";
        } catch {
            return false;
        }
    }

    function markFeedbackShown() {
        feedbackShownInRuntime = true;
        try {
            window.sessionStorage.setItem(feedbackSessionKey, "true");
        } catch {
            // The per-page runtime flag still prevents repeat prompts.
        }
    }

    function requestClose() {
        if (hasShownFeedback()) {
            confirmClose();
            return;
        }
        markFeedbackShown();
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
        closeFlowMenu();
        feedbackForm.reset();
        const firstOption = feedbackForm.querySelector('input[name="feedback-option"]');
        if (firstOption) firstOption.checked = true;
        feedbackStatus.textContent = "";
        feedbackSend.disabled = false;
        activeFlow = "main";
        renderFlow("main");
    }

    /* ---- Messaging ---- */

    function closeFlowMenu(restoreFocus = false) {
        flowMenu.hidden = true;
        menuToggle.setAttribute("aria-expanded", "false");
        if (restoreFocus) menuToggle.focus();
    }

    function runFlowItem(item) {
        if (item.next) {
            renderFlow(item.next);
            return;
        }
        closeFlowMenu();
        if (item.prompt) {
            sendMessage(item.prompt);
        }
    }

    function renderFlow(flowId = "main") {
        const flow = guidedFlows[flowId] || guidedFlows.main;
        activeFlow = flowId in guidedFlows ? flowId : "main";
        flowTitle.textContent = flow.title;
        flowBack.hidden = activeFlow === "main";
        flowOptions.replaceChildren();

        flow.items.forEach((item) => {
            const option = document.createElement(item.href ? "a" : "button");
            option.className = "omg-chat-flow-option";
            option.setAttribute("role", "menuitem");
            if (item.href) {
                option.href = item.href;
                option.addEventListener("click", () => closeFlowMenu());
            } else {
                option.type = "button";
                option.addEventListener("click", () => runFlowItem(item));
            }
            const label = document.createElement("span");
            label.textContent = item.label;
            const arrow = document.createElement("span");
            arrow.textContent = item.next ? "›" : "→";
            arrow.setAttribute("aria-hidden", "true");
            option.append(label, arrow);
            flowOptions.appendChild(option);
        });
    }

    function openFlowMenu(flowId = "main") {
        if (getState() !== CHAT_STATES.OPEN) openChat();
        renderFlow(flowId);
        flowMenu.hidden = false;
        menuToggle.setAttribute("aria-expanded", "true");
        flowOptions.querySelector("[role='menuitem']")?.focus();
    }

    function toggleFlowMenu() {
        if (flowMenu.hidden) {
            openFlowMenu("main");
        } else {
            closeFlowMenu(true);
        }
    }

    function activateConversation() {
        windowElement.dataset.conversation = "true";
        input.placeholder = "Message OMG's AI Expert";
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

    function appendInlineContent(parent, value) {
        const text = value
            .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
            .replace(/<[^>]*>/g, "");
        const tokenPattern = /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\*[^*]+\*|_[^_]+_)/g;
        let lastIndex = 0;
        const appendPlainText = (plainText) => {
            const cleaned = plainText.replace(/\*{1,2}|__|`/g, "");
            parent.append(document.createTextNode(cleaned));
        };

        for (const match of text.matchAll(tokenPattern)) {
            if (match.index > lastIndex) {
                appendPlainText(text.slice(lastIndex, match.index));
            }

            const token = match[0];
            const strong = token.startsWith("**") || token.startsWith("__");
            const code = token.startsWith("`");
            const element = document.createElement(strong ? "strong" : code ? "code" : "em");
            element.textContent = token.slice(strong ? 2 : 1, strong ? -2 : -1);
            parent.appendChild(element);
            lastIndex = match.index + token.length;
        }

        if (lastIndex < text.length) {
            appendPlainText(text.slice(lastIndex));
        }
    }

    function parseTableRow(line) {
        return line
            .trim()
            .replace(/^\|/, "")
            .replace(/\|$/, "")
            .split("|")
            .map((cell) => cell.trim());
    }

    function isTableDivider(line) {
        const cells = parseTableRow(line);
        return cells.length > 1 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
    }

    function appendTable(container, lines, startIndex) {
        const headerCells = parseTableRow(lines[startIndex]);
        const tableWrap = document.createElement("div");
        tableWrap.className = "omg-chat-table-wrap";
        const table = document.createElement("table");
        const head = document.createElement("thead");
        const headRow = document.createElement("tr");

        headerCells.forEach((cell) => {
            const th = document.createElement("th");
            appendInlineContent(th, cell);
            headRow.appendChild(th);
        });
        head.appendChild(headRow);
        table.appendChild(head);

        const body = document.createElement("tbody");
        let index = startIndex + 2;
        while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
            const row = document.createElement("tr");
            parseTableRow(lines[index]).forEach((cell) => {
                const td = document.createElement("td");
                appendInlineContent(td, cell);
                row.appendChild(td);
            });
            body.appendChild(row);
            index += 1;
        }
        table.appendChild(body);
        tableWrap.appendChild(table);
        container.appendChild(tableWrap);
        return index;
    }

    function appendList(container, lines, startIndex, ordered) {
        const list = document.createElement(ordered ? "ol" : "ul");
        const pattern = ordered ? /^\s*\d+[.)]\s+(.+)$/ : /^\s*[-*•]\s+(.+)$/;
        let index = startIndex;

        while (index < lines.length) {
            const match = lines[index].match(pattern);
            if (!match) break;
            const item = document.createElement("li");
            appendInlineContent(item, match[1]);
            list.appendChild(item);
            index += 1;
        }
        container.appendChild(list);
        return index;
    }

    function renderAssistantContent(container, content) {
        const lines = content.replace(/\r\n?/g, "\n").split("\n");
        const fragment = document.createDocumentFragment();
        let index = 0;

        while (index < lines.length) {
            const line = lines[index].trim();
            if (!line) {
                index += 1;
                continue;
            }

            if (/^[-*_]{3,}$/.test(line)) {
                index += 1;
                continue;
            }

            if (
                line.includes("|") &&
                index + 1 < lines.length &&
                isTableDivider(lines[index + 1])
            ) {
                index = appendTable(fragment, lines, index);
                continue;
            }

            const heading = line.match(/^(#{1,4})\s+(.+)$/);
            if (heading) {
                const title = document.createElement(heading[1].length < 3 ? "h3" : "h4");
                appendInlineContent(title, heading[2]);
                fragment.appendChild(title);
                index += 1;
                continue;
            }

            if (/^\s*[-*•]\s+/.test(lines[index])) {
                index = appendList(fragment, lines, index, false);
                continue;
            }

            if (/^\s*\d+[.)]\s+/.test(lines[index])) {
                index = appendList(fragment, lines, index, true);
                continue;
            }

            const paragraph = document.createElement("p");
            appendInlineContent(paragraph, line.replace(/^#{1,4}\s*/, ""));
            fragment.appendChild(paragraph);
            index += 1;
        }

        container.classList.add("omg-chat-rich");
        container.replaceChildren(fragment);
    }

    function appendResponseExtras(message, references = [], followups = []) {
        const validReferences = Array.isArray(references)
            ? references.filter((reference) => {
                if (!reference || typeof reference.url !== "string") return false;
                try {
                    return new URL(reference.url, window.location.href).origin === window.location.origin;
                } catch {
                    return false;
                }
            })
            : [];
        const validFollowups = Array.isArray(followups)
            ? followups.filter((item) => typeof item === "string" && item.trim()).slice(0, 3)
            : [];

        if (!validReferences.length && !validFollowups.length) return;

        const extras = document.createElement("div");
        extras.className = "omg-chat-response-extras";

        if (validReferences.length) {
            const referencesBox = document.createElement("div");
            referencesBox.className = "omg-chat-references";
            const label = document.createElement("span");
            label.className = "omg-chat-extras-label";
            label.textContent = "References";
            referencesBox.appendChild(label);

            validReferences.forEach((reference) => {
                const link = document.createElement("a");
                link.className = "omg-chat-reference";
                link.href = new URL(reference.url, window.location.href).href;
                link.textContent = reference.section
                    ? `${reference.title} — ${reference.section}`
                    : reference.title;
                referencesBox.appendChild(link);
            });
            extras.appendChild(referencesBox);
        }

        if (validFollowups.length) {
            const followupBox = document.createElement("div");
            followupBox.className = "omg-chat-followups";
            const label = document.createElement("span");
            label.className = "omg-chat-extras-label";
            label.textContent = "You may also ask";
            followupBox.appendChild(label);

            validFollowups.forEach((followup) => {
                const button = document.createElement("button");
                button.className = "omg-chat-followup";
                button.type = "button";
                button.textContent = followup.trim();
                button.addEventListener("click", () => sendMessage(followup));
                followupBox.appendChild(button);
            });

            const menuButton = document.createElement("button");
            menuButton.className = "omg-chat-followup omg-chat-followup-menu";
            menuButton.type = "button";
            menuButton.textContent = "Choose another topic";
            menuButton.addEventListener("click", () => openFlowMenu("main"));
            followupBox.appendChild(menuButton);
            extras.appendChild(followupBox);
        }

        message.insertAdjacentElement("afterend", extras);
        extras.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    function resolveAssistantMessage(message, content, references = [], followups = []) {
        delete message.dataset.loading;
        message.removeAttribute("role");
        message.removeAttribute("aria-label");
        renderAssistantContent(message, content);
        appendResponseExtras(message, references, followups);
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
            if (role === "assistant") {
                renderAssistantContent(message, content);
            } else {
                message.textContent = content;
            }
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
            resolveAssistantMessage(
                loadingMessage,
                data.answer,
                data.references,
                data.suggestions
            );
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

    launcher.addEventListener("click", openPreviewManually);
    previewOpen.addEventListener("click", openChat);
    previewDismiss.addEventListener("click", minimizeChat);
    previewQuestion.addEventListener("click", askPreviewQuestion);
    previewPrevious.addEventListener("click", () => showSlide(activeSlide - 1));
    previewNext.addEventListener("click", () => showSlide(activeSlide + 1));
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
    menuToggle.addEventListener("click", toggleFlowMenu);
    flowBack.addEventListener("click", () => renderFlow("main"));
    flowClose.addEventListener("click", () => closeFlowMenu(true));
    input.addEventListener("focus", () => closeFlowMenu());
    flowOptions.addEventListener("keydown", (event) => {
        const options = [...flowOptions.querySelectorAll("[role='menuitem']")];
        const currentIndex = options.indexOf(document.activeElement);
        let nextIndex;
        if (event.key === "ArrowDown") nextIndex = (currentIndex + 1) % options.length;
        if (event.key === "ArrowUp") nextIndex = (currentIndex - 1 + options.length) % options.length;
        if (event.key === "Home") nextIndex = 0;
        if (event.key === "End") nextIndex = options.length - 1;
        if (nextIndex === undefined) return;
        event.preventDefault();
        options[nextIndex]?.focus();
    });
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
        if (!event.composedPath().includes(wrapper)) {
            minimizeChat();
        }
    });

    document.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;
        if (!flowMenu.hidden) {
            closeFlowMenu(true);
            return;
        }
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
        startEngagementTracking();
    }
    renderFlow();
})();
