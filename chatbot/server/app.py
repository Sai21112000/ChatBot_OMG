from __future__ import annotations

import json
import os
import secrets
import sqlite3
from pathlib import Path
from typing import Literal

import httpx
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from .feedback import ALLOWED_OPTIONS, send_feedback
from .feedback_store import SQLiteFeedbackStore
from .knowledge import KnowledgeChunk, load_knowledge, select_context
from .prompts import SYSTEM_PROMPT, build_user_prompt


def _clean_env(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip().strip('"').strip("'")


CHATBOT_DIR = Path(__file__).resolve().parents[1]
PROJECT_DIR = CHATBOT_DIR.parent
ADMIN_DIR = CHATBOT_DIR / "admin"
load_dotenv(CHATBOT_DIR / ".env")

GEMINI_API_KEY = _clean_env("GEMINI_API_KEY")
GEMINI_MODEL = _clean_env("GEMINI_MODEL", "gemini-flash-latest") or "gemini-flash-latest"
GEMINI_API_URL = _clean_env(
    "GEMINI_API_URL",
    "https://generativelanguage.googleapis.com/v1beta/models",
).rstrip("/") or "https://generativelanguage.googleapis.com/v1beta/models"
MAX_CONTEXT_MESSAGES = 20
MAX_FEEDBACK_MESSAGES = 100

knowledge_setting = os.getenv("KNOWLEDGE_DIR", "../Resources")
knowledge_path = Path(knowledge_setting)
if not knowledge_path.is_absolute():
    knowledge_path = (CHATBOT_DIR / knowledge_path).resolve()

try:
    KNOWLEDGE: list[KnowledgeChunk] = load_knowledge(
        knowledge_path,
        CHATBOT_DIR / "knowledge" / "catalog.json",
    )
    KNOWLEDGE_ERROR: str | None = None
except (FileNotFoundError, OSError, RuntimeError, ValueError) as error:
    KNOWLEDGE = []
    KNOWLEDGE_ERROR = str(error)

feedback_database_setting = os.getenv(
    "FEEDBACK_DATABASE_PATH",
    "data/chatbot_feedback.db",
)
feedback_database_path = Path(feedback_database_setting)
if not feedback_database_path.is_absolute():
    feedback_database_path = (CHATBOT_DIR / feedback_database_path).resolve()
FEEDBACK_STORE = SQLiteFeedbackStore(feedback_database_path)
try:
    FEEDBACK_STORE.initialize()
    FEEDBACK_STORAGE_ERROR: str | None = None
except (OSError, sqlite3.Error) as error:
    FEEDBACK_STORAGE_ERROR = str(error)


class HistoryMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4_000)


class ChatRequest(BaseModel):
    user_id: str = Field(
        min_length=8,
        max_length=128,
        pattern=r"^[A-Za-z0-9_-]+$",
    )
    conversation_id: str = Field(
        min_length=8,
        max_length=128,
        pattern=r"^[A-Za-z0-9_-]+$",
    )
    message: str = Field(min_length=1, max_length=2_000)
    history: list[HistoryMessage] = Field(
        default_factory=list,
        max_length=MAX_CONTEXT_MESSAGES,
    )


class Reference(BaseModel):
    title: str
    section: str
    url: str


class ChatResponse(BaseModel):
    answer: str
    references: list[Reference] = Field(default_factory=list)
    suggestions: list[str] = Field(default_factory=list)
    fallback: bool = False


class FeedbackRequest(BaseModel):
    user_id: str = Field(
        min_length=8,
        max_length=128,
        pattern=r"^[A-Za-z0-9_-]+$",
    )
    conversation_id: str = Field(
        min_length=8,
        max_length=128,
        pattern=r"^[A-Za-z0-9_-]+$",
    )
    interaction: list[HistoryMessage] = Field(
        default_factory=list,
        max_length=MAX_FEEDBACK_MESSAGES,
    )
    option: str = Field(min_length=1, max_length=120)
    comment: str = Field(default="", max_length=2_000)


class FeedbackResponse(BaseModel):
    ok: bool
    stored: bool = False
    feedback_id: str = ""
    emailed: bool = False
    method: str = "logged"
    to: str = ""
    error: str | None = None


app = FastAPI(
    title="OMG Experience Chatbot API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url=None,
)

allowed_origins = [
    origin.strip()
    for origin in os.getenv(
        "ALLOWED_ORIGINS",
        "http://127.0.0.1:5500,http://localhost:5500",
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)


def require_admin(
    request: Request,
    authorization: str | None = Header(default=None),
) -> None:
    configured_token = _clean_env("ADMIN_DASHBOARD_TOKEN")
    if not configured_token:
        client_host = request.client.host if request.client else ""
        if client_host in {"127.0.0.1", "::1", "localhost", "testclient"}:
            return
        raise HTTPException(
            status_code=503,
            detail="Configure ADMIN_DASHBOARD_TOKEN before remote dashboard access.",
        )

    scheme, _, supplied_token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not secrets.compare_digest(
        supplied_token,
        configured_token,
    ):
        raise HTTPException(status_code=401, detail="Invalid admin token")


def fallback_response() -> ChatResponse:
    return ChatResponse(
        answer=(
            "I’m unable to reach the travel assistant right now. "
            "Please contact the OMG Experience team at +66 2 630 4600 "
            "or info@omgexp.com for help."
        ),
        fallback=True,
    )


def parse_model_response(
    raw_text: str,
    selected_chunks: list[KnowledgeChunk],
) -> ChatResponse:
    try:
        parsed = json.loads(raw_text)
    except (json.JSONDecodeError, TypeError):
        parsed = {"answer": raw_text}

    if not isinstance(parsed, dict):
        parsed = {"answer": raw_text}

    answer = str(parsed.get("answer", "")).strip()
    if not answer:
        return fallback_response()

    allowed_sources = {chunk.id: chunk for chunk in selected_chunks}
    references: list[Reference] = []
    seen_urls: set[str] = set()
    source_ids = parsed.get("source_ids", [])
    if isinstance(source_ids, list):
        for source_id in source_ids:
            chunk = allowed_sources.get(str(source_id))
            if not chunk or chunk.url in seen_urls:
                continue
            seen_urls.add(chunk.url)
            references.append(
                Reference(
                    title=chunk.page_title,
                    section=chunk.section_title,
                    url=chunk.url,
                )
            )
            if len(references) == 4:
                break

    suggestions: list[str] = []
    raw_suggestions = parsed.get("suggestions", [])
    if isinstance(raw_suggestions, list):
        for suggestion in raw_suggestions:
            value = str(suggestion).strip()
            if not value or len(value) > 180 or value in suggestions:
                continue
            suggestions.append(value)
            if len(suggestions) == 3:
                break

    return ChatResponse(
        answer=answer,
        references=references,
        suggestions=suggestions,
    )


def gemini_contents(request: ChatRequest, context: str) -> list[dict[str, object]]:
    contents: list[dict[str, object]] = []
    for item in request.history[-MAX_CONTEXT_MESSAGES:]:
        text = (item.content or "").strip()
        if not text:
            continue  # skip empty/placeholder turns
        role = "model" if item.role == "assistant" else "user"
        contents.append({"role": role, "parts": [{"text": text}]})

    # Gemini requires the conversation to begin with a user turn. Drop any
    # leading model turns so the payload always starts with the visitor.
    while contents and contents[0]["role"] == "model":
        contents.pop(0)

    contents.append(
        {
            "role": "user",
            "parts": [{"text": build_user_prompt(request.message, context)}],
        }
    )
    return contents


@app.get("/health")
async def health() -> dict[str, object]:
    feedback_storage = FEEDBACK_STORE.diagnostics()
    if FEEDBACK_STORAGE_ERROR and feedback_storage["ready"]:
        feedback_storage["startup_error"] = FEEDBACK_STORAGE_ERROR
    return {
        "status": "ok" if KNOWLEDGE and GEMINI_API_KEY else "configuration_required",
        "gemini_configured": bool(GEMINI_API_KEY),
        "knowledge_pages": sorted({chunk.page_name for chunk in KNOWLEDGE}),
        "knowledge_chunks": len(KNOWLEDGE),
        "knowledge_error": KNOWLEDGE_ERROR,
        "model": GEMINI_MODEL,
        "feedback_to": _clean_env("FEEDBACK_TO", "info@omgexp.com") or "info@omgexp.com",
        "feedback_storage": feedback_storage,
    }


@app.get("/admin/feedback", include_in_schema=False)
async def feedback_dashboard() -> FileResponse:
    return FileResponse(ADMIN_DIR / "dashboard.html")


@app.get("/admin/feedback.css", include_in_schema=False)
async def feedback_dashboard_css() -> FileResponse:
    return FileResponse(ADMIN_DIR / "dashboard.css", media_type="text/css")


@app.get("/admin/feedback.js", include_in_schema=False)
async def feedback_dashboard_js() -> FileResponse:
    return FileResponse(
        ADMIN_DIR / "dashboard.js",
        media_type="application/javascript",
    )


@app.get(
    "/api/admin/feedback",
    dependencies=[Depends(require_admin)],
)
async def admin_feedback(
    search: str = Query(default="", max_length=120),
    option: str = Query(default="", max_length=120),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> dict[str, object]:
    try:
        return FEEDBACK_STORE.dashboard_data(
            search=search.strip(),
            option=option.strip(),
            limit=limit,
            offset=offset,
        )
    except (OSError, sqlite3.Error) as error:
        raise HTTPException(
            status_code=503,
            detail=f"Feedback database is unavailable: {error}",
        ) from error


@app.post("/api/chat", response_model=ChatResponse)
async def chat(request: ChatRequest) -> ChatResponse:
    if not GEMINI_API_KEY or not KNOWLEDGE:
        result = fallback_response()
    else:
        context, selected_chunks = select_context(KNOWLEDGE, request.message)
        contents = gemini_contents(request, context)
        payload = {
            "system_instruction": {"parts": [{"text": SYSTEM_PROMPT}]},
            "contents": contents,
            "generationConfig": {
                "temperature": 0.2,
                # gemini-*-flash is a "thinking" model whose reasoning tokens count
                # toward maxOutputTokens. Keep the answer budget generous and disable
                # thinking so the full reply is returned instead of being truncated
                # (finishReason=MAX_TOKENS) after reasoning consumes the budget.
                "maxOutputTokens": 1024,
                "thinkingConfig": {"thinkingBudget": 0},
                "responseMimeType": "application/json",
                "responseSchema": {
                    "type": "OBJECT",
                    "properties": {
                        "answer": {"type": "STRING"},
                        "source_ids": {
                            "type": "ARRAY",
                            "items": {"type": "STRING"},
                        },
                        "suggestions": {
                            "type": "ARRAY",
                            "items": {"type": "STRING"},
                        },
                    },
                    "required": ["answer", "source_ids", "suggestions"],
                },
            },
        }

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{GEMINI_API_URL}/{GEMINI_MODEL}:generateContent",
                    headers={
                        "Content-Type": "application/json",
                        "X-goog-api-key": GEMINI_API_KEY,
                    },
                    json=payload,
                )
                response.raise_for_status()
                data = response.json()
                raw_text = data["candidates"][0]["content"]["parts"][0]["text"].strip()
                result = parse_model_response(raw_text, selected_chunks)
        except (
            httpx.HTTPError,
            KeyError,
            IndexError,
            TypeError,
            ValueError,
        ):
            result = fallback_response()

    try:
        FEEDBACK_STORE.record_exchange(
            user_id=request.user_id,
            conversation_id=request.conversation_id,
            user_message=request.message,
            assistant_message=result.answer,
        )
    except (OSError, sqlite3.Error, TypeError, ValueError):
        pass
    return result


@app.post("/api/feedback", response_model=FeedbackResponse)
async def feedback(request: FeedbackRequest) -> FeedbackResponse:
    if request.option not in ALLOWED_OPTIONS:
        return FeedbackResponse(
            ok=False,
            error="Choose one of the listed feedback options.",
        )
    interaction = [
        {"role": item.role, "content": item.content}
        for item in request.interaction
    ]
    try:
        feedback_id = FEEDBACK_STORE.save_feedback(
            user_id=request.user_id,
            conversation_id=request.conversation_id,
            interaction=interaction,
            feedback={
                "option": request.option,
                "comment": request.comment,
            },
        )
    except (OSError, sqlite3.Error, TypeError, ValueError) as error:
        return FeedbackResponse(
            ok=False,
            stored=False,
            error=f"Feedback could not be stored: {error}",
        )

    try:
        notification = send_feedback(request.option, request.comment)
    except (OSError, ValueError):
        notification = {
            "emailed": False,
            "method": "database_only",
            "to": _clean_env("FEEDBACK_TO", "info@omgexp.com") or "info@omgexp.com",
        }

    return FeedbackResponse(
        ok=True,
        stored=True,
        feedback_id=feedback_id,
        emailed=bool(notification.get("emailed", False)),
        method=str(notification.get("method", "database_only")),
        to=str(notification.get("to", "")),
    )
