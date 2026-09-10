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
- `POST /api/feedback` emails a close-screen rating to `FEEDBACK_TO`. SMTP is used when configured; otherwise the Mac Mail app is used, with a local log backup.
- `POST /api/chat` accepts:

```json
{
  "message": "What is the baggage allowance to Paro?",
  "history": [
    {"role": "user", "content": "I am flying from Bangkok"}
  ]
}
```

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
