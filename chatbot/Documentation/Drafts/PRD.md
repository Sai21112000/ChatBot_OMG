# Product Requirements Document

| Field | Value |
| --- | --- |
| Product | OMG Experience AI Chatbot |
| Status | Draft |
| Release | Final MVP |
| Product owner | To be assigned |
| Last updated | 2026-09-18 |

## 1. Product summary

The OMG Experience AI Chatbot is a portable web assistant for visitors to the
Bhutan Airlines Thailand website. It helps visitors find grounded information
about destinations, flights, fares, baggage, visas, Book & Hold, and Bangkok
team contact details without exposing the language-model credential to the
browser.

The MVP is an information and support experience. It does not check live
availability, confirm a fare, hold a seat, take payment, or create a booking.

## 2. Problem

Travel information is spread across multiple website pages. Visitors need a
faster way to:

- find relevant information without knowing which page contains it;
- compare routes, fares, and travel requirements;
- understand how Book & Hold works;
- reach the Bangkok reservation team when website content is insufficient; and
- give feedback about the quality of the assistant.

The business also needs an anonymous record of conversations and feedback so
the experience can be evaluated and improved.

## 3. Goals

1. Answer common visitor questions using only approved website content.
2. Provide links back to the website sections supporting an answer.
3. Offer useful guided questions for visitors who do not know what to ask.
4. Fail safely and direct visitors to the OMG Experience team when an answer
   cannot be produced.
5. Capture anonymous conversations and optional feedback for operational review.
6. Keep API keys and administrative access controls on the server.

## 4. Users

### Website visitor

A traveller or travel organiser researching Bhutan Airlines services from
Thailand. The visitor may be exploring routes, comparing offers, preparing for
travel, or looking for booking assistance.

### Reservation and support team

OMG Experience staff who need visitors to receive accurate preliminary
information and a clear handoff when human confirmation is required.

### Chatbot administrator

An authorised team member who reviews conversation volumes, feedback categories,
comments, and message histories through the feedback dashboard.

## 5. Core user journeys

### Ask a question

1. The visitor opens the widget or selects a suggested question.
2. The widget sends the question and recent conversation history to the API.
3. The assistant returns a grounded answer, supporting references, and suggested
   follow-up questions.
4. The visitor continues the conversation through a follow-up question.

The API supplies supporting references, but the current widget does not yet
display them. Exposing those references is an unmet MVP requirement rather than
a delivered user-facing capability.

### Use a guided path

1. The visitor opens the guided menu.
2. They choose a topic such as destinations, fares, travel information, booking,
   or contact.
3. The widget either submits a prepared question or opens the relevant website,
   phone, or email link.

### Recover from an unavailable answer

1. The API cannot use the model or approved knowledge, or the upstream request
   fails.
2. The visitor receives a stable fallback response.
3. The response directs them to the Bangkok team by phone or email.

### Submit feedback

1. The visitor closes the chat and chooses a feedback category.
2. They may add a comment.
3. The system associates the feedback with the anonymous conversation, stores
   it, and attempts to notify the configured recipient.

### Review feedback

1. An administrator opens the dashboard.
2. Remote access requires the configured bearer token; loopback development
   access may operate without one.
3. The administrator searches or filters conversations and reviews aggregate
   counts and message histories.

## 6. Functional requirements

### FR-1: Portable widget

- The chatbot must be embeddable using a JavaScript file and stylesheet.
- The script must accept a configurable chat API URL.
- The widget must support minimized, preview, open, and close-confirmation
  states.
- The widget must provide page-relevant starters and a guided topic menu.

### FR-2: Conversation handling

- The browser must generate anonymous user and conversation identifiers.
- A chat request must include the current message and no more than 20 recent
  history messages.
- The interface must prevent duplicate sends while waiting for a response.
- The response must support an answer, up to four references, up to three
  follow-up suggestions, and a fallback indicator.

### FR-3: Grounded answers

- The server must load approved pages listed in the knowledge catalog.
- It must extract page sections and select relevant sections for each question.
- The model must be instructed to answer only from supplied website knowledge.
- The assistant must not invent fares, schedules, policies, availability, or
  booking confirmation.
- When the knowledge is insufficient, it must direct the visitor to the OMG
  Experience team.

### FR-4: Safety and commercial boundaries

- The assistant must not ask for or accept payment-card details, passport
  numbers, passwords, or other sensitive credentials.
- Published prices must be presented as starting prices subject to confirmation.
- Book & Hold must be described as a request that requires team confirmation,
  not as a completed reservation.

### FR-5: Feedback and conversation storage

- Each successful assistant exchange must be appended to the corresponding
  anonymous conversation.
- Feedback must use one of the configured categories and may contain a comment.
- Feedback must be stored even when email notification is unavailable.
- The notification path may use SMTP, the macOS Mail app in local development,
  or a local log fallback.

### FR-6: Administration

- The dashboard must display conversation totals, feedback totals, unique
  anonymous sessions, category counts, and conversation histories.
- Administrators must be able to search, filter by feedback category, paginate,
  and refresh.
- Remote dashboard API access must require a configured bearer token.

### FR-7: Health and configuration

- The service must expose whether the model credential, knowledge base, and
  feedback store are ready.
- Allowed browser origins must be configurable.
- Secrets must be read from server-side environment configuration and must not
  be shipped to the browser or committed to source control.

## 7. Non-functional requirements

- **Accuracy:** Answers must be traceable to selected website sections.
- **Security:** Model and SMTP credentials remain server-side; remote
  administrative data requires authentication.
- **Privacy:** MVP identifiers are anonymous UUID-like values. The chatbot must
  discourage submission of sensitive data.
- **Resilience:** Model, knowledge, or notification failures must not break the
  widget; a useful fallback or database-only result must be returned.
- **Accessibility:** Interactive controls require clear labels, keyboard-usable
  native controls, and status/message regions that assistive technology can
  observe.
- **Portability:** Static assets and the API may be hosted independently, with
  exact production origins configured through CORS.
- **Maintainability:** Knowledge content, prompts, persistence, feedback
  notification, widget, and dashboard concerns remain separated.

## 8. MVP content scope

The approved knowledge catalog currently covers:

- site overview;
- destinations and flight information;
- current fares and group offers;
- baggage, visa, SDF, and other travel information;
- Bangkok team contact details;
- Book & Hold; and
- travel guides and stories.

## 9. Out of scope

- Live seat inventory, schedule, or fare APIs
- Booking creation or modification
- Payment collection
- Passenger identity or passport processing
- Authentication of website visitors
- Human live-chat routing
- Multilingual responses guaranteed by product requirements
- Cloud-native production persistence and automated database backups
- A formal content-management approval workflow

## 10. Success measures

Targets require product-owner approval and a baseline after deployment.
Recommended measures are:

- percentage of conversations receiving positive feedback;
- rate of incomplete/inaccurate feedback;
- percentage of conversations that use a reference or guided action;
- fallback response rate;
- feedback submission rate;
- API availability and response latency; and
- common unanswered topics identified through reviewed conversations.

No numeric target is asserted in this draft because the repository contains no
approved business baseline.

## 11. Dependencies and assumptions

- Website pages in the knowledge catalog are maintained as the approved source
  of truth.
- A valid Gemini API key and model endpoint are available to the server.
- The deployment environment can run the FastAPI service and access Gemini.
- Production hosting provides TLS, process supervision, logs, and secret
  storage.
- An owner is assigned to review feedback and maintain website knowledge.

## 12. Acceptance summary

The MVP is acceptable for release when:

1. the widget can be embedded on the target website and call the production API;
2. all catalogued pages load into the knowledge base;
3. representative questions return accurate answers and the widget displays the
   valid references supplied by the API;
4. fallback, feedback, dashboard authentication, and CORS behavior are tested;
5. production secrets and an admin token are configured outside the repository;
6. the feedback database has a backup and retention decision; and
7. known limitations in the Final MVP release summary are accepted by the
   product and operational owners.

## 13. Open decisions

- Assign the product owner, technical owner, and feedback-review owner.
- Approve measurable launch targets and reporting cadence.
- Decide the production database, backup, retention, and deletion policy.
- Define how website content changes are reviewed before becoming chatbot
  knowledge.
- Decide and approve the widget presentation for API-provided source references.
- Decide whether rate limiting, monitoring, and abuse controls are required
  before public launch.
