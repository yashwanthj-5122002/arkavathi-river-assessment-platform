from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import uuid
import zipfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from app.auth_store import AuthUser, connect

BACKEND_DIR = Path(__file__).resolve().parents[1]
PROJECT_ROOT = BACKEND_DIR.parent
RUNTIME_DIR = BACKEND_DIR / "runtime"
REPOSITORY_ROOT = RUNTIME_DIR / "department_repository"
TEMP_ROOT = RUNTIME_DIR / "department_repository_tmp"
EXPORT_ROOT = RUNTIME_DIR / "department_repository_exports"
PASSKEYS_PATH = PROJECT_ROOT / "DEPARTMENT_DATA_HUB_CREDENTIALS_V17.txt"

CHUNK_SIZE = 8 * 1024 * 1024
BROWSE_GRANT_HOURS = 2
UPLOAD_GRANT_HOURS = 48
PASSKEY_ROUNDS = 180_000

DEPARTMENTS = [
    ("CIVIL", "Civil", "CIV"),
    ("GIS", "GIS", "GIS"),
    ("SURVEY", "Survey", "SUR"),
    ("LIDAR", "LiDAR", "LDR"),
    ("PHOTOGRAMMETRY", "Photogrammetry", "PHG"),
]

# Broad project-data formats requested for the Arkavathi multidisciplinary team.
# Executable/script extensions are intentionally excluded.
ALLOWED_EXTENSIONS = {
    ".xlsx", ".xls", ".xlsm", ".csv", ".tsv",
    ".pdf", ".doc", ".docx", ".ppt", ".pptx",
    ".txt", ".xml", ".json", ".geojson",
    ".jpg", ".jpeg", ".png", ".webp", ".bmp", ".heic", ".dng",
    ".mp4", ".mov", ".avi", ".mkv", ".mts", ".m4v",
    ".tif", ".tiff", ".jp2",
    ".kml", ".kmz", ".gpkg", ".shp", ".shx", ".dbf", ".prj", ".cpg", ".sbn", ".sbx", ".qmd",
    ".dwg", ".dxf", ".dgn", ".ifc", ".rvt", ".rfa",
    ".las", ".laz", ".e57", ".ply", ".xyz", ".pts", ".pcd",
    ".obj", ".mtl", ".fbx", ".glb", ".gltf", ".b3dm",
    ".zip", ".7z", ".rar", ".tar", ".gz", ".bz2",
}

BAD_NAME_CHARS = re.compile(r"[^A-Za-z0-9._()\- ]+")
DATA_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _now_dt() -> datetime:
    # Store the host-local offset in the timestamp so day-wise dump history
    # matches the date seen by the project team on the server.
    return datetime.now().astimezone()


def _now() -> str:
    return _now_dt().isoformat(timespec="seconds")


def _hash_secret(value: str, salt: bytes | None = None) -> tuple[str, str]:
    if salt is None:
        salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", value.encode("utf-8"), salt, PASSKEY_ROUNDS)
    return salt.hex(), digest.hex()


def _verify_secret(value: str, salt_hex: str, digest_hex: str) -> bool:
    salt = bytes.fromhex(salt_hex)
    _, candidate = _hash_secret(value, salt)
    return hmac.compare_digest(candidate, digest_hex)


def _token_hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _random_passkey() -> str:
    return secrets.token_urlsafe(14)


def _safe_name(name: str) -> str:
    name = Path(name).name.strip().replace("\x00", "")
    name = BAD_NAME_CHARS.sub("_", name)
    name = re.sub(r"\s+", " ", name).strip(" .")
    if not name:
        name = "unnamed_file"
    if len(name) > 180:
        stem = Path(name).stem[:140]
        suffix = Path(name).suffix[:20]
        name = stem + suffix
    return name


def _validate_extension(filename: str) -> str:
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise ValueError(
            f"File type {ext or '(no extension)'} is not enabled for the Arkavathi repository"
        )
    return ext


def _require_company(user: AuthUser) -> None:
    if user.organization_type != "COMPANY":
        raise PermissionError("Nakshatech company login required")


def _require_company_admin(user: AuthUser) -> None:
    if user.organization_type != "COMPANY" or user.role != "COMPANY_ADMIN":
        raise PermissionError("Nakshatech Company Admin access required")


def _require_department_user(user: AuthUser) -> None:
    if user.organization_type != "COMPANY" or user.role not in {"COMPANY_ADMIN", "COMPANY_DEPARTMENT_USER"}:
        raise PermissionError("Department Data Hub access required")


def ensure_repository_schema() -> dict[str, Any]:
    created_passkeys: dict[str, str] = {}
    REPOSITORY_ROOT.mkdir(parents=True, exist_ok=True)
    TEMP_ROOT.mkdir(parents=True, exist_ok=True)
    EXPORT_ROOT.mkdir(parents=True, exist_ok=True)
    with connect() as db:
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS project_departments (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                code TEXT NOT NULL UNIQUE,
                active INTEGER NOT NULL DEFAULT 1,
                passkey_salt TEXT NOT NULL,
                passkey_hash TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS department_unlocks (
                token_hash TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                department_id TEXT NOT NULL REFERENCES project_departments(id),
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                last_seen_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS repository_batches (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                public_id TEXT UNIQUE,
                department_id TEXT NOT NULL REFERENCES project_departments(id),
                data_date TEXT NOT NULL,
                category TEXT NOT NULL,
                description TEXT,
                remarks TEXT,
                uploader_label TEXT,
                status TEXT NOT NULL CHECK(status IN ('DRAFT','UPLOADING','COMPLETE')),
                created_by INTEGER NOT NULL REFERENCES users(id),
                created_at TEXT NOT NULL,
                completed_at TEXT,
                total_files INTEGER NOT NULL DEFAULT 0,
                total_bytes INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS repository_upload_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                public_id TEXT NOT NULL UNIQUE,
                batch_id INTEGER NOT NULL REFERENCES repository_batches(id) ON DELETE CASCADE,
                department_id TEXT NOT NULL REFERENCES project_departments(id),
                original_name TEXT NOT NULL,
                safe_name TEXT NOT NULL,
                extension TEXT NOT NULL,
                content_type TEXT,
                expected_size INTEGER NOT NULL,
                received_bytes INTEGER NOT NULL DEFAULT 0,
                temp_path TEXT NOT NULL,
                status TEXT NOT NULL CHECK(status IN ('UPLOADING','COMPLETE','FAILED')),
                created_by INTEGER NOT NULL REFERENCES users(id),
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS repository_files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                public_id TEXT NOT NULL UNIQUE,
                batch_id INTEGER NOT NULL REFERENCES repository_batches(id) ON DELETE CASCADE,
                department_id TEXT NOT NULL REFERENCES project_departments(id),
                original_name TEXT NOT NULL,
                stored_name TEXT NOT NULL,
                relative_path TEXT NOT NULL,
                extension TEXT NOT NULL,
                content_type TEXT,
                size_bytes INTEGER NOT NULL,
                sha256 TEXT NOT NULL,
                logical_key TEXT NOT NULL,
                version_no INTEGER NOT NULL DEFAULT 1,
                duplicate_of TEXT,
                uploaded_by INTEGER NOT NULL REFERENCES users(id),
                uploaded_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS repository_audit (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER REFERENCES users(id),
                department_id TEXT,
                action TEXT NOT NULL,
                batch_public_id TEXT,
                file_public_id TEXT,
                details_json TEXT,
                occurred_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_repo_batch_dept_time ON repository_batches(department_id,created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_repo_batch_data_date ON repository_batches(data_date);
            CREATE INDEX IF NOT EXISTS idx_repo_file_batch ON repository_files(batch_id);
            CREATE INDEX IF NOT EXISTS idx_repo_file_sha ON repository_files(sha256);
            CREATE INDEX IF NOT EXISTS idx_repo_file_ext ON repository_files(extension);
            CREATE INDEX IF NOT EXISTS idx_repo_audit_time ON repository_audit(occurred_at DESC);
            """
        )
        # V1.7.1: old V1.7 unlock tokens were browser-session unlocks.
        # Upgrade them to purpose-bound grants. Existing tokens are invalidated once
        # during migration so a fresh passkey is required under the new policy.
        unlock_columns = {row["name"] for row in db.execute("PRAGMA table_info(department_unlocks)").fetchall()}
        upgraded_unlock_schema = False
        if "purpose" not in unlock_columns:
            db.execute("ALTER TABLE department_unlocks ADD COLUMN purpose TEXT NOT NULL DEFAULT 'BROWSE'")
            upgraded_unlock_schema = True
        if "batch_public_id" not in unlock_columns:
            db.execute("ALTER TABLE department_unlocks ADD COLUMN batch_public_id TEXT")
            upgraded_unlock_schema = True
        if upgraded_unlock_schema:
            db.execute("DELETE FROM department_unlocks")

        now = _now()
        for dep_id, name, code in DEPARTMENTS:
            row = db.execute("SELECT id FROM project_departments WHERE id=?", (dep_id,)).fetchone()
            if row:
                db.execute(
                    "UPDATE project_departments SET name=?,code=?,active=1,updated_at=? WHERE id=?",
                    (name, code, now, dep_id),
                )
            else:
                raw = _random_passkey()
                salt, digest = _hash_secret(raw)
                db.execute(
                    """
                    INSERT INTO project_departments(id,name,code,active,passkey_salt,passkey_hash,created_at,updated_at)
                    VALUES(?,?,?,1,?,?,?,?)
                    """,
                    (dep_id, name, code, salt, digest, now, now),
                )
                created_passkeys[dep_id] = raw
        db.execute("DELETE FROM department_unlocks WHERE expires_at<=?", (_now(),))
        db.commit()
    return {"created_passkeys": created_passkeys, "credentials_path": str(PASSKEYS_PATH)}


def _audit(
    db: sqlite3.Connection,
    user: AuthUser,
    action: str,
    *,
    department_id: str | None = None,
    batch_public_id: str | None = None,
    file_public_id: str | None = None,
    details: dict[str, Any] | None = None,
) -> None:
    db.execute(
        """
        INSERT INTO repository_audit(user_id,department_id,action,batch_public_id,file_public_id,details_json,occurred_at)
        VALUES(?,?,?,?,?,?,?)
        """,
        (
            user.id,
            department_id,
            action,
            batch_public_id,
            file_public_id,
            json.dumps(details or {}, ensure_ascii=False, separators=(",", ":")),
            _now(),
        ),
    )


def _department_row(db: sqlite3.Connection, department_id: str) -> sqlite3.Row:
    row = db.execute(
        "SELECT id,name,code,active,passkey_salt,passkey_hash FROM project_departments WHERE id=? AND active=1",
        (department_id.strip().upper(),),
    ).fetchone()
    if not row:
        raise LookupError("Department not found")
    return row


def departments_for_user(user: AuthUser) -> list[dict[str, Any]]:
    ensure_repository_schema()
    _require_company(user)
    with connect() as db:
        rows = db.execute(
            """
            SELECT d.id,d.name,d.code,
                   COUNT(DISTINCT b.id) AS total_batches,
                   COUNT(f.id) AS total_files,
                   COALESCE(SUM(f.size_bytes),0) AS total_bytes,
                   MAX(b.created_at) AS last_upload_at,
                   COUNT(DISTINCT CASE WHEN substr(b.created_at,1,10)=substr(?,1,10) THEN b.id END) AS today_batches
            FROM project_departments d
            LEFT JOIN repository_batches b ON b.department_id=d.id AND b.status='COMPLETE'
            LEFT JOIN repository_files f ON f.batch_id=b.id
            WHERE d.active=1
            GROUP BY d.id,d.name,d.code
            ORDER BY CASE d.id WHEN 'CIVIL' THEN 1 WHEN 'GIS' THEN 2 WHEN 'SURVEY' THEN 3 WHEN 'LIDAR' THEN 4 ELSE 5 END
            """,
            (_now(),),
        ).fetchall()
    result = []
    for row in rows:
        item = dict(row)
        # The batch count is inflated by file joins unless counted DISTINCT, already handled above.
        item["today_batches"] = int(item.get("today_batches") or 0)
        item["can_view_all"] = user.role == "COMPANY_ADMIN"
        item["requires_passkey_to_upload"] = True
        if user.role != "COMPANY_ADMIN":
            item["total_batches"] = 0
            item["total_files"] = 0
            item["total_bytes"] = 0
            item["today_batches"] = 0
            item["last_upload_at"] = None
        result.append(item)
    return result


def unlock_department(user: AuthUser, department_id: str, passkey: str, purpose: str = "BROWSE") -> dict[str, Any]:
    """Verify a department passkey and issue a purpose-bound grant.

    BROWSE grants are for department-scoped history/download access. UPLOAD grants
    may create exactly one new batch; once a batch is created, the grant is bound
    to that batch and cannot be reused to start another upload.
    """
    ensure_repository_schema()
    _require_department_user(user)
    if not passkey:
        raise ValueError("Department passkey is required")
    purpose = purpose.strip().upper() or "BROWSE"
    if purpose not in {"BROWSE", "UPLOAD"}:
        raise ValueError("purpose must be BROWSE or UPLOAD")
    with connect() as db:
        dep = _department_row(db, department_id)
        if not _verify_secret(passkey, dep["passkey_salt"], dep["passkey_hash"]):
            _audit(db, user, "DEPARTMENT_PASSKEY_FAILED", department_id=dep["id"], details={"purpose": purpose})
            db.commit()
            raise PermissionError("Invalid department passkey")
        raw = secrets.token_urlsafe(36)
        created = _now_dt()
        hours = UPLOAD_GRANT_HOURS if purpose == "UPLOAD" else BROWSE_GRANT_HOURS
        expires = created + timedelta(hours=hours)
        db.execute(
            """
            INSERT INTO department_unlocks(token_hash,user_id,department_id,created_at,expires_at,last_seen_at,purpose,batch_public_id)
            VALUES(?,?,?,?,?,?,?,NULL)
            """,
            (_token_hash(raw), user.id, dep["id"], created.isoformat(timespec="seconds"), expires.isoformat(timespec="seconds"), created.isoformat(timespec="seconds"), purpose),
        )
        _audit(db, user, "DEPARTMENT_PASSKEY_VERIFIED", department_id=dep["id"], details={"purpose": purpose})
        db.commit()
        return {
            "token": raw,
            "expires_at": expires.isoformat(timespec="seconds"),
            "purpose": purpose,
            "batch_public_id": None,
            "department": {"id": dep["id"], "name": dep["name"], "code": dep["code"]},
        }


def department_from_token(
    user: AuthUser,
    raw_token: str | None,
    *,
    purpose: str | None = None,
    batch_public_id: str | None = None,
    require_unbound: bool = False,
) -> dict[str, str | None]:
    ensure_repository_schema()
    _require_department_user(user)
    if not raw_token:
        raise PermissionError("Department passkey verification is required")
    with connect() as db:
        row = db.execute(
            """
            SELECT u.department_id,d.name,d.code,u.expires_at,u.purpose,u.batch_public_id
            FROM department_unlocks u JOIN project_departments d ON d.id=u.department_id
            WHERE u.token_hash=? AND u.user_id=? AND u.expires_at>?
            """,
            (_token_hash(raw_token), user.id, _now()),
        ).fetchone()
        if not row:
            raise PermissionError("Department passkey grant expired or is invalid")
        if purpose and row["purpose"] != purpose.upper():
            raise PermissionError(f"A {purpose.lower()} passkey verification is required for this action")
        if require_unbound and row["batch_public_id"]:
            raise PermissionError("This passkey verification has already started one upload batch. Enter the department passkey again for a new upload.")
        if batch_public_id is not None and row["batch_public_id"] != batch_public_id:
            raise PermissionError("This passkey verification belongs to a different upload batch. Enter the department passkey again.")
        db.execute(
            "UPDATE department_unlocks SET last_seen_at=? WHERE token_hash=?",
            (_now(), _token_hash(raw_token)),
        )
        db.commit()
        return {
            "id": row["department_id"],
            "name": row["name"],
            "code": row["code"],
            "expires_at": row["expires_at"],
            "purpose": row["purpose"],
            "batch_public_id": row["batch_public_id"],
        }


def rotate_department_passkey(user: AuthUser, department_id: str) -> dict[str, str]:
    ensure_repository_schema()
    _require_company_admin(user)
    raw = _random_passkey()
    salt, digest = _hash_secret(raw)
    with connect() as db:
        dep = _department_row(db, department_id)
        db.execute(
            "UPDATE project_departments SET passkey_salt=?,passkey_hash=?,updated_at=? WHERE id=?",
            (salt, digest, _now(), dep["id"]),
        )
        db.execute("DELETE FROM department_unlocks WHERE department_id=?", (dep["id"],))
        _audit(db, user, "DEPARTMENT_PASSKEY_ROTATED", department_id=dep["id"])
        db.commit()
    return {"department_id": dep["id"], "department_name": dep["name"], "passkey": raw}


def _valid_data_date(value: str) -> str:
    value = value.strip()
    if not DATA_DATE_RE.fullmatch(value):
        raise ValueError("data_date must be YYYY-MM-DD")
    try:
        datetime.strptime(value, "%Y-%m-%d")
    except ValueError as exc:
        raise ValueError("data_date is not a valid date") from exc
    return value


def create_batch(
    user: AuthUser,
    department_token: str,
    *,
    data_date: str,
    category: str,
    description: str = "",
    remarks: str = "",
    uploader_label: str = "",
) -> dict[str, Any]:
    ensure_repository_schema()
    dep = department_from_token(user, department_token, purpose="UPLOAD", require_unbound=True)
    data_date = _valid_data_date(data_date)
    category = category.strip()[:120]
    if not category:
        raise ValueError("Category is required")
    now = _now()
    with connect() as db:
        cur = db.execute(
            """
            INSERT INTO repository_batches(department_id,data_date,category,description,remarks,uploader_label,status,created_by,created_at)
            VALUES(?,?,?,?,?,?,'DRAFT',?,?)
            """,
            (
                dep["id"], data_date, category,
                description.strip()[:3000], remarks.strip()[:3000], uploader_label.strip()[:120],
                user.id, now,
            ),
        )
        row_id = int(cur.lastrowid)
        date_compact = now[:10].replace("-", "")
        public_id = f"{dep['code']}-{date_compact}-{row_id:05d}"
        db.execute("UPDATE repository_batches SET public_id=? WHERE id=?", (public_id, row_id))
        updated = db.execute(
            "UPDATE department_unlocks SET batch_public_id=?,last_seen_at=? WHERE token_hash=? AND user_id=? AND purpose='UPLOAD' AND batch_public_id IS NULL",
            (public_id, now, _token_hash(department_token), user.id),
        ).rowcount
        if updated != 1:
            raise PermissionError("Upload passkey verification could not be bound to this batch. Enter the department passkey again.")
        _audit(db, user, "BATCH_CREATED", department_id=dep["id"], batch_public_id=public_id)
        db.commit()
        row = db.execute(_batch_query() + " WHERE b.id=?", (row_id,)).fetchone()
        return _row_to_batch(db, row, include_files=True)


def _batch_query() -> str:
    return """
        SELECT b.*,d.name AS department_name,d.code AS department_code,u.display_name AS created_by_name,u.email AS created_by_email
        FROM repository_batches b
        JOIN project_departments d ON d.id=b.department_id
        JOIN users u ON u.id=b.created_by
    """


def _files_for_batch(db: sqlite3.Connection, batch_id: int) -> list[dict[str, Any]]:
    rows = db.execute(
        """
        SELECT f.public_id,f.original_name,f.extension,f.content_type,f.size_bytes,f.sha256,f.version_no,
               f.duplicate_of,f.uploaded_at,u.display_name AS uploaded_by_name
        FROM repository_files f JOIN users u ON u.id=f.uploaded_by
        WHERE f.batch_id=? ORDER BY f.id
        """,
        (batch_id,),
    ).fetchall()
    return [dict(row) for row in rows]


def _row_to_batch(db: sqlite3.Connection, row: sqlite3.Row, *, include_files: bool = True) -> dict[str, Any]:
    result = {
        "public_id": row["public_id"],
        "department_id": row["department_id"],
        "department_name": row["department_name"],
        "department_code": row["department_code"],
        "data_date": row["data_date"],
        "category": row["category"],
        "description": row["description"] or "",
        "remarks": row["remarks"] or "",
        "uploader_label": row["uploader_label"] or "",
        "status": row["status"],
        "created_by": row["created_by"],
        "created_by_name": row["created_by_name"],
        "created_by_email": row["created_by_email"],
        "created_at": row["created_at"],
        "completed_at": row["completed_at"],
        "total_files": int(row["total_files"] or 0),
        "total_bytes": int(row["total_bytes"] or 0),
    }
    if include_files:
        result["files"] = _files_for_batch(db, int(row["id"]))
    return result


def _filters_sql(filters: dict[str, str | None]) -> tuple[list[str], list[Any], str]:
    where: list[str] = ["b.status='COMPLETE'"]
    params: list[Any] = []
    department_id = (filters.get("department_id") or "").strip().upper()
    if department_id:
        where.append("b.department_id=?")
        params.append(department_id)
    date_from = (filters.get("date_from") or "").strip()
    if date_from:
        where.append("substr(b.created_at,1,10)>=?")
        params.append(date_from)
    date_to = (filters.get("date_to") or "").strip()
    if date_to:
        # Inclusive date filter using text ISO prefix semantics.
        where.append("substr(b.created_at,1,10)<=?")
        params.append(date_to)
    data_date_from = (filters.get("data_date_from") or "").strip()
    if data_date_from:
        where.append("b.data_date>=?")
        params.append(data_date_from)
    data_date_to = (filters.get("data_date_to") or "").strip()
    if data_date_to:
        where.append("b.data_date<=?")
        params.append(data_date_to)
    category = (filters.get("category") or "").strip()
    if category:
        where.append("b.category LIKE ?")
        params.append("%" + category + "%")
    search = (filters.get("search") or "").strip()
    if search:
        where.append("(b.public_id LIKE ? OR b.description LIKE ? OR b.remarks LIKE ? OR b.uploader_label LIKE ? OR u.display_name LIKE ?)")
        wildcard = "%" + search + "%"
        params.extend([wildcard] * 5)
    extension = (filters.get("extension") or "").strip().lower()
    if extension:
        if not extension.startswith("."):
            extension = "." + extension
        where.append("EXISTS (SELECT 1 FROM repository_files fx WHERE fx.batch_id=b.id AND fx.extension=?)")
        params.append(extension)
    order = (filters.get("order") or "latest").strip().lower()
    order_sql = "ASC" if order == "oldest" else "DESC"
    return where, params, order_sql


def list_company_batches(user: AuthUser, filters: dict[str, str | None]) -> list[dict[str, Any]]:
    ensure_repository_schema()
    _require_company_admin(user)
    where, params, order_sql = _filters_sql(filters)
    sql = _batch_query() + " WHERE " + " AND ".join(where) + f" ORDER BY b.created_at {order_sql},b.id {order_sql} LIMIT 1000"
    with connect() as db:
        return [_row_to_batch(db, row, include_files=True) for row in db.execute(sql, params).fetchall()]


def list_department_batches(user: AuthUser, department_token: str, filters: dict[str, str | None]) -> list[dict[str, Any]]:
    ensure_repository_schema()
    dep = department_from_token(user, department_token, purpose="BROWSE")
    safe_filters = dict(filters)
    safe_filters["department_id"] = dep["id"]
    where, params, order_sql = _filters_sql(safe_filters)
    sql = _batch_query() + " WHERE " + " AND ".join(where) + f" ORDER BY b.created_at {order_sql},b.id {order_sql} LIMIT 1000"
    with connect() as db:
        return [_row_to_batch(db, row, include_files=True) for row in db.execute(sql, params).fetchall()]


def company_repository_summary(user: AuthUser) -> dict[str, Any]:
    ensure_repository_schema()
    _require_company_admin(user)
    with connect() as db:
        row = db.execute(
            """
            SELECT COUNT(*) AS total_batches,
                   COALESCE(SUM(total_files),0) AS total_files,
                   COALESCE(SUM(total_bytes),0) AS total_bytes,
                   SUM(CASE WHEN substr(created_at,1,10)=substr(?,1,10) THEN 1 ELSE 0 END) AS today_batches
            FROM repository_batches WHERE status='COMPLETE'
            """,
            (_now(),),
        ).fetchone()
        today_files = db.execute(
            """
            SELECT COUNT(*) FROM repository_files WHERE substr(uploaded_at,1,10)=substr(?,1,10)
            """,
            (_now(),),
        ).fetchone()[0]
        return {
            "departments": len(DEPARTMENTS),
            "total_batches": int(row["total_batches"] or 0),
            "total_files": int(row["total_files"] or 0),
            "total_bytes": int(row["total_bytes"] or 0),
            "today_batches": int(row["today_batches"] or 0),
            "today_files": int(today_files or 0),
        }


def recent_activity(user: AuthUser, limit: int = 100) -> list[dict[str, Any]]:
    ensure_repository_schema()
    _require_company_admin(user)
    limit = max(1, min(int(limit), 500))
    with connect() as db:
        rows = db.execute(
            _batch_query() + " WHERE b.status='COMPLETE' ORDER BY b.created_at DESC,b.id DESC LIMIT ?",
            (limit,),
        ).fetchall()
        return [_row_to_batch(db, row, include_files=False) for row in rows]


def _batch_for_token(db: sqlite3.Connection, user: AuthUser, dep: dict[str, str], batch_public_id: str) -> sqlite3.Row:
    row = db.execute(_batch_query() + " WHERE b.public_id=?", (batch_public_id,)).fetchone()
    if not row or row["department_id"] != dep["id"]:
        raise LookupError("Batch not found in the unlocked department")
    if int(row["created_by"]) != user.id and user.role != "COMPANY_ADMIN":
        # Shared department uploader role can still continue batches it created in the same login.
        # Admin can recover any batch.
        raise PermissionError("This batch belongs to another company user")
    return row


def init_upload(
    user: AuthUser,
    department_token: str,
    batch_public_id: str,
    *,
    filename: str,
    size_bytes: int,
    content_type: str | None,
) -> dict[str, Any]:
    ensure_repository_schema()
    dep = department_from_token(user, department_token, purpose="UPLOAD", batch_public_id=batch_public_id)
    filename = Path(filename).name.strip()
    if not filename:
        raise ValueError("filename is required")
    ext = _validate_extension(filename)
    if size_bytes < 0:
        raise ValueError("size_bytes must be zero or greater")
    safe = _safe_name(filename)
    now = _now()
    with connect() as db:
        batch = _batch_for_token(db, user, dep, batch_public_id)
        if batch["status"] == "COMPLETE":
            raise ValueError("Completed batch cannot receive more files")
        existing = db.execute(
            """
            SELECT * FROM repository_upload_sessions
            WHERE batch_id=? AND original_name=? AND expected_size=? AND created_by=? AND status='UPLOADING'
            ORDER BY id DESC LIMIT 1
            """,
            (batch["id"], filename, int(size_bytes), user.id),
        ).fetchone()
        if existing:
            temp_path = Path(existing["temp_path"])
            actual = temp_path.stat().st_size if temp_path.exists() else 0
            if actual != int(existing["received_bytes"]):
                db.execute("UPDATE repository_upload_sessions SET received_bytes=?,updated_at=? WHERE id=?", (actual, now, existing["id"]))
                db.commit()
            return {
                "upload_id": existing["public_id"],
                "chunk_size": CHUNK_SIZE,
                "received_bytes": actual,
                "expected_size": int(existing["expected_size"]),
                "resumed": True,
            }
        upload_id = "UPL-" + uuid.uuid4().hex[:20].upper()
        temp_path = TEMP_ROOT / (upload_id + ".part")
        temp_path.parent.mkdir(parents=True, exist_ok=True)
        temp_path.touch(exist_ok=False)
        db.execute(
            """
            INSERT INTO repository_upload_sessions(public_id,batch_id,department_id,original_name,safe_name,extension,content_type,expected_size,received_bytes,temp_path,status,created_by,created_at,updated_at)
            VALUES(?,?,?,?,?,?,?,?,0,?,'UPLOADING',?,?,?)
            """,
            (upload_id, batch["id"], dep["id"], filename, safe, ext, content_type or "application/octet-stream", int(size_bytes), str(temp_path), user.id, now, now),
        )
        db.execute("UPDATE repository_batches SET status='UPLOADING' WHERE id=?", (batch["id"],))
        _audit(db, user, "FILE_UPLOAD_INITIALIZED", department_id=dep["id"], batch_public_id=batch_public_id, details={"filename": filename, "size_bytes": int(size_bytes), "upload_id": upload_id})
        db.commit()
        return {"upload_id": upload_id, "chunk_size": CHUNK_SIZE, "received_bytes": 0, "expected_size": int(size_bytes), "resumed": False}


def append_upload_chunk(
    user: AuthUser,
    department_token: str,
    upload_id: str,
    *,
    offset: int,
    content: bytes,
) -> dict[str, Any]:
    ensure_repository_schema()
    dep = department_from_token(user, department_token, purpose="UPLOAD")
    if len(content) > CHUNK_SIZE:
        raise ValueError(f"Chunk exceeds {CHUNK_SIZE} byte limit")
    with connect() as db:
        row = db.execute(
            """SELECT s.*,b.public_id AS batch_public_id
               FROM repository_upload_sessions s JOIN repository_batches b ON b.id=s.batch_id
               WHERE s.public_id=?""",
            (upload_id,),
        ).fetchone()
        if not row or row["department_id"] != dep["id"] or int(row["created_by"]) != user.id:
            raise LookupError("Upload session not found")
        if dep.get("batch_public_id") != row["batch_public_id"]:
            raise PermissionError("This upload passkey verification is not valid for this batch")
        if row["status"] != "UPLOADING":
            raise ValueError("Upload session is not active")
        expected_offset = int(row["received_bytes"])
        if int(offset) != expected_offset:
            return {"upload_id": upload_id, "received_bytes": expected_offset, "expected_size": int(row["expected_size"]), "offset_mismatch": True}
        if expected_offset + len(content) > int(row["expected_size"]):
            raise ValueError("Chunk exceeds expected file size")
        temp_path = Path(row["temp_path"])
        temp_path.parent.mkdir(parents=True, exist_ok=True)
        with temp_path.open("ab") as fh:
            fh.write(content)
            fh.flush()
        received = expected_offset + len(content)
        db.execute("UPDATE repository_upload_sessions SET received_bytes=?,updated_at=? WHERE id=?", (received, _now(), row["id"]))
        db.commit()
        return {"upload_id": upload_id, "received_bytes": received, "expected_size": int(row["expected_size"]), "offset_mismatch": False}


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        while True:
            chunk = fh.read(1024 * 1024)
            if not chunk:
                break
            digest.update(chunk)
    return digest.hexdigest()


def complete_upload(user: AuthUser, department_token: str, upload_id: str) -> dict[str, Any]:
    ensure_repository_schema()
    dep = department_from_token(user, department_token, purpose="UPLOAD")
    with connect() as db:
        row = db.execute(
            """
            SELECT s.*,b.public_id AS batch_public_id,b.data_date,b.id AS real_batch_id
            FROM repository_upload_sessions s JOIN repository_batches b ON b.id=s.batch_id
            WHERE s.public_id=?
            """,
            (upload_id,),
        ).fetchone()
        if not row or row["department_id"] != dep["id"] or int(row["created_by"]) != user.id:
            raise LookupError("Upload session not found")
        if dep.get("batch_public_id") != row["batch_public_id"]:
            raise PermissionError("This upload passkey verification is not valid for this batch")
        if row["status"] == "COMPLETE":
            existing = db.execute("SELECT * FROM repository_files WHERE batch_id=? AND original_name=? ORDER BY id DESC LIMIT 1", (row["batch_id"], row["original_name"])).fetchone()
            if existing:
                return dict(existing)
        if int(row["received_bytes"]) != int(row["expected_size"]):
            raise ValueError(f"Upload incomplete: {row['received_bytes']} of {row['expected_size']} bytes received")
        temp_path = Path(row["temp_path"])
        if not temp_path.exists() or temp_path.stat().st_size != int(row["expected_size"]):
            raise ValueError("Temporary upload file is incomplete")
        sha256 = _sha256_file(temp_path)
        logical_key = row["original_name"].strip().lower()
        version_no = int(db.execute(
            "SELECT COALESCE(MAX(version_no),0)+1 FROM repository_files WHERE department_id=? AND logical_key=?",
            (dep["id"], logical_key),
        ).fetchone()[0])
        duplicate = db.execute("SELECT public_id,department_id FROM repository_files WHERE sha256=? ORDER BY id LIMIT 1", (sha256,)).fetchone()
        file_public_id = "FILE-" + uuid.uuid4().hex[:20].upper()
        data_date = row["data_date"]
        yyyy, mm, dd = data_date.split("-")
        final_dir = REPOSITORY_ROOT / dep["id"] / yyyy / mm / dd / row["batch_public_id"]
        final_dir.mkdir(parents=True, exist_ok=True)
        stored_name = f"{file_public_id}__{row['safe_name']}"
        final_path = final_dir / stored_name
        os.replace(temp_path, final_path)
        relative_path = final_path.relative_to(REPOSITORY_ROOT).as_posix()
        uploaded_at = _now()
        db.execute(
            """
            INSERT INTO repository_files(public_id,batch_id,department_id,original_name,stored_name,relative_path,extension,content_type,size_bytes,sha256,logical_key,version_no,duplicate_of,uploaded_by,uploaded_at)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            (
                file_public_id, row["batch_id"], dep["id"], row["original_name"], stored_name, relative_path,
                row["extension"], row["content_type"], int(row["expected_size"]), sha256, logical_key, version_no,
                duplicate["public_id"] if duplicate else None, user.id, uploaded_at,
            ),
        )
        db.execute("UPDATE repository_upload_sessions SET status='COMPLETE',updated_at=? WHERE id=?", (uploaded_at, row["id"]))
        stats = db.execute("SELECT COUNT(*),COALESCE(SUM(size_bytes),0) FROM repository_files WHERE batch_id=?", (row["batch_id"],)).fetchone()
        db.execute("UPDATE repository_batches SET total_files=?,total_bytes=? WHERE id=?", (int(stats[0]), int(stats[1]), row["batch_id"]))
        _audit(
            db, user, "FILE_UPLOADED", department_id=dep["id"], batch_public_id=row["batch_public_id"], file_public_id=file_public_id,
            details={"filename": row["original_name"], "size_bytes": int(row["expected_size"]), "sha256": sha256, "version_no": version_no, "duplicate_of": duplicate["public_id"] if duplicate else None},
        )
        db.commit()
        return {
            "public_id": file_public_id,
            "original_name": row["original_name"],
            "extension": row["extension"],
            "content_type": row["content_type"],
            "size_bytes": int(row["expected_size"]),
            "sha256": sha256,
            "version_no": version_no,
            "duplicate_of": duplicate["public_id"] if duplicate else None,
            "duplicate_department": duplicate["department_id"] if duplicate else None,
            "uploaded_at": uploaded_at,
        }


def finalize_batch(user: AuthUser, department_token: str, batch_public_id: str) -> dict[str, Any]:
    ensure_repository_schema()
    dep = department_from_token(user, department_token, purpose="UPLOAD", batch_public_id=batch_public_id)
    with connect() as db:
        batch = _batch_for_token(db, user, dep, batch_public_id)
        active = int(db.execute("SELECT COUNT(*) FROM repository_upload_sessions WHERE batch_id=? AND status='UPLOADING'", (batch["id"],)).fetchone()[0])
        if active:
            raise ValueError(f"{active} file upload(s) are still incomplete")
        stats = db.execute("SELECT COUNT(*),COALESCE(SUM(size_bytes),0) FROM repository_files WHERE batch_id=?", (batch["id"],)).fetchone()
        if int(stats[0]) == 0:
            raise ValueError("Upload at least one file before completing the batch")
        now = _now()
        db.execute("UPDATE repository_batches SET status='COMPLETE',completed_at=?,total_files=?,total_bytes=? WHERE id=?", (now, int(stats[0]), int(stats[1]), batch["id"]))
        _audit(db, user, "BATCH_COMPLETED", department_id=dep["id"], batch_public_id=batch_public_id, details={"files": int(stats[0]), "bytes": int(stats[1])})
        db.commit()
        row = db.execute(_batch_query() + " WHERE b.id=?", (batch["id"],)).fetchone()
        return _row_to_batch(db, row, include_files=True)


def _permission_for_department_read(user: AuthUser, department_id: str, department_token: str | None) -> None:
    if user.organization_type != "COMPANY":
        raise PermissionError("Nakshatech company login required")
    if user.role == "COMPANY_ADMIN":
        return
    dep = department_from_token(user, department_token, purpose="BROWSE")
    if dep["id"] != department_id:
        raise PermissionError("Unlocked department does not match this data")


def file_for_download(user: AuthUser, file_public_id: str, department_token: str | None) -> tuple[dict[str, Any], Path]:
    ensure_repository_schema()
    with connect() as db:
        row = db.execute(
            """
            SELECT f.*,b.public_id AS batch_public_id FROM repository_files f JOIN repository_batches b ON b.id=f.batch_id
            WHERE f.public_id=?
            """,
            (file_public_id,),
        ).fetchone()
        if not row:
            raise LookupError("Repository file not found")
        _permission_for_department_read(user, row["department_id"], department_token)
        path = REPOSITORY_ROOT / row["relative_path"]
        if not path.is_file():
            raise FileNotFoundError("Repository file is missing on disk")
        _audit(db, user, "FILE_DOWNLOADED", department_id=row["department_id"], batch_public_id=row["batch_public_id"], file_public_id=row["public_id"])
        db.commit()
        return dict(row), path


def _safe_zip_arc(value: str) -> str:
    return _safe_name(value).replace("\\", "_").replace("/", "_")


def _zip_rows(rows: list[sqlite3.Row], output_path: Path, root_label: str) -> Path:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    tmp = output_path.with_suffix(output_path.suffix + ".tmp")
    if tmp.exists():
        tmp.unlink()
    with zipfile.ZipFile(tmp, "w", compression=zipfile.ZIP_STORED, allowZip64=True) as zf:
        manifest: list[dict[str, Any]] = []
        for row in rows:
            path = REPOSITORY_ROOT / row["relative_path"]
            if not path.is_file():
                continue
            arc = "/".join([
                root_label,
                row["department_id"],
                row["data_date"],
                row["batch_public_id"],
                f"{row['public_id']}__{_safe_zip_arc(row['original_name'])}",
            ])
            zf.write(path, arcname=arc)
            manifest.append({
                "department": row["department_id"],
                "batch": row["batch_public_id"],
                "data_date": row["data_date"],
                "file_id": row["public_id"],
                "original_name": row["original_name"],
                "size_bytes": int(row["size_bytes"]),
                "sha256": row["sha256"],
                "uploaded_at": row["uploaded_at"],
            })
        zf.writestr(root_label + "/MANIFEST.json", json.dumps(manifest, indent=2, ensure_ascii=False))
    os.replace(tmp, output_path)
    return output_path


def batch_zip_for_download(user: AuthUser, batch_public_id: str, department_token: str | None) -> tuple[str, Path]:
    ensure_repository_schema()
    with connect() as db:
        batch = db.execute(_batch_query() + " WHERE b.public_id=? AND b.status='COMPLETE'", (batch_public_id,)).fetchone()
        if not batch:
            raise LookupError("Completed repository batch not found")
        _permission_for_department_read(user, batch["department_id"], department_token)
        rows = db.execute(
            """
            SELECT f.*,b.public_id AS batch_public_id,b.data_date FROM repository_files f JOIN repository_batches b ON b.id=f.batch_id
            WHERE b.id=? ORDER BY f.id
            """,
            (batch["id"],),
        ).fetchall()
        filename = _safe_name(batch_public_id + ".zip")
        output = EXPORT_ROOT / "batches" / filename
        if not output.is_file():
            _zip_rows(list(rows), output, batch_public_id)
        _audit(db, user, "BATCH_DOWNLOADED", department_id=batch["department_id"], batch_public_id=batch_public_id, details={"files": len(rows)})
        db.commit()
        return filename, output


def company_export_zip(user: AuthUser, filters: dict[str, str | None]) -> tuple[str, Path, dict[str, int]]:
    ensure_repository_schema()
    _require_company_admin(user)
    where, params, order_sql = _filters_sql(filters)
    sql = """
        SELECT f.*,b.public_id AS batch_public_id,b.data_date,b.created_at AS batch_created_at
        FROM repository_files f
        JOIN repository_batches b ON b.id=f.batch_id
        JOIN users u ON u.id=b.created_by
        WHERE """ + " AND ".join(where) + f" ORDER BY b.created_at {order_sql},f.id {order_sql}"
    with connect() as db:
        rows = list(db.execute(sql, params).fetchall())
        if not rows:
            raise ValueError("No repository files match the selected filters")
        fingerprint = hashlib.sha256((json.dumps(filters, sort_keys=True) + "|" + str(len(rows)) + "|" + str(rows[0]["public_id"]) + "|" + str(rows[-1]["public_id"])).encode("utf-8")).hexdigest()[:14]
        filename = f"ARKAVATHI_REPOSITORY_EXPORT_{_now()[:10].replace('-', '')}_{fingerprint}.zip"
        output = EXPORT_ROOT / "filtered" / filename
        if not output.is_file():
            _zip_rows(rows, output, "ARKAVATHI_PROJECT_EXPORT")
        total_bytes = sum(int(row["size_bytes"]) for row in rows)
        departments = len({row["department_id"] for row in rows})
        _audit(db, user, "FILTERED_EXPORT_DOWNLOADED", details={"files": len(rows), "bytes": total_bytes, "departments": departments, "filters": filters})
        db.commit()
        return filename, output, {"files": len(rows), "bytes": total_bytes, "departments": departments}


def repository_audit(user: AuthUser, limit: int = 200) -> list[dict[str, Any]]:
    ensure_repository_schema()
    _require_company_admin(user)
    limit = max(1, min(int(limit), 1000))
    with connect() as db:
        rows = db.execute(
            """
            SELECT a.id,a.department_id,a.action,a.batch_public_id,a.file_public_id,a.details_json,a.occurred_at,
                   u.display_name AS user_name,u.email AS user_email
            FROM repository_audit a LEFT JOIN users u ON u.id=a.user_id
            ORDER BY a.occurred_at DESC,a.id DESC LIMIT ?
            """,
            (limit,),
        ).fetchall()
    result = []
    for row in rows:
        item = dict(row)
        try:
            item["details"] = json.loads(item.pop("details_json") or "{}")
        except json.JSONDecodeError:
            item["details"] = {}
        result.append(item)
    return result


def department_export_zip(user: AuthUser, department_token: str, filters: dict[str, str | None]) -> tuple[str, Path, dict[str, int]]:
    ensure_repository_schema()
    dep = department_from_token(user, department_token, purpose="BROWSE")
    safe_filters = dict(filters)
    safe_filters["department_id"] = dep["id"]
    where, params, order_sql = _filters_sql(safe_filters)
    sql = """
        SELECT f.*,b.public_id AS batch_public_id,b.data_date,b.created_at AS batch_created_at
        FROM repository_files f
        JOIN repository_batches b ON b.id=f.batch_id
        JOIN users u ON u.id=b.created_by
        WHERE """ + " AND ".join(where) + f" ORDER BY b.created_at {order_sql},f.id {order_sql}"
    with connect() as db:
        rows = list(db.execute(sql, params).fetchall())
        if not rows:
            raise ValueError("No department files match the selected filters")
        fingerprint = hashlib.sha256((dep["id"] + "|" + json.dumps(safe_filters, sort_keys=True) + "|" + str(len(rows)) + "|" + str(rows[0]["public_id"]) + "|" + str(rows[-1]["public_id"])).encode("utf-8")).hexdigest()[:14]
        filename = f"ARKAVATHI_{dep['id']}_EXPORT_{_now()[:10].replace('-', '')}_{fingerprint}.zip"
        output = EXPORT_ROOT / "department" / filename
        if not output.is_file():
            _zip_rows(rows, output, f"ARKAVATHI_{dep['id']}_EXPORT")
        total_bytes = sum(int(row["size_bytes"]) for row in rows)
        _audit(db, user, "DEPARTMENT_EXPORT_DOWNLOADED", department_id=dep["id"], details={"files": len(rows), "bytes": total_bytes, "filters": safe_filters})
        db.commit()
        return filename, output, {"files": len(rows), "bytes": total_bytes, "departments": 1}
