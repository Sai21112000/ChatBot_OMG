from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path

from bs4 import BeautifulSoup, NavigableString, Tag


@dataclass(frozen=True)
class KnowledgeChunk:
    id: str
    page_name: str
    page_title: str
    section_title: str
    url: str
    category: str
    aliases: tuple[str, ...]
    text: str


@dataclass(frozen=True)
class CatalogPage:
    filename: str
    title: str
    url: str
    category: str
    aliases: tuple[str, ...]

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


def _slug(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug[:64] or "overview"


def load_catalog(path: Path) -> list[CatalogPage]:
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise ValueError(f"Invalid knowledge catalog JSON: {error}") from error

    pages = raw.get("pages")
    if not isinstance(pages, list) or not pages:
        raise ValueError("Knowledge catalog must contain a non-empty pages list")

    catalog: list[CatalogPage] = []
    seen: set[str] = set()
    for item in pages:
        if not isinstance(item, dict):
            raise ValueError("Every knowledge catalog page must be an object")
        filename = str(item.get("filename", "")).strip()
        title = str(item.get("title", "")).strip()
        url = str(item.get("url", "")).strip()
        category = str(item.get("category", "")).strip()
        aliases = item.get("aliases", [])
        if not filename or not title or not url or not category:
            raise ValueError(f"Incomplete knowledge catalog entry: {filename or 'unknown'}")
        if filename in seen:
            raise ValueError(f"Duplicate knowledge catalog filename: {filename}")
        if not isinstance(aliases, list):
            raise ValueError(f"Aliases must be a list for {filename}")
        seen.add(filename)
        catalog.append(
            CatalogPage(
                filename=filename,
                title=title,
                url=url,
                category=category,
                aliases=tuple(str(alias).strip() for alias in aliases if str(alias).strip()),
            )
        )
    return catalog


def _section_anchor(heading: Tag) -> str:
    if heading.get("id"):
        return str(heading["id"])
    parent = heading.find_parent(id=True)
    return str(parent["id"]) if parent and parent.get("id") else ""


def _page_chunks(path: Path, page: CatalogPage) -> list[KnowledgeChunk]:
    soup = BeautifulSoup(path.read_text(encoding="utf-8"), "html.parser")
    for element in soup(["script", "style", "noscript", "svg", "nav", "footer", "form"]):
        element.decompose()

    root = soup.body or soup
    chunks: list[KnowledgeChunk] = []
    section_title = page.title
    section_anchor = ""
    section_text: list[str] = []
    slug_counts: dict[str, int] = {}

    def flush() -> None:
        text = re.sub(r"\s+", " ", " ".join(section_text)).strip()
        if not text:
            return
        base_slug = section_anchor or _slug(section_title)
        count = slug_counts.get(base_slug, 0) + 1
        slug_counts[base_slug] = count
        source_id = f"{page.filename}#{base_slug}" if count == 1 else f"{page.filename}#{base_slug}-{count}"
        source_url = page.url + (f"#{section_anchor}" if section_anchor else "")
        chunks.append(
            KnowledgeChunk(
                id=source_id,
                page_name=page.filename,
                page_title=page.title,
                section_title=section_title,
                url=source_url,
                category=page.category,
                aliases=page.aliases,
                text=text,
            )
        )

    for node in root.descendants:
        if isinstance(node, Tag) and node.name in {"h1", "h2", "h3", "h4"}:
            flush()
            section_title = node.get_text(" ", strip=True) or page.title
            section_anchor = _section_anchor(node)
            section_text = [section_title]
        elif isinstance(node, NavigableString):
            parent = node.parent
            if parent and parent.name not in {"h1", "h2", "h3", "h4"}:
                value = str(node).strip()
                if value:
                    section_text.append(value)
    flush()
    return chunks


def load_knowledge(
    directory: Path,
    catalog_path: Path | None = None,
) -> list[KnowledgeChunk]:
    if not directory.is_dir():
        raise FileNotFoundError(f"Knowledge directory does not exist: {directory}")

    resolved_catalog = catalog_path or Path(__file__).resolve().parents[1] / "knowledge" / "catalog.json"
    catalog = load_catalog(resolved_catalog)
    chunks: list[KnowledgeChunk] = []
    for page in catalog:
        path = directory / page.filename
        if not path.is_file():
            raise FileNotFoundError(f"Knowledge page listed in catalog does not exist: {path}")
        chunks.extend(_page_chunks(path, page))

    if not chunks:
        raise RuntimeError(f"No knowledge chunks found in {directory}")

    return chunks


def select_context(
    chunks: list[KnowledgeChunk],
    query: str,
    max_characters: int = 30_000,
    max_chunks: int = 10,
) -> tuple[str, list[KnowledgeChunk]]:
    terms = {
        term
        for term in re.findall(r"[a-z0-9][a-z0-9-]+", query.lower())
        if len(term) > 2 and term not in STOP_WORDS
    }

    def score(chunk: KnowledgeChunk) -> tuple[int, int]:
        metadata = " ".join(
            (
                chunk.page_name,
                chunk.page_title,
                chunk.section_title,
                chunk.category,
                *chunk.aliases,
            )
        ).lower()
        metadata_matches = sum(4 for term in terms if term in metadata)
        text_matches = sum(min(chunk.text.lower().count(term), 8) for term in terms)
        overview_bonus = 1 if chunk.category == "overview" else 0
        return metadata_matches + text_matches + overview_bonus, -len(chunk.text)

    ranked = sorted(chunks, key=score, reverse=True)
    selected: list[str] = []
    selected_chunks: list[KnowledgeChunk] = []
    used = 0

    for chunk in ranked[:max_chunks]:
        block = (
            f"\nSOURCE_ID: {chunk.id}\n"
            f"SOURCE_TITLE: {chunk.page_title} — {chunk.section_title}\n"
            f"SOURCE_URL: {chunk.url}\n"
            f"{chunk.text}\n"
        )
        remaining = max_characters - used
        if remaining <= 0:
            break
        selected.append(block[:remaining])
        selected_chunks.append(chunk)
        used += min(len(block), remaining)

    return "".join(selected), selected_chunks
