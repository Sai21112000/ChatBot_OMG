from __future__ import annotations

import os
from pathlib import Path
from typing import Literal

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .feedback import ALLOWED_OPTIONS, send_feedback
from .knowledge import KnowledgePage, load_knowledge, select_context
from .prompts import SYSTEM_PROMPT, build_user_prompt


def _clean_env(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip().strip('"').strip("'")


CHATBOT_DIR = Path(__file__).resolve().parents[1]
PROJECT_DIR = CHATBOT_DIR.parent
load_dotenv(CHATBOT_DIR / ".env")

GEMINI_API_KEY = _clean_env("GEMINI_API_KEY")
GEMINI_MODEL = _clean_env("GEMINI_MODEL", "gemini-flash-latest") or "gemini-flash-latest"
GEMINI_API_URL = _clean_env(
    "GEMINI_API_URL",
    "https://generativelanguage.googleapis.com/v1beta/models",
).rstrip("/") or "https://generativelanguage.googleapis.com/v1beta/models"
MAX_CONTEXT_MESSAGES = 20

knowledge_setting = os.getenv("KNOWLEDGE_DIR", "../Resources")
knowledge_path = Path(knowledge_setting)
if not knowledge_path.is_absolute():
    knowledge_path = (CHATBOT_DIR / knowledge_path).resolve()

try:
    KNOWLEDGE: list[KnowledgePage] = load_knowledge(knowledge_path)
    KNOWLEDGE_ERROR: str | None = None
except (FileNotFoundError, OSError, RuntimeError) as error:
    KNOWLEDGE = []
    KNOWLEDGE_ERROR = str(error)


class HistoryMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4_000)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2_000)
    history: list[HistoryMessage] = Field(
        default_factory=list,
        max_length=MAX_CONTEXT_MESSAGES,
    )


class ChatResponse(BaseModel):
    answer: str
    fallback: bool = False


class FeedbackRequest(BaseModel):
    option: str = Field(min_length=1, max_length=120)
    comment: str = Field(default="", max_length=2_000)


class FeedbackResponse(BaseModel):
    ok: bool
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


def fallback_response() -> ChatResponse:
    return ChatResponse(
        answer=(
            "I’m unable to reach the travel assistant right now. "
            "Please contact the OMG Experience team at +66 2 630 4600 "
            "or info@omgexp.com for help."
        ),
        fallback=True,
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
    return {
        "status": "ok" if KNOWLEDGE and GEMINI_API_KEY else "configuration_required",
        "gemini_configured": bool(GEMINI_API_KEY),
        "knowledge_pages": [page.name for page in KNOWLEDGE],
        "knowledge_error": KNOWLEDGE_ERROR,
        "model": GEMINI_MODEL,
        "feedback_to": _clean_env("FEEDBACK_TO", "info@omgexp.com") or "info@omgexp.com",
    }


@app.post("/api/chat", response_model=ChatResponse)
async def chat(request: ChatRequest) -> ChatResponse:
    if not GEMINI_API_KEY or not KNOWLEDGE:
        return fallback_response()

    context = select_context(KNOWLEDGE, request.message)
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
            answer = data["candidates"][0]["content"]["parts"][0]["text"].strip()
            if not answer:
                return fallback_response()
            return ChatResponse(answer=answer)
    except (
        httpx.HTTPError,
        KeyError,
        IndexError,
        TypeError,
        ValueError,
    ):
        return fallback_response()


@app.post("/api/feedback", response_model=FeedbackResponse)
async def feedback(request: FeedbackRequest) -> FeedbackResponse:
    if request.option not in ALLOWED_OPTIONS:
        return FeedbackResponse(
            ok=False,
            error="Choose one of the listed feedback options.",
        )
    try:
        result = send_feedback(request.option, request.comment)
        return FeedbackResponse(**result)
    except (OSError, ValueError) as error:
        return FeedbackResponse(ok=False, error=str(error))
