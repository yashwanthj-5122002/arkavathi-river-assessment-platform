from __future__ import annotations

import secrets
import shutil
from pathlib import Path
from typing import Any

from app.auth_store import AuthUser, RUNTIME_DIR, connect, iso, utc_now

EVENT_MEDIA_DIR = RUNTIME_DIR / "event_media"
EVENT_STATUSES = {"DRAFT", "UPCOMING", "COMPLETED"}


def _is_company_admin(user: AuthUser) -> bool:
    return user.organization_type == "COMPANY" and user.role == "COMPANY_ADMIN"


def _require_admin(user: AuthUser) -> None:
    if not _is_company_admin(user):
        raise PermissionError("Company administrator access required for event management")


def _clean_text(value: Any, *, max_len: int, required: bool = False, field: str = "value") -> str:
    text = str(value or "").strip()
    if required and not text:
        raise ValueError(f"{field} is required")
    if len(text) > max_len:
        raise ValueError(f"{field} is too long (maximum {max_len} characters)")
    return text


def _normalize_status(value: Any) -> str:
    status = str(value or "UPCOMING").strip().upper()
    if status not in EVENT_STATUSES:
        raise ValueError("status must be DRAFT, UPCOMING or COMPLETED")
    return status


def ensure_event_schema() -> None:
    EVENT_MEDIA_DIR.mkdir(parents=True, exist_ok=True)
    with connect() as db:
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS project_events (
                public_id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                event_date TEXT NOT NULL DEFAULT '',
                event_time TEXT NOT NULL DEFAULT '',
                location TEXT NOT NULL DEFAULT '',
                short_description TEXT NOT NULL DEFAULT '',
                description TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'UPCOMING' CHECK(status IN ('DRAFT','UPCOMING','COMPLETED')),
                created_by INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(created_by) REFERENCES users(id)
            );

            CREATE TABLE IF NOT EXISTS project_event_images (
                public_id TEXT PRIMARY KEY,
                event_id TEXT NOT NULL,
                original_name TEXT NOT NULL,
                content_type TEXT NOT NULL,
                size_bytes INTEGER NOT NULL,
                storage_name TEXT NOT NULL UNIQUE,
                sort_order INTEGER NOT NULL DEFAULT 0,
                uploaded_at TEXT NOT NULL,
                FOREIGN KEY(event_id) REFERENCES project_events(public_id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_project_events_status_date
                ON project_events(status, event_date, created_at);
            CREATE INDEX IF NOT EXISTS idx_project_event_images_event
                ON project_event_images(event_id, sort_order, uploaded_at);
            """
        )


def _event_row_to_dict(db, row) -> dict[str, Any]:
    images = db.execute(
        """
        SELECT public_id, original_name, content_type, size_bytes, sort_order, uploaded_at
        FROM project_event_images
        WHERE event_id = ?
        ORDER BY sort_order ASC, uploaded_at ASC
        """,
        (row["public_id"],),
    ).fetchall()
    return {
        "public_id": row["public_id"],
        "title": row["title"],
        "event_date": row["event_date"],
        "event_time": row["event_time"],
        "location": row["location"],
        "short_description": row["short_description"],
        "description": row["description"],
        "status": row["status"],
        "created_by": row["created_by"],
        "created_by_name": row["created_by_name"] or "",
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "images": [
            {
                "public_id": image["public_id"],
                "original_name": image["original_name"],
                "content_type": image["content_type"],
                "size_bytes": image["size_bytes"],
                "sort_order": image["sort_order"],
                "uploaded_at": image["uploaded_at"],
                "url": f"/api/v1/events/media/{image['public_id']}",
            }
            for image in images
        ],
    }


def _select_sql(where: str = "") -> str:
    return f"""
        SELECT e.*, u.display_name AS created_by_name
        FROM project_events e
        LEFT JOIN users u ON u.id = e.created_by
        {where}
    """


def list_events(user: AuthUser, status: str | None = None) -> list[dict[str, Any]]:
    ensure_event_schema()
    params: list[Any] = []
    clauses: list[str] = []
    if status:
        normalized = _normalize_status(status)
        clauses.append("e.status = ?")
        params.append(normalized)
    if not _is_company_admin(user):
        clauses.append("e.status <> 'DRAFT'")
    where = "WHERE " + " AND ".join(clauses) if clauses else ""
    order = "ORDER BY CASE e.status WHEN 'UPCOMING' THEN 0 WHEN 'COMPLETED' THEN 1 ELSE 2 END, e.event_date ASC, e.created_at DESC"
    with connect() as db:
        rows = db.execute(f"{_select_sql(where)} {order}", params).fetchall()
        return [_event_row_to_dict(db, row) for row in rows]


def get_event(user: AuthUser, public_id: str) -> dict[str, Any]:
    ensure_event_schema()
    with connect() as db:
        row = db.execute(_select_sql("WHERE e.public_id = ?"), (public_id,)).fetchone()
        if row is None:
            raise LookupError("Event not found")
        if row["status"] == "DRAFT" and not _is_company_admin(user):
            raise PermissionError("This event is not published")
        return _event_row_to_dict(db, row)


def current_upcoming_event(user: AuthUser) -> dict[str, Any] | None:
    ensure_event_schema()
    with connect() as db:
        row = db.execute(
            f"{_select_sql('WHERE e.status = ?')} ORDER BY CASE WHEN e.event_date = '' THEN 1 ELSE 0 END, e.event_date ASC, e.created_at DESC LIMIT 1",
            ("UPCOMING",),
        ).fetchone()
        return _event_row_to_dict(db, row) if row else None


def completed_events(user: AuthUser, limit: int = 50) -> list[dict[str, Any]]:
    ensure_event_schema()
    limit = max(1, min(int(limit), 200))
    with connect() as db:
        rows = db.execute(
            f"{_select_sql('WHERE e.status = ?')} ORDER BY CASE WHEN e.event_date = '' THEN 1 ELSE 0 END, e.event_date DESC, e.created_at DESC LIMIT ?",
            ("COMPLETED", limit),
        ).fetchall()
        return [_event_row_to_dict(db, row) for row in rows]


def create_event(user: AuthUser, payload: dict[str, Any]) -> dict[str, Any]:
    _require_admin(user)
    ensure_event_schema()
    title = _clean_text(payload.get("title"), max_len=180, required=True, field="title")
    event_date = _clean_text(payload.get("event_date"), max_len=32, field="event_date")
    event_time = _clean_text(payload.get("event_time"), max_len=32, field="event_time")
    location = _clean_text(payload.get("location"), max_len=220, field="location")
    short_description = _clean_text(payload.get("short_description"), max_len=500, field="short_description")
    description = _clean_text(payload.get("description"), max_len=8000, field="description")
    status = _normalize_status(payload.get("status"))
    now = iso(utc_now())
    public_id = "EVT-" + secrets.token_hex(6).upper()
    with connect() as db:
        db.execute(
            """
            INSERT INTO project_events (
                public_id, title, event_date, event_time, location,
                short_description, description, status, created_by, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (public_id, title, event_date, event_time, location, short_description, description, status, user.id, now, now),
        )
    return get_event(user, public_id)


def update_event(user: AuthUser, public_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    _require_admin(user)
    current = get_event(user, public_id)
    values = {
        "title": _clean_text(payload.get("title", current["title"]), max_len=180, required=True, field="title"),
        "event_date": _clean_text(payload.get("event_date", current["event_date"]), max_len=32, field="event_date"),
        "event_time": _clean_text(payload.get("event_time", current["event_time"]), max_len=32, field="event_time"),
        "location": _clean_text(payload.get("location", current["location"]), max_len=220, field="location"),
        "short_description": _clean_text(payload.get("short_description", current["short_description"]), max_len=500, field="short_description"),
        "description": _clean_text(payload.get("description", current["description"]), max_len=8000, field="description"),
        "status": _normalize_status(payload.get("status", current["status"])),
    }
    with connect() as db:
        result = db.execute(
            """
            UPDATE project_events
            SET title=?, event_date=?, event_time=?, location=?, short_description=?, description=?, status=?, updated_at=?
            WHERE public_id=?
            """,
            (
                values["title"], values["event_date"], values["event_time"], values["location"],
                values["short_description"], values["description"], values["status"], iso(utc_now()), public_id,
            ),
        )
        if result.rowcount == 0:
            raise LookupError("Event not found")
    return get_event(user, public_id)


def set_event_status(user: AuthUser, public_id: str, status: str) -> dict[str, Any]:
    _require_admin(user)
    normalized = _normalize_status(status)
    with connect() as db:
        result = db.execute(
            "UPDATE project_events SET status=?, updated_at=? WHERE public_id=?",
            (normalized, iso(utc_now()), public_id),
        )
        if result.rowcount == 0:
            raise LookupError("Event not found")
    return get_event(user, public_id)


def delete_event(user: AuthUser, public_id: str) -> dict[str, Any]:
    _require_admin(user)
    ensure_event_schema()
    with connect() as db:
        images = db.execute("SELECT storage_name FROM project_event_images WHERE event_id=?", (public_id,)).fetchall()
        result = db.execute("DELETE FROM project_events WHERE public_id=?", (public_id,))
        if result.rowcount == 0:
            raise LookupError("Event not found")
    for image in images:
        path = EVENT_MEDIA_DIR / image["storage_name"]
        try:
            path.unlink(missing_ok=True)
        except OSError:
            pass
    return {"status": "ok", "deleted": public_id}


def save_event_image(user: AuthUser, public_id: str, filename: str, content_type: str | None, content: bytes) -> dict[str, Any]:
    _require_admin(user)
    ensure_event_schema()
    get_event(user, public_id)
    safe_name = Path(filename or "event-image").name.strip() or "event-image"
    content_type = (content_type or "application/octet-stream").split(";", 1)[0].strip().lower()
    if not content_type.startswith("image/"):
        raise ValueError("Only image files can be uploaded to an event")
    if not content:
        raise ValueError("Image file is empty")
    if len(content) > 15 * 1024 * 1024:
        raise ValueError("Event image exceeds 15 MB limit")
    suffix = Path(safe_name).suffix.lower()
    if suffix not in {".jpg", ".jpeg", ".png", ".webp", ".gif"}:
        suffix = ".img"
    image_id = "EIMG-" + secrets.token_hex(8).upper()
    storage_name = image_id + suffix
    EVENT_MEDIA_DIR.mkdir(parents=True, exist_ok=True)
    path = EVENT_MEDIA_DIR / storage_name
    path.write_bytes(content)
    now = iso(utc_now())
    try:
        with connect() as db:
            row = db.execute("SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM project_event_images WHERE event_id=?", (public_id,)).fetchone()
            sort_order = int(row["next_order"] if row else 0)
            db.execute(
                """
                INSERT INTO project_event_images (
                    public_id, event_id, original_name, content_type, size_bytes, storage_name, sort_order, uploaded_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (image_id, public_id, safe_name, content_type, len(content), storage_name, sort_order, now),
            )
    except Exception:
        path.unlink(missing_ok=True)
        raise
    return {
        "public_id": image_id,
        "original_name": safe_name,
        "content_type": content_type,
        "size_bytes": len(content),
        "sort_order": sort_order,
        "uploaded_at": now,
        "url": f"/api/v1/events/media/{image_id}",
    }


def delete_event_image(user: AuthUser, public_id: str, image_id: str) -> dict[str, Any]:
    _require_admin(user)
    ensure_event_schema()
    with connect() as db:
        row = db.execute(
            "SELECT storage_name FROM project_event_images WHERE public_id=? AND event_id=?",
            (image_id, public_id),
        ).fetchone()
        if row is None:
            raise LookupError("Event image not found")
        db.execute("DELETE FROM project_event_images WHERE public_id=? AND event_id=?", (image_id, public_id))
    try:
        (EVENT_MEDIA_DIR / row["storage_name"]).unlink(missing_ok=True)
    except OSError:
        pass
    return {"status": "ok", "deleted": image_id}


def event_image_for_user(user: AuthUser, image_id: str) -> tuple[dict[str, Any], Path]:
    ensure_event_schema()
    with connect() as db:
        row = db.execute(
            """
            SELECT i.*, e.status
            FROM project_event_images i
            JOIN project_events e ON e.public_id = i.event_id
            WHERE i.public_id=?
            """,
            (image_id,),
        ).fetchone()
        if row is None:
            raise LookupError("Event image not found")
        if row["status"] == "DRAFT" and not _is_company_admin(user):
            raise PermissionError("This event is not published")
        meta = {
            "public_id": row["public_id"],
            "original_name": row["original_name"],
            "content_type": row["content_type"],
            "size_bytes": row["size_bytes"],
        }
        return meta, EVENT_MEDIA_DIR / row["storage_name"]
