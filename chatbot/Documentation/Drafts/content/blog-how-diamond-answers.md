# Blog draft: how Diamond answers

## Strategy snapshot

- **Audience:** Developers and technical product managers evaluating a support chatbot that must stay on approved web pages.
- **Search intent:** Informational. The reader wants the request path, not a brand story.
- **Objective:** Explain one question end to end, including the checks and the limits.
- **Angle:** Diamond answers by narrowing the model's world to a ranked slice of catalogued HTML, then rejecting citations outside that slice.
- **Structure:** Direct answer, why retrieval matters, what the knowledge base is, the request path, two worked cases, trade-offs, next step.
- **Voice:** Sai Teja Vaidya. Shivek is credited once, then the piece stays on the mechanism.

## Publish-ready draft

# How Diamond answers a question using only the airline site

Diamond answers a visitor by selecting a small set of sections from approved Bhutan Airlines Thailand pages, asking the model to write only from those sections, and dropping any source identifier that was not in the selection.

The assistant is the public name for that system. [Shivek](https://www.linkedin.com/in/shivek/), Managing Director of Bhutan Airlines, originated the idea. I built the request path with the OMG Experience team. The traveller-facing account is [How we built Diamond, our AI assistant](https://omgexp.com/how-we-built-diamond.html). This article is the mechanism.

## Why a prompt is not the design

Support chatbots usually fail in one of two directions. They either search the open web and answer as if the company had said it, or they are told to "use our FAQ" and still fill gaps from model memory.

A fare, a baggage allowance, or a visa note cannot be treated as a style preference. If the page is silent, the correct output is a handoff, not a smoother paragraph. The design question is therefore: what text is the model allowed to see, and what happens to a citation it was not given?

## What counts as the website

The knowledge base is not a separate document written for the bot. It is HTML the site already publishes, named in a catalog. The catalog currently lists:

- the Thailand overview
- destinations and flight information
- current fares and group offers
- travel information, including baggage and visa material
- the Bangkok contact page
- Book & Hold
- travel guides and stories

Each entry has a filename, a public URL, a category, and aliases such as "Paro", "SDF", or "group". When the API process starts, it parses those files, removes scripts, navigation, forms, and similar non-content, and splits the rest on headings. A chunk is one section. Its identifier is the filename plus the heading slug, together with the heading, the text, and the page URL. If the catalog is invalid or a listed file is missing, the service keeps the error and loads no usable knowledge. Chat then falls back instead of answering from an empty prompt.

## What happens to one question

The browser widget does not call the model. It sends `POST /api/chat` with an anonymous user id, a conversation id, the current message, and up to 20 earlier turns.

The server then:

1. Rejects malformed ids, oversized messages, and history beyond the cap.
2. Scores every chunk against the question. Words in the title, category, and aliases count more than repeated words in the body. Very common words are ignored.
3. Takes the best chunks, at most 10, and stops at 30,000 characters.
4. Builds a user prompt whose only knowledge block is that text.
5. Calls Gemini with a system instruction and a JSON schema: `answer`, `source_ids`, and `suggestions`. Temperature is 0.2. The thinking budget is set to 0 so reasoning tokens do not consume the answer. The output cap is 1,024 tokens.
6. Maps `source_ids` back to the chunks just selected. Unknown ids are discarded. Duplicate URLs are removed. At most four references and three suggestions are kept.
7. Appends the exchange to SQLite under the anonymous conversation id. If that write fails, the visitor still receives the answer.

The model credential stays on the server. Browser origins are an explicit allow-list.

Suggested questions in the widget are a separate, local path. The home page, offers, destinations, travel information, and Book & Hold each have their own starters. A guided menu can submit a prepared prompt or open a phone link, an email link, or a site page. Those actions do not create a booking.

## Two questions, two honest outcomes

**"What is the Bangkok to Paro group fare?"**

The ranker prefers the fares page because the catalog aliases and headings overlap the question. The model is allowed to describe a published starting price and to compare routes in a table if the selected text supports the columns. It is not allowed to say the seat is held, that payment can be taken in the chat, or that the figure is confirmed for this passenger. Book & Hold, if that page was also selected, is a request the reservation team confirms before anyone discusses payment.

**"Can you change the name on my existing ticket?"**

Nothing in the approved pages is a booking record, and the service has no reservation API. The instruction says to admit the gap and send the visitor to +66 2 630 4600 or info@omgexp.com. If the model call itself fails, or the knowledge base never loaded, the API returns that same contact reply with `fallback: true`. The widget uses a matching contact message if the HTTP call fails in the browser.

The difference between the two cases is the packet. The first question has pages. The second does not have a passenger record, so the system should stop.

## Trade-offs that stay visible

**Lexical ranking is explainable and narrow.** A synonym that never appears in the page or its aliases can lose to a weaker chunk that shares more words. There are no embeddings in this path. Aliases in the catalog are the current way to teach the ranker another name for a page.

**The corpus is a process snapshot.** Editing the HTML does not update a running API. The service reads the catalog when it starts. A content change needs a reload. This is simpler to reason about than a crawler, and it will be stale if nobody restarts it.

**There is no live inventory.** The assistant cannot confirm a seat, a remaining fare, or an existing booking. Published prices are starting prices subject to confirmation by OMG Experience.

**Citations are validated even when the widget is behind.** The API returns only sources from the selected chunks. In this repository the widget renders the answer and the follow-up suggestions. It does not yet render the `references` array. A source list that travellers can open is part of the public product story; it is not finished in this widget code.

**Memory is anonymous and local.** Identifiers are generated in the browser. The SQLite table stores the transcript and an optional feedback category. That is enough for an admin dashboard with search, category filters, and a bearer token for remote access. It is not a production data platform: backup, retention, and a hosted database are still operational decisions.

**The public endpoints are not visitor-authenticated.** CORS limits which websites can call the API from a browser. It does not rate-limit a direct client. Those controls belong to the deployment, not to the prompt.

## What to do next

If you are reproducing the pattern, start with the catalog and the citation check, not with a larger model. List the pages that are allowed to speak, split them into sections you can identify, send only the sections that matched, and delete any source id the model adds. Then write the refusal you want for questions those pages cannot answer, including the phone number and the email address a person will actually see.

For how the OMG Experience team describes Diamond to travellers, read [the published story](https://omgexp.com/how-we-built-diamond.html).

## Source and uncertainty notes

- Mechanism checked against `chatbot/server/app.py`, `chatbot/server/knowledge.py`, `chatbot/server/prompts.py`, `chatbot/knowledge/catalog.json`, `chatbot/widget/chatbot.js`, and `chatbot/server/feedback_store.py`.
- Shivek credit is from the project owner for these drafts, not from the published article. No quotation is invented. https://www.linkedin.com/in/shivek/
- The published article describes traveller-facing behavior this repository does not implement: Thai answers, an in-chat enquiry form, a visible source control, deployment across group companies, and a read of the site on every update. Those are not described as current code.
- The widget gap on `references` is intentional in this draft. The API builds the field; `sendMessage` in `chatbot/widget/chatbot.js` does not pass it into the renderer.
