# Final MVP Release Summary

| Field | Value |
| --- | --- |
| Product | OMG Experience AI Chatbot |
| Status | Draft release summary |
| Release | Final MVP |
| Last updated | 2026-09-18 |

## 1. Release statement

The Final MVP implements an embeddable AI travel-information assistant for the
Bhutan Airlines Thailand website. It combines guided discovery with grounded
answers generated from approved website pages, provides a safe contact
fallback, records anonymous conversation feedback, and includes an
administrative review dashboard.

This document describes capabilities present in the repository. It is not a
claim that production deployment, stakeholder acceptance, load testing,
security testing, or operational sign-off has been completed.

## 2. Delivered user experience

### Embeddable chat widget

- Loads as portable JavaScript and CSS assets.
- Supports minimized, proactive preview, open, and close-confirmation states.
- Automatically loads its stylesheet when embedded from the widget script.
- Accepts configurable chat and feedback API URLs.
- Uses responsive, branded presentation without a front-end framework.

### Guided discovery

- Provides default starter questions.
- Adapts starter content for offers, destinations, travel information, and
  Book & Hold pages.
- Includes guided menus for trip planning, destinations, fares, travel
  preparation, booking, and contact.
- Can submit prepared questions or open website, telephone, and email actions.

### Conversational answers

- Maintains up to 20 recent messages as model context.
- Shows rotating generation status messages while waiting.
- Renders structured model answers, including Markdown-style headings, lists,
  emphasis, links, and comparison tables supported by the widget.
- Displays up to three suggested follow-up questions.
- Prevents a second message from being submitted while a request is active.

### Safe fallback

- Returns a consistent fallback when the model or knowledge base is unavailable
  or an upstream request fails.
- Directs visitors to the OMG Experience Bangkok team by phone or email.
- Does not expose server exception details or model credentials in the browser
  response.

### Feedback capture

- Prompts for feedback when the visitor closes the conversation.
- Supports five controlled feedback categories and an optional comment.
- Associates feedback with the anonymous conversation.
- Confirms whether feedback was recorded and whether notification was emailed.

## 3. Delivered knowledge and AI behavior

### Website-grounded knowledge

The server loads and chunks approved HTML content for:

- Bhutan Airlines Thailand overview;
- destinations and flight information;
- current fares and group offers;
- baggage, visa, SDF, and travel information;
- Bangkok team contact information;
- Book & Hold; and
- travel guides and stories.

For each question, a deterministic lexical ranker chooses the most relevant
sections and sends no more than 10 chunks or 30,000 context characters to the
model.

### Constrained model response

The server prompt requires the assistant to:

- answer only from supplied website knowledge;
- avoid inventing fares, schedules, policies, availability, and confirmations;
- present fares as starting prices subject to team confirmation;
- never claim a seat is held or a booking is complete;
- avoid requesting payment-card details, passport numbers, passwords, or other
  sensitive credentials;
- identify the supporting source IDs; and
- recommend relevant follow-up questions grounded in the same content.

The Gemini request uses a structured JSON response schema. The API maps only
source IDs present in the selected context, preventing the model from creating
arbitrary reference links.

## 4. Delivered backend API

| Endpoint | Delivered purpose |
| --- | --- |
| `GET /health` | Reports model, knowledge, and feedback-store readiness. |
| `POST /api/chat` | Validates a conversation request, retrieves context, calls Gemini, constrains the response, and records the exchange. |
| `POST /api/feedback` | Validates and stores feedback, then attempts team notification. |
| `GET /api/admin/feedback` | Returns searchable, filterable, paginated conversations and summary metrics to authorised administrators. |
| `GET /admin/feedback` | Serves the administrative dashboard. |
| `GET /docs` | Provides generated interactive FastAPI API documentation. |

Request models bound message lengths, history sizes, identifier formats, feedback
comments, search terms, and pagination parameters.

## 5. Delivered persistence and reporting

### Conversation store

- Uses SQLite for local MVP persistence.
- Maintains one row per conversation.
- Appends each user/assistant exchange to JSON conversation history.
- Stores anonymous user and conversation identifiers with UTC timestamps.
- Stores feedback as an optional JSON object on the same conversation record.
- Exposes a `FeedbackStore` protocol intended to support a future storage
  adapter.

### Feedback notification

- Writes a local feedback log.
- Uses SMTP when configured.
- Can use the macOS Mail app as a local-development fallback.
- Preserves database feedback when notification cannot be sent.

### Administrative dashboard

- Shows total and current-day conversations.
- Shows total feedback, unique anonymous sessions, and category distribution.
- Supports text search and feedback-category filters.
- Displays comments and expandable message histories.
- Supports pagination and manual refresh.
- Protects remote data access with a configurable bearer token.

## 6. Configuration delivered

The service supports environment configuration for:

- Gemini API key, model, and endpoint;
- knowledge directory;
- exact browser origins allowed by CORS;
- SQLite database location;
- feedback recipient;
- remote dashboard token; and
- optional SMTP host, port, username, password, and sender.

An example environment file lists the required keys without containing working
credentials. The production deployment must provide actual secrets through its
secret store.

## 7. Operational behavior delivered

- Startup attempts to load the knowledge base and initialise feedback storage.
- Knowledge and storage startup errors are retained for health diagnostics.
- Chat remains useful through a contact fallback when Gemini or knowledge is
  unavailable.
- A conversation-storage error does not prevent an answer from reaching the
  visitor.
- A feedback-storage error is returned clearly because the submission would
  otherwise be lost.
- A notification failure degrades to stored/logged feedback.
- Remote dashboard data is blocked when no admin token is configured.

## 8. Known limitations

The following items are not delivered as production-complete capabilities:

### Product limitations

- No live availability, fare, schedule, reservation, ticketing, payment, or
  passenger-record integration
- No handoff to a live-chat agent
- No visitor account or cross-device conversation continuity
- No approved multilingual requirement
- No content-management interface for chatbot knowledge

### Retrieval and AI limitations

- Retrieval is lexical rather than semantic and can miss concepts not expressed
  in aliases or source wording.
- The API returns validated source references, but the current widget does not
  render the `references` response field for visitors.
- Knowledge is loaded at process startup; published HTML changes require a
  service reload.
- The public fallback intentionally hides root causes, so operators need
  server-side diagnostics to distinguish failures.
- Model quality and schema compatibility still depend on the configured Gemini
  model.

### Data and operations limitations

- SQLite is local storage and is not a horizontally scalable production
  database.
- Backup, restore, retention, deletion, and disaster-recovery procedures are not
  implemented in this repository.
- Conversation text may contain personal information volunteered by visitors,
  despite anonymous generated IDs; a formal privacy policy is still required.
- No centralised metrics, tracing, alerting, or service-level objectives are
  included.
- No automated knowledge-quality or feedback-triage workflow is included.

### Security and delivery limitations

- Public chat and feedback endpoints do not implement rate limiting, quotas,
  CAPTCHA, or bot protection.
- CORS restricts browser origins but does not authenticate direct API clients.
- TLS, firewalling, process supervision, secret rotation, and platform access
  control must be supplied by the deployment environment.
- The generated `/docs` interface and detailed health response are public under
  the current application configuration.
- The repository does not contain a complete automated test suite or CI/CD
  release gate.

## 9. Release-readiness checklist

The capability is implemented, but production release should remain pending
until the accountable owners verify the following:

- [ ] Product owner approves PRD scope, response boundaries, and known
      limitations.
- [ ] Representative route, fare, baggage, visa, booking, and contact questions
      are tested against current website content.
- [ ] The widget displays API-provided references and all source links resolve
      correctly on the production website.
- [ ] Production Gemini credentials are configured in a secret store and
      rotated if previously exposed.
- [ ] `ALLOWED_ORIGINS` contains only exact production website origins.
- [ ] A long random `ADMIN_DASHBOARD_TOKEN` is configured and authorised staff
      can access the dashboard.
- [ ] SMTP or another supported notification path is configured and tested.
- [ ] Production storage, backups, retention, deletion, and access ownership are
      approved.
- [ ] Public endpoint abuse controls and expected traffic capacity are reviewed.
- [ ] TLS, health monitoring, central logs, alerts, and restart policy are in
      place.
- [ ] Accessibility, mobile browser, failure-state, and end-to-end checks pass.
- [ ] Rollback owner and support/escalation contacts are named.

## 10. Suggested MVP demonstration

Use the following flow for stakeholder acceptance:

1. Open the widget on the home page and verify its branded preview.
2. Ask a destinations question and confirm that the response links to a valid
   source page.
3. Use a guided fare or Book & Hold option and verify that commercial caveats
   remain intact.
4. Ask for information absent from the approved pages and confirm a safe handoff
   rather than an invented answer.
5. Continue with a follow-up question and verify conversation context.
6. Close the chat, submit categorised feedback, and confirm it appears in the
   dashboard.
7. Test the dashboard without and with the production token.
8. Disable or invalidate the model credential in a controlled environment and
   verify the health and fallback behavior.

## 11. Related documents

- [Product Requirements Document](PRD.md)
- [Architecture](Architecture.md)
- [Documentation Index](../README.md)
- [Project Setup and Integration](../../README.md)
