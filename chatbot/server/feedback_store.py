from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Protocol
from uuid import uuid4


TABLE_NAME = "Chatbot_Feedback_Table"


class FeedbackStore(Protocol):
    def initialize(self) -> None: ...

    def record_exchange(
        self,
        user_id: str,
        conversation_id: str,
        user_message: str,
        assistant_message: str,
    ) -> str: ...

    def save_feedback(
        self,
        user_id: str,
        conversation_id: str,
        interaction: list[dict[str, str]],
        feedback: dict[str, str],
    ) -> str: ...

    def diagnostics(self) -> dict[str, object]: ...

    def dashboard_data(
        self,
        search: str = "",
        option: str = "",
        limit: int = 50,
        offset: int = 0,
    ) -> dict[str, object]: ...


class SQLiteFeedbackStore:
    """Local feedback storage that can be replaced by a DynamoDB adapter."""

    def __init__(self, database_path: Path) -> None:
        self.database_path = database_path

    def _connect(self) -> sqlite3.Connection:
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(self.database_path, timeout=5)
        connection.row_factory = sqlite3.Row
        return connection

    def initialize(self) -> None:
        with self._connect() as connection:
            connection.execute(
                f"""
                CREATE TABLE IF NOT EXISTS {TABLE_NAME} (
                    id TEXT PRIMARY KEY,
                    conversation_id TEXT NOT NULL UNIQUE,
                    user_id TEXT NOT NULL,
                    chatbot_interaction TEXT NOT NULL,
                    feedback TEXT NOT NULL DEFAULT '{{}}',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            columns = {
                str(row["name"])
                for row in connection.execute(
                    f"PRAGMA table_info({TABLE_NAME})"
                ).fetchall()
            }
            if "conversation_id" not in columns:
                connection.execute(
                    f"ALTER TABLE {TABLE_NAME} ADD COLUMN conversation_id TEXT"
                )
                connection.execute(
                    f"""
                    UPDATE {TABLE_NAME}
                    SET conversation_id = id
                    WHERE conversation_id IS NULL OR conversation_id = ''
                    """
                )
            connection.execute(
                f"""
                CREATE INDEX IF NOT EXISTS idx_chatbot_feedback_user_created
                ON {TABLE_NAME} (user_id, created_at)
                """
            )
            connection.execute(
                f"""
                CREATE UNIQUE INDEX IF NOT EXISTS idx_chatbot_feedback_conversation
                ON {TABLE_NAME} (conversation_id)
                """
            )

    @staticmethod
    def _timestamp() -> str:
        return (
            datetime.now(timezone.utc)
            .isoformat(timespec="seconds")
            .replace("+00:00", "Z")
        )

    def record_exchange(
        self,
        user_id: str,
        conversation_id: str,
        user_message: str,
        assistant_message: str,
    ) -> str:
        self.initialize()
        timestamp = self._timestamp()
        with self._connect() as connection:
            row = connection.execute(
                f"""
                SELECT id, chatbot_interaction
                FROM {TABLE_NAME}
                WHERE conversation_id = ?
                """,
                (conversation_id,),
            ).fetchone()
            if row:
                interaction = self._json_value(row["chatbot_interaction"], [])
                if not isinstance(interaction, list):
                    interaction = []
                interaction.extend(
                    (
                        {"role": "user", "content": user_message},
                        {"role": "assistant", "content": assistant_message},
                    )
                )
                connection.execute(
                    f"""
                    UPDATE {TABLE_NAME}
                    SET user_id = ?, chatbot_interaction = ?, updated_at = ?
                    WHERE id = ?
                    """,
                    (
                        user_id,
                        self._json_text(interaction),
                        timestamp,
                        row["id"],
                    ),
                )
                return str(row["id"])

            record_id = str(uuid4())
            interaction = [
                {"role": "user", "content": user_message},
                {"role": "assistant", "content": assistant_message},
            ]
            connection.execute(
                f"""
                INSERT INTO {TABLE_NAME} (
                    id,
                    conversation_id,
                    user_id,
                    chatbot_interaction,
                    feedback,
                    created_at,
                    updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    record_id,
                    conversation_id,
                    user_id,
                    self._json_text(interaction),
                    "{}",
                    timestamp,
                    timestamp,
                ),
            )
        return record_id

    def save_feedback(
        self,
        user_id: str,
        conversation_id: str,
        interaction: list[dict[str, str]],
        feedback: dict[str, str],
    ) -> str:
        self.initialize()
        timestamp = self._timestamp()
        with self._connect() as connection:
            row = connection.execute(
                f"SELECT id FROM {TABLE_NAME} WHERE conversation_id = ?",
                (conversation_id,),
            ).fetchone()
            if row:
                connection.execute(
                    f"""
                    UPDATE {TABLE_NAME}
                    SET user_id = ?, feedback = ?, updated_at = ?
                    WHERE id = ?
                    """,
                    (
                        user_id,
                        self._json_text(feedback),
                        timestamp,
                        row["id"],
                    ),
                )
                return str(row["id"])

            record_id = str(uuid4())
            connection.execute(
                f"""
                INSERT INTO {TABLE_NAME} (
                    id,
                    conversation_id,
                    user_id,
                    chatbot_interaction,
                    feedback,
                    created_at,
                    updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    record_id,
                    conversation_id,
                    user_id,
                    self._json_text(interaction),
                    self._json_text(feedback),
                    timestamp,
                    timestamp,
                ),
            )
        return record_id

    def diagnostics(self) -> dict[str, object]:
        try:
            self.initialize()
            with self._connect() as connection:
                row = connection.execute(
                    f"SELECT COUNT(*) AS record_count FROM {TABLE_NAME}"
                ).fetchone()
            return {
                "backend": "sqlite",
                "ready": True,
                "record_count": int(row["record_count"]) if row else 0,
                "error": None,
            }
        except (OSError, sqlite3.Error) as error:
            return {
                "backend": "sqlite",
                "ready": False,
                "record_count": 0,
                "error": str(error),
            }

    @staticmethod
    def _json_value(value: str, fallback: object) -> object:
        try:
            return json.loads(value)
        except (json.JSONDecodeError, TypeError):
            return fallback

    @staticmethod
    def _json_text(value: object) -> str:
        return json.dumps(
            value,
            ensure_ascii=False,
            separators=(",", ":"),
        )

    def dashboard_data(
        self,
        search: str = "",
        option: str = "",
        limit: int = 50,
        offset: int = 0,
    ) -> dict[str, object]:
        self.initialize()
        filters: list[str] = []
        parameters: list[object] = []

        if search:
            filters.append(
                """
                (conversation_id LIKE ? OR user_id LIKE ?
                 OR chatbot_interaction LIKE ? OR feedback LIKE ?)
                """
            )
            search_value = f"%{search}%"
            parameters.extend(
                (search_value, search_value, search_value, search_value)
            )
        if option == "__none__":
            filters.append("feedback = '{}'")
        elif option:
            filters.append("feedback LIKE ?")
            parameters.append(f'%"option":"{option}"%')

        where_clause = f"WHERE {' AND '.join(filters)}" if filters else ""
        with self._connect() as connection:
            total_row = connection.execute(
                f"SELECT COUNT(*) AS total FROM {TABLE_NAME} {where_clause}",
                parameters,
            ).fetchone()
            rows = connection.execute(
                f"""
                SELECT id, conversation_id, user_id, chatbot_interaction,
                       feedback, created_at, updated_at
                FROM {TABLE_NAME}
                {where_clause}
                ORDER BY created_at DESC
                LIMIT ? OFFSET ?
                """,
                [*parameters, limit, offset],
            ).fetchall()
            summary_rows = connection.execute(
                f"""
                SELECT user_id, feedback, created_at
                FROM {TABLE_NAME}
                ORDER BY created_at DESC
                """
            ).fetchall()

        option_counts: dict[str, int] = {}
        today_prefix = datetime.now(timezone.utc).date().isoformat()
        today_conversation_count = 0
        today_feedback_count = 0
        feedback_count = 0
        users: set[str] = set()
        for row in summary_rows:
            feedback = self._json_value(row["feedback"], {})
            option = feedback.get("option") if isinstance(feedback, dict) else None
            if option:
                label = str(option)
                option_counts[label] = option_counts.get(label, 0) + 1
                feedback_count += 1
                if str(row["created_at"]).startswith(today_prefix):
                    today_feedback_count += 1
            if str(row["created_at"]).startswith(today_prefix):
                today_conversation_count += 1
            users.add(str(row["user_id"]))

        records: list[dict[str, object]] = []
        for row in rows:
            interaction = self._json_value(row["chatbot_interaction"], [])
            feedback = self._json_value(row["feedback"], {})
            records.append(
                {
                    "id": row["id"],
                    "conversation_id": row["conversation_id"],
                    "user_id": row["user_id"],
                    "interaction": interaction if isinstance(interaction, list) else [],
                    "feedback": feedback if isinstance(feedback, dict) else {},
                    "created_at": row["created_at"],
                    "updated_at": row["updated_at"],
                }
            )

        return {
            "summary": {
                "total_conversations": len(summary_rows),
                "today_conversations": today_conversation_count,
                "total_feedback": feedback_count,
                "today_feedback": today_feedback_count,
                "unique_sessions": len(users),
                "option_counts": option_counts,
            },
            "records": records,
            "filtered_total": int(total_row["total"]) if total_row else 0,
            "limit": limit,
            "offset": offset,
        }
