from __future__ import annotations

import json
import math
import mimetypes
import re
import secrets
import sqlite3
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.auth_store import AuthUser, connect, iso, utc_now

STATUSES = {
    "OBSERVED_SITE",
    "RECORD_NOT_AVAILABLE",
    "VERIFICATION_REQUIRED",
    "VERIFIED",
}
DISCHARGE_STATUSES = {"YES", "NO", "UNKNOWN"}
CATEGORIES = {
    "UNKNOWN",
    "MANUFACTURING",
    "WAREHOUSE",
    "FOOD_PROCESSING",
    "TEXTILE",
    "CHEMICAL",
    "CONSTRUCTION_MATERIAL",
    "WORKSHOP",
    "UTILITY",
    "OTHER",
}

APP_DIR = Path(__file__).resolve().parent
TRACK_POINTS_FILE = APP_DIR / "data" / "track_points.geojson"
MEDIA_DIR = APP_DIR.parent / "runtime" / "industry_media"
MAX_EVIDENCE_BYTES = 10 * 1024 * 1024
TRACK_MATCH_THRESHOLD_M = 1500.0


def _now() -> str:
    return iso(utc_now())


def _public(prefix: str) -> str:
    return f"{prefix}-{secrets.token_hex(6).upper()}"


def _text(value: Any, max_len: int = 2000) -> str:
    return str(value or "").strip()[:max_len]


def _safe_float(value: Any, name: str, *, minimum: float | None = None, maximum: float | None = None) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{name} must be a valid number") from exc
    if not math.isfinite(number):
        raise ValueError(f"{name} must be finite")
    if minimum is not None and number < minimum:
        raise ValueError(f"{name} must be at least {minimum}")
    if maximum is not None and number > maximum:
        raise ValueError(f"{name} must be at most {maximum}")
    return number


def _distance_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius = 6371000.0
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2.0) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2.0) ** 2
    return 2.0 * radius * math.asin(min(1.0, math.sqrt(a)))


@lru_cache(maxsize=1)
def _survey_points() -> tuple[dict[str, Any], ...]:
    if not TRACK_POINTS_FILE.is_file():
        return ()
    try:
        payload = json.loads(TRACK_POINTS_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return ()
    rows: list[dict[str, Any]] = []
    for feature in payload.get("features", []):
        geometry = feature.get("geometry") or {}
        coords = geometry.get("coordinates") or []
        props = feature.get("properties") or {}
        if not isinstance(coords, list) or len(coords) < 2:
            continue
        try:
            lon = float(coords[0])
            lat = float(coords[1])
        except (TypeError, ValueError):
            continue
        rows.append({
            "lat": lat,
            "lon": lon,
            "day": props.get("day"),
            "flight_id": props.get("flight_id"),
            "clip": props.get("clip"),
            "source_workbook": props.get("source_workbook"),
            "point_id": props.get("point_id"),
        })
    return tuple(rows)


def _nearest_survey_point(lat: float, lon: float) -> dict[str, Any]:
    best: dict[str, Any] | None = None
    best_distance = float("inf")
    for row in _survey_points():
        distance = _distance_m(lat, lon, float(row["lat"]), float(row["lon"]))
        if distance < best_distance:
            best_distance = distance
            best = row
    if best is None:
        return {
            "survey_day": None,
            "flight_id": None,
            "flight_clip": None,
            "source_workbook": None,
            "nearest_track_point_id": None,
            "nearest_track_distance_m": None,
            "track_match": False,
        }
    matched = best_distance <= TRACK_MATCH_THRESHOLD_M
    return {
        "survey_day": int(best["day"]) if matched and best.get("day") is not None else None,
        "flight_id": str(best.get("flight_id") or "") if matched else None,
        "flight_clip": str(best.get("clip") or "") if matched else None,
        "source_workbook": str(best.get("source_workbook") or "") if matched else None,
        "nearest_track_point_id": str(best.get("point_id") or "") if matched else None,
        "nearest_track_distance_m": round(best_distance, 2),
        "track_match": matched,
    }


def _is_company_manager(user: AuthUser) -> bool:
    return user.organization_type == "COMPANY" and user.role in {
        "COMPANY_ADMIN",
        "COMPANY_PROJECT_MANAGER",
        "COMPANY_REVIEWER",
        "COMPANY_DATA_MANAGER",
        "COMPANY_GIS_REVIEWER",
        "COMPANY_SURVEY_REVIEWER",
        "COMPANY_CIVIL_REVIEWER",
    }


def _can_create(user: AuthUser) -> bool:
    return user.organization_type in {"COMPANY", "INSTITUTION"}


def _visible_sql(user: AuthUser, alias: str = "io") -> tuple[str, list[Any]]:
    if user.organization_type in {"COMPANY", "CNNL"}:
        return "1=1", []
    return f"{alias}.organization_id=?", [user.organization_id]


def _can_edit(user: AuthUser, row: sqlite3.Row) -> bool:
    if user.organization_type == "COMPANY":
        return True
    return user.organization_type == "INSTITUTION" and row["organization_id"] == user.organization_id


def ensure_industry_intelligence_schema() -> None:
    MEDIA_DIR.mkdir(parents=True, exist_ok=True)
    with connect() as db:
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS industry_observations(
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                public_id TEXT NOT NULL UNIQUE,
                organization_id TEXT NOT NULL,
                name TEXT NOT NULL DEFAULT '',
                category TEXT NOT NULL DEFAULT 'UNKNOWN',
                latitude REAL NOT NULL,
                longitude REAL NOT NULL,
                video_name TEXT NOT NULL DEFAULT '',
                srt_name TEXT NOT NULL DEFAULT '',
                video_time_seconds REAL NOT NULL DEFAULT 0,
                heading REAL,
                status TEXT NOT NULL DEFAULT 'OBSERVED_SITE',
                discharge_status TEXT NOT NULL DEFAULT 'UNKNOWN',
                discharge_notes TEXT NOT NULL DEFAULT '',
                notes TEXT NOT NULL DEFAULT '',
                registration_reference TEXT NOT NULL DEFAULT '',
                survey_day INTEGER,
                flight_id TEXT,
                flight_clip TEXT,
                source_workbook TEXT,
                nearest_track_point_id TEXT,
                nearest_track_distance_m REAL,
                track_match INTEGER NOT NULL DEFAULT 0,
                created_by INTEGER NOT NULL,
                updated_by INTEGER NOT NULL,
                verified_by INTEGER,
                verified_at TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(organization_id) REFERENCES organizations(id),
                FOREIGN KEY(created_by) REFERENCES users(id),
                FOREIGN KEY(updated_by) REFERENCES users(id),
                FOREIGN KEY(verified_by) REFERENCES users(id)
            );
            CREATE INDEX IF NOT EXISTS idx_industry_observations_status ON industry_observations(status);
            CREATE INDEX IF NOT EXISTS idx_industry_observations_org ON industry_observations(organization_id);
            CREATE INDEX IF NOT EXISTS idx_industry_observations_day ON industry_observations(survey_day);
            CREATE INDEX IF NOT EXISTS idx_industry_observations_coords ON industry_observations(latitude,longitude);

            CREATE TABLE IF NOT EXISTS industry_evidence(
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                public_id TEXT NOT NULL UNIQUE,
                observation_id INTEGER NOT NULL,
                original_name TEXT NOT NULL,
                content_type TEXT NOT NULL,
                size_bytes INTEGER NOT NULL,
                storage_name TEXT NOT NULL UNIQUE,
                uploaded_by INTEGER NOT NULL,
                uploaded_at TEXT NOT NULL,
                FOREIGN KEY(observation_id) REFERENCES industry_observations(id) ON DELETE CASCADE,
                FOREIGN KEY(uploaded_by) REFERENCES users(id)
            );
            CREATE INDEX IF NOT EXISTS idx_industry_evidence_observation ON industry_evidence(observation_id);

            CREATE TABLE IF NOT EXISTS industry_observation_audit(
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                actor_id INTEGER NOT NULL,
                action TEXT NOT NULL,
                observation_ref TEXT NOT NULL,
                details_json TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL,
                FOREIGN KEY(actor_id) REFERENCES users(id)
            );
            """
        )
        db.commit()


def _audit(db: sqlite3.Connection, user: AuthUser, action: str, observation_ref: str, details: dict[str, Any] | None = None) -> None:
    db.execute(
        "INSERT INTO industry_observation_audit(actor_id,action,observation_ref,details_json,created_at) VALUES(?,?,?,?,?)",
        (user.id, action[:80], observation_ref[:160], json.dumps(details or {}, separators=(",", ":")), _now()),
    )


def _evidence_rows(db: sqlite3.Connection, observation_id: int) -> list[dict[str, Any]]:
    rows = db.execute(
        "SELECT * FROM industry_evidence WHERE observation_id=? ORDER BY uploaded_at DESC,id DESC",
        (observation_id,),
    ).fetchall()
    return [
        {
            "public_id": row["public_id"],
            "original_name": row["original_name"],
            "content_type": row["content_type"],
            "size_bytes": row["size_bytes"],
            "uploaded_at": row["uploaded_at"],
            "url": f"/api/v1/industry-intelligence/evidence/{row['public_id']}",
        }
        for row in rows
    ]


def _row_public(db: sqlite3.Connection, row: sqlite3.Row) -> dict[str, Any]:
    return {
        "public_id": row["public_id"],
        "organization_id": row["organization_id"],
        "organization_name": row["organization_name"],
        "name": row["name"],
        "category": row["category"],
        "latitude": row["latitude"],
        "longitude": row["longitude"],
        "video_name": row["video_name"],
        "srt_name": row["srt_name"],
        "video_time_seconds": row["video_time_seconds"],
        "heading": row["heading"],
        "status": row["status"],
        "discharge_status": row["discharge_status"],
        "discharge_notes": row["discharge_notes"],
        "notes": row["notes"],
        "registration_reference": row["registration_reference"],
        "survey_day": row["survey_day"],
        "flight_id": row["flight_id"],
        "flight_clip": row["flight_clip"],
        "source_workbook": row["source_workbook"],
        "nearest_track_point_id": row["nearest_track_point_id"],
        "nearest_track_distance_m": row["nearest_track_distance_m"],
        "track_match": bool(row["track_match"]),
        "created_by": row["created_by"],
        "created_by_name": row["created_by_name"],
        "updated_by": row["updated_by"],
        "updated_by_name": row["updated_by_name"],
        "verified_by": row["verified_by"],
        "verified_by_name": row["verified_by_name"],
        "verified_at": row["verified_at"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "evidence": _evidence_rows(db, int(row["id"])),
    }


def _select_sql() -> str:
    return """
        SELECT io.*,
               o.name AS organization_name,
               cu.display_name AS created_by_name,
               uu.display_name AS updated_by_name,
               vu.display_name AS verified_by_name
        FROM industry_observations io
        JOIN organizations o ON o.id=io.organization_id
        JOIN users cu ON cu.id=io.created_by
        JOIN users uu ON uu.id=io.updated_by
        LEFT JOIN users vu ON vu.id=io.verified_by
    """


def _get_row(db: sqlite3.Connection, user: AuthUser, public_id: str) -> sqlite3.Row:
    visible, params = _visible_sql(user)
    row = db.execute(
        _select_sql() + f" WHERE io.public_id=? AND {visible}",
        [public_id, *params],
    ).fetchone()
    if not row:
        raise LookupError("Industry observation not found")
    return row


def create_industry_observation(user: AuthUser, payload: dict[str, Any]) -> dict[str, Any]:
    if not _can_create(user):
        raise PermissionError("This account has read-only access to industry observations")
    lat = _safe_float(payload.get("latitude"), "latitude", minimum=-90, maximum=90)
    lon = _safe_float(payload.get("longitude"), "longitude", minimum=-180, maximum=180)
    category = _text(payload.get("category") or "UNKNOWN", 50).upper()
    if category not in CATEGORIES:
        raise ValueError("Unsupported industry category")
    discharge_status = _text(payload.get("discharge_status") or "UNKNOWN", 20).upper()
    if discharge_status not in DISCHARGE_STATUSES:
        raise ValueError("discharge_status must be YES, NO or UNKNOWN")
    status = _text(payload.get("status") or "OBSERVED_SITE", 40).upper()
    if status not in STATUSES:
        raise ValueError("Unsupported industry observation status")
    if status == "VERIFIED" and not _is_company_manager(user):
        raise PermissionError("Only Nakshatech reviewers can mark an observation as verified")
    heading_raw = payload.get("heading")
    heading = None if heading_raw in {None, ""} else _safe_float(heading_raw, "heading") % 360.0
    video_time = _safe_float(payload.get("video_time_seconds", 0), "video_time_seconds", minimum=0)
    match = _nearest_survey_point(lat, lon)
    now = _now()
    public_id = _public("IND")
    verified_by = user.id if status == "VERIFIED" else None
    verified_at = now if status == "VERIFIED" else None
    with connect() as db:
        db.execute(
            """
            INSERT INTO industry_observations(
                public_id,organization_id,name,category,latitude,longitude,video_name,srt_name,
                video_time_seconds,heading,status,discharge_status,discharge_notes,notes,
                registration_reference,survey_day,flight_id,flight_clip,source_workbook,
                nearest_track_point_id,nearest_track_distance_m,track_match,created_by,updated_by,
                verified_by,verified_at,created_at,updated_at
            ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            (
                public_id, user.organization_id, _text(payload.get("name"), 200), category, lat, lon,
                _text(payload.get("video_name"), 260), _text(payload.get("srt_name"), 260), video_time,
                heading, status, discharge_status, _text(payload.get("discharge_notes"), 2000),
                _text(payload.get("notes"), 4000), _text(payload.get("registration_reference"), 300),
                match["survey_day"], match["flight_id"], match["flight_clip"], match["source_workbook"],
                match["nearest_track_point_id"], match["nearest_track_distance_m"], int(match["track_match"]),
                user.id, user.id, verified_by, verified_at, now, now,
            ),
        )
        _audit(db, user, "CREATE", public_id, {"source": "VIDEO_SRT", "track_match": match["track_match"]})
        db.commit()
        return _row_public(db, _get_row(db, user, public_id))


def list_industry_observations(
    user: AuthUser,
    *,
    status: str | None = None,
    discharge_status: str | None = None,
    day: int | None = None,
    search: str | None = None,
    limit: int = 1000,
) -> list[dict[str, Any]]:
    visible, params = _visible_sql(user)
    clauses = [visible]
    if status:
        normalized = status.strip().upper()
        if normalized not in STATUSES:
            raise ValueError("Unsupported industry observation status")
        clauses.append("io.status=?")
        params.append(normalized)
    if discharge_status:
        normalized_discharge = discharge_status.strip().upper()
        if normalized_discharge not in DISCHARGE_STATUSES:
            raise ValueError("Unsupported discharge status")
        clauses.append("io.discharge_status=?")
        params.append(normalized_discharge)
    if day is not None:
        clauses.append("io.survey_day=?")
        params.append(int(day))
    if search:
        term = f"%{search.strip()}%"
        clauses.append("(io.public_id LIKE ? OR io.name LIKE ? OR io.video_name LIKE ? OR io.srt_name LIKE ? OR io.notes LIKE ?)")
        params.extend([term, term, term, term, term])
    safe_limit = max(1, min(int(limit), 5000))
    with connect() as db:
        rows = db.execute(
            _select_sql() + " WHERE " + " AND ".join(clauses) + " ORDER BY io.created_at DESC, io.id DESC LIMIT ?",
            [*params, safe_limit],
        ).fetchall()
        return [_row_public(db, row) for row in rows]


def get_industry_observation(user: AuthUser, public_id: str) -> dict[str, Any]:
    with connect() as db:
        return _row_public(db, _get_row(db, user, public_id))


def industry_intelligence_summary(user: AuthUser) -> dict[str, Any]:
    visible, params = _visible_sql(user)
    with connect() as db:
        rows = db.execute(
            f"SELECT status,discharge_status,survey_day,COUNT(*) AS n FROM industry_observations io WHERE {visible} GROUP BY status,discharge_status,survey_day",
            params,
        ).fetchall()
        evidence_count = db.execute(
            f"SELECT COUNT(DISTINCT ie.observation_id) AS n FROM industry_evidence ie JOIN industry_observations io ON io.id=ie.observation_id WHERE {visible}",
            params,
        ).fetchone()["n"]
        total = sum(int(row["n"]) for row in rows)
        status_counts = {key: 0 for key in STATUSES}
        discharge_observed = 0
        by_day: dict[str, int] = {}
        for row in rows:
            count = int(row["n"])
            status_counts[row["status"]] = status_counts.get(row["status"], 0) + count
            if row["discharge_status"] == "YES":
                discharge_observed += count
            if row["survey_day"] is not None:
                key = str(int(row["survey_day"]))
                by_day[key] = by_day.get(key, 0) + count
        return {
            "total": total,
            "status_counts": status_counts,
            "discharge_observed": discharge_observed,
            "with_evidence": int(evidence_count or 0),
            "by_day": by_day,
            "official_registry_loaded": False,
            "river_geometry_loaded": False,
            "classification_note": "Record-not-available is not the same as unregistered. Official registration classification requires authoritative departmental data or field verification.",
            "track_match_threshold_m": TRACK_MATCH_THRESHOLD_M,
        }


def update_industry_observation(user: AuthUser, public_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    with connect() as db:
        row = _get_row(db, user, public_id)
        if not _can_edit(user, row):
            raise PermissionError("You cannot edit this industry observation")
        name = _text(payload.get("name", row["name"]), 200)
        category = _text(payload.get("category", row["category"]), 50).upper()
        if category not in CATEGORIES:
            raise ValueError("Unsupported industry category")
        discharge_status = _text(payload.get("discharge_status", row["discharge_status"]), 20).upper()
        if discharge_status not in DISCHARGE_STATUSES:
            raise ValueError("discharge_status must be YES, NO or UNKNOWN")
        now = _now()
        db.execute(
            """
            UPDATE industry_observations
            SET name=?,category=?,discharge_status=?,discharge_notes=?,notes=?,registration_reference=?,updated_by=?,updated_at=?
            WHERE public_id=?
            """,
            (
                name, category, discharge_status,
                _text(payload.get("discharge_notes", row["discharge_notes"]), 2000),
                _text(payload.get("notes", row["notes"]), 4000),
                _text(payload.get("registration_reference", row["registration_reference"]), 300),
                user.id, now, public_id,
            ),
        )
        _audit(db, user, "UPDATE", public_id)
        db.commit()
        return _row_public(db, _get_row(db, user, public_id))


def set_industry_observation_status(user: AuthUser, public_id: str, status: str, registration_reference: str = "") -> dict[str, Any]:
    normalized = status.strip().upper()
    if normalized not in STATUSES:
        raise ValueError("Unsupported industry observation status")
    with connect() as db:
        row = _get_row(db, user, public_id)
        if not _can_edit(user, row):
            raise PermissionError("You cannot update this industry observation")
        if normalized == "VERIFIED" and not _is_company_manager(user):
            raise PermissionError("Only Nakshatech reviewers can mark an observation as verified")
        now = _now()
        verified_by = user.id if normalized == "VERIFIED" else None
        verified_at = now if normalized == "VERIFIED" else None
        reg_ref = _text(registration_reference or row["registration_reference"], 300)
        db.execute(
            "UPDATE industry_observations SET status=?,registration_reference=?,verified_by=?,verified_at=?,updated_by=?,updated_at=? WHERE public_id=?",
            (normalized, reg_ref, verified_by, verified_at, user.id, now, public_id),
        )
        _audit(db, user, "STATUS", public_id, {"from": row["status"], "to": normalized})
        db.commit()
        return _row_public(db, _get_row(db, user, public_id))


def delete_industry_observation(user: AuthUser, public_id: str) -> dict[str, Any]:
    with connect() as db:
        row = _get_row(db, user, public_id)
        if not _can_edit(user, row):
            raise PermissionError("You cannot delete this industry observation")
        evidence = db.execute("SELECT storage_name FROM industry_evidence WHERE observation_id=?", (row["id"],)).fetchall()
        db.execute("DELETE FROM industry_observations WHERE id=?", (row["id"],))
        _audit(db, user, "DELETE", public_id)
        db.commit()
    for item in evidence:
        try:
            (MEDIA_DIR / item["storage_name"]).unlink(missing_ok=True)
        except OSError:
            pass
    return {"status": "ok", "deleted": public_id}


def save_industry_evidence(user: AuthUser, public_id: str, filename: str, content_type: str | None, content: bytes) -> dict[str, Any]:
    if not content:
        raise ValueError("Evidence image is empty")
    if len(content) > MAX_EVIDENCE_BYTES:
        raise ValueError("Evidence image exceeds 10 MB limit")
    normalized_type = (content_type or mimetypes.guess_type(filename)[0] or "application/octet-stream").lower()
    if not normalized_type.startswith("image/"):
        raise ValueError("Industry evidence must be an image")
    original_name = Path(filename or "industry-evidence.jpg").name[:240]
    suffix = Path(original_name).suffix.lower()
    if suffix not in {".jpg", ".jpeg", ".png", ".webp"}:
        suffix = ".jpg"
    safe_stem = re.sub(r"[^A-Za-z0-9._-]+", "_", Path(original_name).stem).strip("._")[:80] or "evidence"
    evidence_id = _public("EVD")
    storage_name = f"{evidence_id}_{safe_stem}{suffix}"
    path = MEDIA_DIR / storage_name
    with connect() as db:
        row = _get_row(db, user, public_id)
        if not _can_edit(user, row):
            raise PermissionError("You cannot add evidence to this industry observation")
        path.write_bytes(content)
        db.execute(
            "INSERT INTO industry_evidence(public_id,observation_id,original_name,content_type,size_bytes,storage_name,uploaded_by,uploaded_at) VALUES(?,?,?,?,?,?,?,?)",
            (evidence_id, row["id"], original_name, normalized_type, len(content), storage_name, user.id, _now()),
        )
        _audit(db, user, "ADD_EVIDENCE", public_id, {"evidence": evidence_id, "filename": original_name})
        db.commit()
        return _row_public(db, _get_row(db, user, public_id))


def industry_evidence_for_user(user: AuthUser, evidence_id: str) -> tuple[dict[str, Any], Path]:
    visible, params = _visible_sql(user)
    with connect() as db:
        row = db.execute(
            f"""
            SELECT ie.*,io.organization_id
            FROM industry_evidence ie
            JOIN industry_observations io ON io.id=ie.observation_id
            WHERE ie.public_id=? AND {visible}
            """,
            [evidence_id, *params],
        ).fetchone()
        if not row:
            raise LookupError("Industry evidence not found")
        return {
            "original_name": row["original_name"],
            "content_type": row["content_type"],
            "size_bytes": row["size_bytes"],
        }, MEDIA_DIR / row["storage_name"]
