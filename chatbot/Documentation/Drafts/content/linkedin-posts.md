# LinkedIn drafts

Three posts, one idea each. They are not shortened copies of the Medium essay or the blog.

## Post 1 — the idea and the constraint

### Strategy snapshot

- **Audience:** Airline, travel, and product people, plus engineers who ship customer-facing models.
- **Objective:** Credit the origin of Diamond and name the constraint that made the idea safe to build.
- **Angle:** The product idea was Shivek's. The engineering rule was that the assistant may use the company's own pages and nothing else.
- **Structure:** Credit and scene, the constraint, one concrete failure it prevents, takeaway, question.

### Publish-ready draft

Diamond started as [Shivek](https://www.linkedin.com/in/shivek/)'s idea. He is Managing Director of Bhutan Airlines. I worked with the OMG Experience team to build the assistant that now sits on the Thailand site.

The constraint we refused to soften: Diamond does not answer from the open web, and it does not answer from whatever a model already associates with Bhutan. A question is matched to approved pages on the site. The model sees that text and writes from that text.

That sounds like a prompt. The part that matters is what we will not let a fluent answer do. It cannot turn a published starting fare into a confirmed seat. It cannot ask for a card number or a passport number. If the pages do not contain the answer, the visitor gets the Bangkok team, at +66 2 630 4600 or info@omgexp.com, instead of a more confident paragraph.

The team's account of the product is here: [How we built Diamond](https://omgexp.com/how-we-built-diamond.html).

**Takeaway:** For a sales agent, the first design decision is which sources are allowed to speak. Everything else is a feature on top of that list.

If you have shipped a support assistant, what did you refuse to let it invent?

### Source notes

- Shivek's role and the idea credit come from the project owner for these drafts. No quotation is invented.
- The no-open-web behavior, fare and booking limits, and contact handoff match `chatbot/server/prompts.py` and `chatbot/server/knowledge.py`.
- Do not add Thai, in-chat forms, or a visible source list to this post. Those appear in the public article and are not claims about this repository.

## Post 2 — the handoff

### Strategy snapshot

- **Audience:** Operations and product leads who are tempted to let a chatbot "handle booking."
- **Objective:** Show that stopping, and handing the traveller to a person, is a designed outcome.
- **Angle:** Book & Hold in the chat is an explanation and a request path, not a reservation and not a payment.
- **Structure:** A specific false success, what the assistant is allowed to do instead, takeaway. No repeated credit line.

### Publish-ready draft

The wrong success for an airline chatbot is a message that says the seat is held.

A visitor can ask how Book & Hold works, what details a request needs, and when the fare is confirmed. Those answers have to come from the Book & Hold page. The assistant can point to the page, the phone number, or info@omgexp.com. It cannot take a card, ask for a passport number, or tell someone the booking is done.

The reason is ordinary. The chat is not connected to inventory. A published fare is a starting price the team still confirms. Payment, in this flow, happens after a person has checked the seat. If the model is down, the visitor still gets the same phone number and email address rather than a blank window.

**Takeaway:** Write the handoff as a product state. If the assistant cannot complete the action, the next step should be a person, not a guess that sounds completed.

### Source notes

- Grounded in the Book & Hold prompt rules and the guided contact actions in `chatbot/widget/chatbot.js`.
- This post does not mention Shivek, by plan: the credit lives in post 1.
- It does not claim an in-chat enquiry form. The implemented handoff is phone, email, the contact page, and the fallback reply.

## Post 3 — inspectable retrieval

### Strategy snapshot

- **Audience:** Engineers choosing a retrieval stack for a small, high-stakes knowledge base.
- **Objective:** Defend a boring ranker where a wrong page is more costly than a missed synonym.
- **Angle:** Lexical selection over a catalog is easier to audit than a semantic index, and the citation check matters more than the ranker brand.
- **Structure:** The unfashionable choice, how scoring works, what it misses, takeaway.

### Publish-ready draft

We did not start Diamond with embeddings.

The site is a known set of pages. A catalog lists them and adds aliases a traveller might actually type: Paro, Gaya, baggage, SDF, group, Book & Hold. A question is scored by word overlap. A hit in the title or an alias counts more than the same word repeated in the body. The model receives at most 10 sections, and no more than 30,000 characters.

When the answer comes back, a source identifier is kept only if it was in that set. A page the model merely wishes it had used does not survive the response.

This will miss a question that shares no words with the right section. I would rather see that miss than debug a vector hit I cannot explain to the person who owns the fare page. Semantic search can come later, as an improvement to recall. It should not replace the rule that the citation has to be one of the chunks we sent.

**Takeaway:** On a small official corpus, pick the retriever you can argue about with the content owner. Then check the citations in code.

### Source notes

- Numbers and scoring match `select_context` in `chatbot/server/knowledge.py`: metadata weight 4, body matches capped at 8 per term, overview bonus, `max_chunks=10`, `max_characters=30_000`.
- Source-id filtering matches `parse_model_response` in `chatbot/server/app.py`.
- No claim that travellers already see those sources in this widget. No repeated Shivek credit.
