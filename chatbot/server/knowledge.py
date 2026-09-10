from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

from bs4 import BeautifulSoup


@dataclass(frozen=True)
class KnowledgePage:
    name: str
    text: str


PREFERRED_PAGES = (
    "index.html",
    "destinations.html",
    "offers.html",
    "travel_Info.html",
    "contact.html",
    "book_hold.html",
    "blog.html",
)

STOP_WORDS = {
    "about",
    "after",
    "airlines",
    "also",
    "and",
    "are",
    "can",
    "does",
    "flight",
    "for",
    "from",
    "have",
    "help",
    "how",
    "information",
    "into",
    "need",
    "that",
    "the",
    "this",
    "what",
    "when",
    "where",
    "which",
    "with",
    "your",
}


def _html_to_text(path: Path) -> str:
    soup = BeautifulSoup(path.read_text(encoding="utf-8"), "html.parser")
    for element in soup(["script", "style", "noscript", "svg"]):
        element.decompose()

    text = soup.get_text(" ", strip=True)
    return re.sub(r"\s+", " ", text)


def load_knowledge(directory: Path) -> list[KnowledgePage]:
    if not directory.is_dir():
        raise FileNotFoundError(f"Knowledge directory does not exist: {directory}")

    pages: list[KnowledgePage] = []
    for filename in PREFERRED_PAGES:
        path = directory / filename
        if path.is_file():
            pages.append(KnowledgePage(name=filename, text=_html_to_text(path)))

    if not pages:
        raise RuntimeError(f"No supported HTML pages found in {directory}")

    return pages


def select_context(
    pages: list[KnowledgePage],
    query: str,
    max_characters: int = 45_000,
) -> str:
    terms = {
        term
        for term in re.findall(r"[a-z0-9][a-z0-9-]+", query.lower())
        if len(term) > 2 and term not in STOP_WORDS
    }

    def score(page: KnowledgePage) -> tuple[int, int]:
        haystack = f"{page.name} {page.text}".lower()
        matches = sum(haystack.count(term) for term in terms)
        baseline = 2 if page.name == "index.html" else 1 if page.name == "contact.html" else 0
        return matches + baseline, -PREFERRED_PAGES.index(page.name)

    ranked = sorted(pages, key=score, reverse=True)
    selected: list[str] = []
    used = 0

    for page in ranked:
        block = f"\nSOURCE: {page.name}\n{page.text}\n"
        remaining = max_characters - used
        if remaining <= 0:
            break
        selected.append(block[:remaining])
        used += min(len(block), remaining)

    return "".join(selected)
