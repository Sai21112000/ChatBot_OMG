from __future__ import annotations

import os
import smtplib
import subprocess
import sys
from datetime import datetime, timezone
from email.message import EmailMessage
from pathlib import Path

CHATBOT_DIR = Path(__file__).resolve().parents[1]
FEEDBACK_LOG = CHATBOT_DIR / "data" / "feedback.log"

ALLOWED_OPTIONS = (
    "The assistant was helpful",
    "Answers were incomplete or inaccurate",
    "I could not find booking or fare information",
    "The chat was hard to use",
    "Other",
)


def _env(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip().strip('"').strip("'")


def _compose_body(option: str, comment: str) -> str:
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    comment_block = comment.strip() or "(no extra comment)"
    return (
        "Chatbot feedback from the Bhutan Airlines Thailand assistant.\n\n"
        f"Submitted: {stamp}\n"
        f"Option: {option}\n"
        f"Comment:\n{comment_block}\n"
    )


def _append_log(body: str) -> None:
    FEEDBACK_LOG.parent.mkdir(parents=True, exist_ok=True)
    with FEEDBACK_LOG.open("a", encoding="utf-8") as handle:
        handle.write(body)
        handle.write("\n---\n")


def _send_smtp(to_address: str, subject: str, body: str) -> bool:
    host = _env("SMTP_HOST")
    if not host:
        return False

    port = int(_env("SMTP_PORT", "587") or "587")
    user = _env("SMTP_USER")
    password = _env("SMTP_PASSWORD")
    from_address = _env("SMTP_FROM") or user or to_address

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = from_address
    message["To"] = to_address
    message.set_content(body)

    with smtplib.SMTP(host, port, timeout=20) as smtp:
        smtp.ehlo()
        smtp.starttls()
        smtp.ehlo()
        if user and password:
            smtp.login(user, password)
        smtp.send_message(message)
    return True


def _as_quote(value: str) -> str:
    escaped = value.replace("\\", "\\\\").replace('"', '\\"')
    escaped = escaped.replace("\r\n", "\n").replace("\r", "\n").replace("\n", "\\n")
    return f'"{escaped}"'


def _send_macos_mail(to_address: str, subject: str, body: str) -> bool:
    if sys.platform != "darwin":
        return False

    script = (
        "tell application \"Mail\"\n"
        f"set newMessage to make new outgoing message with properties "
        f"{{subject:{_as_quote(subject)}, content:{_as_quote(body)} & return, visible:false}}\n"
        "tell newMessage\n"
        f"make new to recipient at end of to recipients with properties {{address:{_as_quote(to_address)}}}\n"
        "send\n"
        "end tell\n"
        "end tell\n"
    )
    result = subprocess.run(
        ["osascript", "-e", script],
        capture_output=True,
        text=True,
        timeout=20,
        check=False,
    )
    return result.returncode == 0


def send_feedback(option: str, comment: str) -> dict[str, object]:
    if option not in ALLOWED_OPTIONS:
        raise ValueError("Unknown feedback option")

    to_address = _env("FEEDBACK_TO", "info@omgexp.com") or "info@omgexp.com"
    subject = f"Chatbot feedback: {option}"
    body = _compose_body(option, comment)
    _append_log(body)

    emailed = False
    method = "logged"

    try:
        if _send_smtp(to_address, subject, body):
            emailed = True
            method = "smtp"
        elif _send_macos_mail(to_address, subject, body):
            emailed = True
            method = "mail_app"
    except (OSError, smtplib.SMTPException, subprocess.SubprocessError, TimeoutError, ValueError):
        emailed = False
        method = "logged"

    return {
        "ok": True,
        "emailed": emailed,
        "method": method,
        "to": to_address,
    }
