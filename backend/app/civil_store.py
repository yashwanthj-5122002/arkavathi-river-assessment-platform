from __future__ import annotations

import json
import re
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.auth_store import AuthUser, connect

BACKEND_DIR = Path(__file__).resolve().parents[1]
RUNTIME_DIR = BACKEND_DIR / "runtime"
UPLOAD_ROOT = RUNTIME_DIR / "uploads"

ENTRY_TYPES = {
    "RIVER_SURVEY": "RIV",
    "DRAIN_SURVEY": "DR",
    "STRUCTURE": "STR",
    "OUTFALL": "OUT",
    "WATER_SAMPLE": "SMP",
    "CRITICAL_LOCATION": "CRIT",
}

ENTRY_REQUIRED: dict[str, tuple[str, ...]] = {
    "RIVER_SURVEY": ("location_id", "river_tributary", "chainage_km", "latitude", "longitude"),
    "DRAIN_SURVEY": ("drain_id", "drain_name", "latitude", "longitude"),
    "STRUCTURE": ("structure_id", "structure_type", "latitude", "longitude"),
    "OUTFALL": ("outfall_id", "latitude", "longitude", "source_type"),
    "WATER_SAMPLE": ("sample_id", "location_id", "sampling_date", "sample_status"),
    "CRITICAL_LOCATION": ("critical_location_id", "category", "problem", "priority"),
}

EDITABLE_STATUSES = {"DRAFT", "RETURNED"}
VISIBLE_STATUSES = {"DRAFT", "SUBMITTED", "UNDER_REVIEW", "RETURNED", "APPROVED"}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def ensure_civil_schema() -> None:
    with connect() as db:
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS civil_entries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                public_id TEXT UNIQUE,
                institution_id TEXT NOT NULL REFERENCES organizations(id),
                entry_type TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'DRAFT',
                payload_json TEXT NOT NULL,
                created_by INTEGER NOT NULL REFERENCES users(id),
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                submitted_at TEXT,
                review_started_at TEXT,
                reviewed_at TEXT,
                reviewer_id INTEGER REFERENCES users(id),
                review_comment TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_civil_entries_institution
              ON civil_entries(institution_id, status, entry_type);
            CREATE INDEX IF NOT EXISTS idx_civil_entries_status
              ON civil_entries(status, submitted_at);

            CREATE TABLE IF NOT EXISTS civil_attachments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                public_id TEXT NOT NULL UNIQUE,
                entry_id INTEGER NOT NULL REFERENCES civil_entries(id) ON DELETE CASCADE,
                institution_id TEXT NOT NULL REFERENCES organizations(id),
                original_name TEXT NOT NULL,
                stored_name TEXT NOT NULL,
                content_type TEXT,
                size_bytes INTEGER NOT NULL,
                uploaded_by INTEGER NOT NULL REFERENCES users(id),
                uploaded_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_civil_attachments_entry ON civil_attachments(entry_id);
            """
        )
        db.commit()
    UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)


def _require_institution_writer(user: AuthUser) -> None:
    if user.organization_type != "INSTITUTION":
        raise PermissionError("Institution account required")
    if user.role not in {"INSTITUTION_ADMIN", "INSTITUTION_USER"}:
        raise PermissionError("This institution account is read-only")


def _clean_entry_type(value: str) -> str:
    entry_type = value.strip().upper()
    if entry_type not in ENTRY_TYPES:
        raise ValueError("Unsupported Civil entry type")
    return entry_type


def _clean_fields(entry_type: str, fields: Any) -> dict[str, Any]:
    if not isinstance(fields, dict):
        raise ValueError("fields must be an object")
    clean: dict[str, Any] = {}
    for key, value in fields.items():
        key = str(key).strip()
        if not key or len(key) > 80:
            continue
        if isinstance(value, str):
            value = value.strip()
            if len(value) > 5000:
                raise ValueError(f"Field {key} is too long")
        elif isinstance(value, (int, float, bool)) or value is None:
            pass
        else:
            value = str(value)[:5000]
        clean[key] = value

    missing = [name for name in ENTRY_REQUIRED[entry_type] if str(clean.get(name, "")).strip() == ""]
    if missing:
        raise ValueError("Missing required field(s): " + ", ".join(missing))
    return clean


def _row_to_entry(db: sqlite3.Connection, row: sqlite3.Row) -> dict[str, Any]:
    payload = json.loads(row["payload_json"] or "{}")
    attachments = [
        dict(item)
        for item in db.execute(
            """
            SELECT public_id,original_name,content_type,size_bytes,uploaded_at
            FROM civil_attachments WHERE entry_id=? ORDER BY id
            """,
            (row["id"],),
        ).fetchall()
    ]
    return {
        "public_id": row["public_id"],
        "institution_id": row["institution_id"],
        "institution_name": row["institution_name"],
        "entry_type": row["entry_type"],
        "status": row["status"],
        "fields": payload,
        "created_by": row["created_by"],
        "created_by_name": row["created_by_name"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "submitted_at": row["submitted_at"],
        "review_started_at": row["review_started_at"],
        "reviewed_at": row["reviewed_at"],
        "reviewer_name": row["reviewer_name"],
        "review_comment": row["review_comment"],
        "attachments": attachments,
    }


def _entry_query() -> str:
    return """
        SELECT e.*,
               o.name AS institution_name,
               cu.display_name AS created_by_name,
               ru.display_name AS reviewer_name
        FROM civil_entries e
        JOIN organizations o ON o.id=e.institution_id
        JOIN users cu ON cu.id=e.created_by
        LEFT JOIN users ru ON ru.id=e.reviewer_id
    """


def create_entry(user: AuthUser, entry_type: str, fields: Any, *, submit: bool = False) -> dict[str, Any]:
    ensure_civil_schema()
    _require_institution_writer(user)
    entry_type = _clean_entry_type(entry_type)
    clean = _clean_fields(entry_type, fields)
    now = _now()
    status = "SUBMITTED" if submit else "DRAFT"
    with connect() as db:
        cur = db.execute(
            """
            INSERT INTO civil_entries(institution_id,entry_type,status,payload_json,created_by,created_at,updated_at,submitted_at)
            VALUES(?,?,?,?,?,?,?,?)
            """,
            (
                user.organization_id,
                entry_type,
                status,
                json.dumps(clean, ensure_ascii=False, separators=(",", ":")),
                user.id,
                now,
                now,
                now if submit else None,
            ),
        )
        row_id = int(cur.lastrowid)
        inst = user.organization_id.replace("-", "")
        public_id = f"{inst}-{ENTRY_TYPES[entry_type]}-{row_id:06d}"
        db.execute("UPDATE civil_entries SET public_id=? WHERE id=?", (public_id, row_id))
        db.commit()
        row = db.execute(_entry_query() + " WHERE e.id=?", (row_id,)).fetchone()
        return _row_to_entry(db, row)


def update_entry(user: AuthUser, public_id: str, fields: Any) -> dict[str, Any]:
    ensure_civil_schema()
    _require_institution_writer(user)
    with connect() as db:
        row = db.execute(_entry_query() + " WHERE e.public_id=?", (public_id,)).fetchone()
        if not row or row["institution_id"] != user.organization_id:
            raise LookupError("Record not found")
        if row["status"] not in EDITABLE_STATUSES:
            raise ValueError("Only Draft or Returned records can be edited")
        clean = _clean_fields(row["entry_type"], fields)
        db.execute(
            "UPDATE civil_entries SET payload_json=?,updated_at=? WHERE id=?",
            (json.dumps(clean, ensure_ascii=False, separators=(",", ":")), _now(), row["id"]),
        )
        db.commit()
        row = db.execute(_entry_query() + " WHERE e.id=?", (row["id"],)).fetchone()
        return _row_to_entry(db, row)


def submit_entry(user: AuthUser, public_id: str) -> dict[str, Any]:
    ensure_civil_schema()
    _require_institution_writer(user)
    with connect() as db:
        row = db.execute(_entry_query() + " WHERE e.public_id=?", (public_id,)).fetchone()
        if not row or row["institution_id"] != user.organization_id:
            raise LookupError("Record not found")
        if row["status"] not in EDITABLE_STATUSES:
            raise ValueError("Only Draft or Returned records can be submitted")
        now = _now()
        db.execute(
            """
            UPDATE civil_entries
            SET status='SUBMITTED',submitted_at=?,updated_at=?,review_started_at=NULL,reviewed_at=NULL,reviewer_id=NULL
            WHERE id=?
            """,
            (now, now, row["id"]),
        )
        db.commit()
        row = db.execute(_entry_query() + " WHERE e.id=?", (row["id"],)).fetchone()
        return _row_to_entry(db, row)


def _entry_visible_to_user(user: AuthUser, row: sqlite3.Row) -> bool:
    if user.organization_type == "COMPANY":
        return True
    if user.organization_type == "CNNL":
        return row["status"] == "APPROVED"
    return row["institution_id"] == user.organization_id


def list_entries(user: AuthUser, *, status: str | None = None, entry_type: str | None = None) -> list[dict[str, Any]]:
    ensure_civil_schema()
    params: list[Any] = []
    where: list[str] = []
    if user.organization_type == "INSTITUTION":
        where.append("e.institution_id=?")
        params.append(user.organization_id)
    elif user.organization_type == "CNNL":
        where.append("e.status='APPROVED'")
    if status:
        status = status.strip().upper()
        if status not in VISIBLE_STATUSES:
            raise ValueError("Unknown status")
        where.append("e.status=?")
        params.append(status)
    if entry_type:
        entry_type = _clean_entry_type(entry_type)
        where.append("e.entry_type=?")
        params.append(entry_type)
    sql = _entry_query()
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY e.updated_at DESC,e.id DESC"
    with connect() as db:
        return [_row_to_entry(db, row) for row in db.execute(sql, params).fetchall()]


def get_entry(user: AuthUser, public_id: str) -> dict[str, Any]:
    ensure_civil_schema()
    with connect() as db:
        row = db.execute(_entry_query() + " WHERE e.public_id=?", (public_id,)).fetchone()
        if not row or not _entry_visible_to_user(user, row):
            raise LookupError("Record not found")
        return _row_to_entry(db, row)


def review_entry(user: AuthUser, public_id: str, action: str, comment: str = "") -> dict[str, Any]:
    ensure_civil_schema()
    if user.organization_type != "COMPANY" or user.role not in {"COMPANY_ADMIN", "COMPANY_REVIEWER"}:
        raise PermissionError("Company reviewer access required")
    action = action.strip().lower()
    with connect() as db:
        row = db.execute(_entry_query() + " WHERE e.public_id=?", (public_id,)).fetchone()
        if not row:
            raise LookupError("Record not found")
        now = _now()
        if action == "review":
            if row["status"] != "SUBMITTED":
                raise ValueError("Only Submitted records can be moved Under Review")
            status = "UNDER_REVIEW"
            db.execute(
                "UPDATE civil_entries SET status=?,review_started_at=?,reviewer_id=?,review_comment=?,updated_at=? WHERE id=?",
                (status, now, user.id, comment.strip()[:3000], now, row["id"]),
            )
        elif action in {"approve", "return"}:
            if row["status"] not in {"SUBMITTED", "UNDER_REVIEW"}:
                raise ValueError("Only Submitted or Under Review records can be reviewed")
            status = "APPROVED" if action == "approve" else "RETURNED"
            if action == "return" and not comment.strip():
                raise ValueError("Return comment is required")
            db.execute(
                "UPDATE civil_entries SET status=?,reviewed_at=?,reviewer_id=?,review_comment=?,updated_at=? WHERE id=?",
                (status, now, user.id, comment.strip()[:3000], now, row["id"]),
            )
        else:
            raise ValueError("action must be review, approve or return")
        db.commit()
        row = db.execute(_entry_query() + " WHERE e.id=?", (row["id"],)).fetchone()
        return _row_to_entry(db, row)


def institution_metrics(user: AuthUser) -> dict[str, Any]:
    ensure_civil_schema()
    if user.organization_type != "INSTITUTION":
        raise PermissionError("Institution account required")
    with connect() as db:
        rows = db.execute(
            "SELECT entry_type,status,COUNT(*) AS n FROM civil_entries WHERE institution_id=? GROUP BY entry_type,status",
            (user.organization_id,),
        ).fetchall()
    by_status = {status: 0 for status in VISIBLE_STATUSES}
    by_type = {entry_type: 0 for entry_type in ENTRY_TYPES}
    for row in rows:
        by_status[row["status"]] = by_status.get(row["status"], 0) + int(row["n"])
        by_type[row["entry_type"]] = by_type.get(row["entry_type"], 0) + int(row["n"])
    total = sum(by_status.values())
    field_records = by_type["RIVER_SURVEY"] + by_type["DRAIN_SURVEY"]
    return {
        "total_records": total,
        "field_records": field_records,
        "samples": by_type["WATER_SAMPLE"],
        "drafts": by_status.get("DRAFT", 0),
        "submitted": by_status.get("SUBMITTED", 0),
        "under_review": by_status.get("UNDER_REVIEW", 0),
        "returned": by_status.get("RETURNED", 0),
        "approved": by_status.get("APPROVED", 0),
        "by_type": by_type,
        "progress_pct": None,
    }


def _safe_filename(name: str) -> str:
    name = Path(name).name.strip()
    name = re.sub(r"[^A-Za-z0-9._ -]+", "_", name)
    name = name[:160] or "attachment.bin"
    return name


def save_attachment(user: AuthUser, public_id: str, filename: str, content_type: str | None, content: bytes) -> dict[str, Any]:
    ensure_civil_schema()
    _require_institution_writer(user)
    if not content:
        raise ValueError("Attachment is empty")
    if len(content) > 15 * 1024 * 1024:
        raise ValueError("Attachment exceeds 15 MB limit")
    filename = _safe_filename(filename)
    with connect() as db:
        row = db.execute("SELECT id,institution_id,status FROM civil_entries WHERE public_id=?", (public_id,)).fetchone()
        if not row or row["institution_id"] != user.organization_id:
            raise LookupError("Record not found")
        if row["status"] not in EDITABLE_STATUSES:
            raise ValueError("Attachments can only be added to Draft or Returned records")
        entry_dir = UPLOAD_ROOT / user.organization_id / public_id
        entry_dir.mkdir(parents=True, exist_ok=True)
        stored = f"{uuid.uuid4().hex}_{filename}"
        target = entry_dir / stored
        target.write_bytes(content)
        attachment_id = f"ATT-{uuid.uuid4().hex[:16].upper()}"
        db.execute(
            """
            INSERT INTO civil_attachments(public_id,entry_id,institution_id,original_name,stored_name,content_type,size_bytes,uploaded_by,uploaded_at)
            VALUES(?,?,?,?,?,?,?,?,?)
            """,
            (attachment_id, row["id"], user.organization_id, filename, stored, content_type, len(content), user.id, _now()),
        )
        db.commit()
    return {
        "public_id": attachment_id,
        "original_name": filename,
        "content_type": content_type,
        "size_bytes": len(content),
    }


def attachment_for_user(user: AuthUser, attachment_public_id: str) -> tuple[dict[str, Any], Path]:
    ensure_civil_schema()
    with connect() as db:
        row = db.execute(
            """
            SELECT a.*,e.status AS entry_status
            FROM civil_attachments a JOIN civil_entries e ON e.id=a.entry_id
            WHERE a.public_id=?
            """,
            (attachment_public_id,),
        ).fetchone()
        if not row:
            raise LookupError("Attachment not found")
        if user.organization_type == "INSTITUTION" and row["institution_id"] != user.organization_id:
            raise LookupError("Attachment not found")
        if user.organization_type == "CNNL" and row["entry_status"] != "APPROVED":
            raise LookupError("Attachment not found")
        path = UPLOAD_ROOT / row["institution_id"] / db.execute("SELECT public_id FROM civil_entries WHERE id=?", (row["entry_id"],)).fetchone()[0] / row["stored_name"]
        meta = {
            "public_id": row["public_id"],
            "original_name": row["original_name"],
            "content_type": row["content_type"] or "application/octet-stream",
            "size_bytes": row["size_bytes"],
        }
        return meta, path
