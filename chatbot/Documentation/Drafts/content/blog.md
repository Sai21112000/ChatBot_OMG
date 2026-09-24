# Medium draft: grounded answers

## Strategy snapshot

- **Audience:** Engineers and product people who are putting a language model in front of customers, especially where a wrong price or policy has a cost.
- **Objective:** Explain why "use our content" has to be enforced in the request path, not only written into a prompt.
- **Angle:** The valuable behavior is a designed stop: a bounded packet of website text, a checked citation list, and a person when the packet is not enough.
- **Structure:** Premise, the assumption that a prompt is grounding, where that fails on fares and bookings, the retrieval-and-check design, then what that changes for anyone shipping a similar assistant.
- **Voice:** Sai Teja Vaidya. First person for the engineering work. Shivek is credited once as the originator of the idea.

## Publish-ready draft

# The useful assistant is the one that can stop

A travel assistant can sound competent and still be commercially false. It can name a fare the site never published, describe a seat as held, or smooth a visa rule into an answer that no page supports. The sentence is fluent. The offer is not real.

Diamond is the assistant built for that problem on the Bhutan Airlines Thailand site. The core idea came from [Shivek](https://www.linkedin.com/in/shivek/), Managing Director of Bhutan Airlines. I worked with the OMG Experience team to turn it into the system described here. The team has told the product story in public: [How we built Diamond, our AI assistant](https://omgexp.com/how-we-built-diamond.html). What follows is the engineering argument, not a retelling of that story.

## The assumption

The usual fix is a sentence in the system prompt: answer only from the material you were given. That sentence is worth writing. It is not a control.

A prompt is advice to a system that is good at continuing. If the supplied pages do not contain the number, the model can still reach for a plausible one. If two sections almost answer the question, it can blend them. If the visitor asks whether the booking is done, a helpful tone will often complete the story the visitor hoped to hear. Nothing in the prompt checks the result against the pages that were actually retrieved.

So "grounded" is often a description of intent. The traveller experiences it as a fact.

## Where it breaks down

Fares, schedules, baggage, visas, and booking status do not fail like a clumsy paragraph. They fail like a quote.

Say the site publishes a group fare as a starting price. An answer that repeats the figure and adds "your seats are held" has crossed from information into a promise. Say the visitor pastes a card number because the chat looks like a checkout. The assistant does not need to store it for the damage to begin; it only needs to invite the next message. Say the pages do not cover the question at all. A general answer about Bhutan, assembled from whatever the model already associates with the place, is not a summary of the airline's site. It is a different source, wearing the airline's voice.

In that setting I would rather return a short, stable handoff than a richer guess. The handoff we use is the Bangkok team: +66 2 630 4600 and info@omgexp.com. It is less impressive in a demo. It is the correct product when the alternative is an invented commercial claim.

## A better way to think about it

Treat grounding as a property of the request, not of the model's manners.

For Diamond, the only text the model is allowed to treat as knowledge is a packet built from approved pages on the site. A catalog names those pages: overview, destinations, fares and group offers, travel information, contact, Book & Hold, and the travel guides. At startup the service reads the HTML, drops navigation and other non-content, and splits what remains on headings. Each chunk keeps an identifier, a section title, and the page URL.

When a question arrives, a lexical ranker scores those chunks against the words in the question. Matches in titles, categories, and aliases count more than repeated words in the body. The request then carries at most 10 chunks and 30,000 characters of that text. There is no open-web search hiding behind the prompt, and there is no second corpus of "things the model knows about airlines."

The instruction beside that packet is specific, but it is still only an instruction. The model may use the supplied pages and must not fill a missing fare, schedule, visa rule, or booking from anywhere else. A published price stays a starting price until OMG Experience confirms it. The assistant may explain Book & Hold. It may not collect a card or a passport number, and it may not say the seat is held. If the packet has no answer, the reply points to the phone number or the email address.

Then the response is checked, which is the step a prompt cannot perform. The model is asked for JSON: an answer, the source identifiers it used, and a few follow-up questions. The server keeps a source only when its identifier was in the packet for that request. A citation the model composed anyway is dropped. Follow-ups are capped. The visitor's browser never holds the model credential. It talks only to our API.

The widget also gives people a way to ask before they know the right question. Starters change with the page they are on. A guided menu can submit a prepared question about routes, fares, baggage, or Book & Hold, or it can open the phone, the email, or the relevant page. That is still retrieval plus a handoff. It is not a booking system.

## What this changes in practice

If you are building something similar, the design choice is what you refuse to let the model supply.

You can refuse live availability by not connecting an inventory API, and by saying so. This assistant does not see seats, and it cannot look up an existing booking. You can refuse payment by never collecting card data and by describing Book & Hold as a request. You can refuse anonymous invention by sending only retrieved text and by deleting citations that were not in that text.

You also inherit the limits of that refusal. Word overlap is a blunt ranker. A question that uses different language from the page can miss the right section. The pages are loaded when the process starts, so a published edit is invisible until the service is reloaded. The server can reject a bad citation, and that is not the same thing as showing the page. In this repository the API returns the checked references, and the widget does not render them yet. The public story describes the traveller-facing result. This is the check the server already performs. None of those limits is a reason to skip the check.

The same restraint applies to operations. Conversations are stored under anonymous identifiers, with optional feedback, so the team can see what people are asking. Off the local machine, the dashboard requires a bearer token. That record is a product input. It is not a reason to retain more personal data than the chat was built to ask for.

The public write-up is the right place for how Diamond sits on the site. The implementation lesson is narrower. A customer-facing model becomes safer when the interesting behavior is the stop: a bounded packet, a citation list the server can reject, and a person at a known phone number when the packet runs out.

## Source and uncertainty notes

- **Idea credit:** Stated by the project owner for these drafts. Shivek, Managing Director of Bhutan Airlines, originated the core idea. No surname, quotation, or account of how he framed it is inferred. Profile: https://www.linkedin.com/in/shivek/
- **Public product story:** https://omgexp.com/how-we-built-diamond.html — linked as the team's account. Details that appear there but are not implemented in this repository, including Thai replies, an in-chat enquiry form, a visible source list, use across group sites, and a refresh on every publish, are not claimed here.
- **Engineering claims:** Checked against `chatbot/server/prompts.py`, `chatbot/server/knowledge.py`, `chatbot/server/app.py`, `chatbot/knowledge/catalog.json`, and `chatbot/widget/chatbot.js`.
- **Naming:** The public site calls the assistant Diamond. The repository README describes it as the OMG Experience AI chatbot.
- **Known gap, stated in the essay:** The API validates source IDs. This repository's widget does not yet render the `references` field.
