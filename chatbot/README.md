# OMG Experience AI Chatbot

Portable Gemini-powered support widget for the Bhutan Airlines Thailand website.
The API key remains on the server; browsers only call the local `/api/chat`
endpoint.

## Local setup

From the project root:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r chatbot/requirements.txt
cp chatbot/.env.example chatbot/.env
```

Add a newly generated Gemini key to `chatbot/.env`. Do not reuse a key that has
been shared in chat or committed anywhere.

Start the API:

```bash
uvicorn chatbot.server.app:app --reload --host 127.0.0.1 --port 8000
```

In a second terminal, serve the project:

```bash
python3 -m http.server 5500
```

Open <http://127.0.0.1:5500/Resources/index.html>. Direct `file://` access is
not supported because the widget communicates with the API over HTTP.

## Endpoints

- `GET /health` checks API configuration and loaded knowledge.
- `POST /api/feedback` attaches a close-screen rating to its existing
  conversation in SQLite, then emails `FEEDBACK_TO`. SMTP is used when
  configured; otherwise the Mac Mail app is used, with a local log backup.
- `POST /api/chat` stores every user/assistant exchange and accepts:

```json
{
  "user_id": "anonymous-session-uuid",
  "conversation_id": "conversation-uuid",
  "message": "What is the baggage allowance to Paro?",
  "history": [
    {"role": "user", "content": "I am flying from Bangkok"}
  ]
}
```

## Feedback storage

Conversations and feedback are stored locally at `FEEDBACK_DATABASE_PATH`, which defaults to
`chatbot/data/chatbot_feedback.db`. The `Chatbot_Feedback_Table` schema contains
`id`, `conversation_id`, `user_id`, `chatbot_interaction`, `feedback`,
`created_at`, and `updated_at`. Each conversation is created after its first
assistant response and updated after every later response. Feedback remains an
optional JSON value on that same record. IDs are anonymous UUIDs and timestamps
are UTC.

The persistence code is isolated in `server/feedback_store.py`. When deploying
to AWS, replace `SQLiteFeedbackStore` with a DynamoDB-backed implementation of
the same `FeedbackStore` interface and keep the existing API/widget payload.
Local database files are runtime artifacts and are excluded from Git.

## Feedback dashboard

With the API running, open
<http://127.0.0.1:8000/admin/feedback>. The dashboard shows every recorded
conversation, conversation and feedback totals, category distribution,
anonymous visitors, comments, and expandable message histories. Search and
category filters operate directly against the conversation database.

Local loopback access works without a token. Before exposing the API through a
remote host, set a long random `ADMIN_DASHBOARD_TOKEN` in `chatbot/.env`. The
dashboard will request this token and keep it only in browser `sessionStorage`;
the protected API expects it as a Bearer token. Remote dashboard API access is
blocked when no token is configured.

## Live-site integration

Host `widget/chatbot.css` and `widget/chatbot.js`, deploy the FastAPI service,
then add the following before `</body>`:

```html
<link rel="stylesheet" href="https://cdn.example.com/chatbot.css">
<script
  src="https://cdn.example.com/chatbot.js"
  data-api="https://api.example.com/api/chat"
  defer
></script>
```

Set `ALLOWED_ORIGINS` to the exact production website origins. Keep
`GEMINI_API_KEY` only in the deployment platform's secret store.
