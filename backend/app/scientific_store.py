from __future__ import annotations

import json
import re
import secrets
import sqlite3
from typing import Any

from app.auth_store import AuthUser, connect, iso, utc_now

RECORD_TYPES = {
    "WATERSHED",
    "DRAINAGE",
    "INDUSTRY",
    "WATER_SAMPLE",
    "LAB_RESULT",
    "HYDROLOGY",
    "POLLUTION_HOTSPOT",
    "ISSUE_RISK",
}
RECORD_STATUSES = {"DRAFT", "SUBMITTED", "UNDER_REVIEW", "CORRECTION_REQUIRED", "APPROVED"}
PACKAGE_STATUSES = {"PENDING", "UPLOADED", "VALIDATED", "APPROVED"}

PACKAGE_REQUIREMENTS = [
    ("MICRO_CATCHMENT_BOUNDARY", "Approved / validated micro-catchment boundary"),
    ("DRAINAGE_NETWORK", "Drainage network and confluence points"),
    ("SAMPLING_REGISTER", "Sampling points and sample register"),
    ("INDUSTRIAL_POLLUTION_LOCATIONS", "Industrial / pollution-source locations"),
    ("FIELD_SURVEY_RECORDS", "Field survey records"),
    ("PHOTOS_VIDEOS", "Photographs and relevant videos"),
    ("LAB_RESULTS", "Laboratory results and supporting certificates"),
    ("HYDROLOGY", "Hydrological observations / analysis"),
    ("GIS_LAYERS", "GIS layers and attribute tables"),
    ("EXCEL_CSV", "Supporting Excel / CSV data"),
    ("TECHNICAL_REPORT", "Micro-catchment technical report"),
    ("ISSUES_RECOMMENDATIONS", "Issues, constraints and recommendations"),
]

ALLOWED_EXTENSIONS: dict[str, str] = {
    # Vector GIS
    "shp": "Vector GIS", "gpkg": "Vector GIS", "geojson": "Vector GIS", "json": "Vector GIS",
    "kml": "Vector GIS", "kmz": "Vector GIS", "gdb": "Vector GIS", "mdb": "Vector GIS",
    "gml": "Vector GIS", "gpx": "Vector GIS",
    # Raster
    "tif": "Raster", "tiff": "Raster", "cog": "Raster", "ecw": "Raster", "img": "Raster",
    "jpg": "Image / Raster", "jpeg": "Image / Raster", "png": "Image / Raster",
    # GIS projects
    "aprx": "GIS Project", "mxd": "GIS Project", "qgz": "GIS Project", "qgs": "GIS Project",
    "lyr": "GIS Project", "lyrx": "GIS Project", "lpkx": "GIS Project",
    # CAD
    "dwg": "CAD", "dxf": "CAD", "dgn": "CAD",
    # Point cloud
    "las": "Point Cloud", "laz": "Point Cloud", "xyz": "Point Cloud", "pts": "Point Cloud",
    # Documents / tabular
    "pdf": "Document", "doc": "Document", "docx": "Document", "xls": "Tabular",
    "xlsx": "Tabular", "csv": "Tabular", "ppt": "Document", "pptx": "Document",
    # Video
    "mp4": "Video", "mov": "Video", "avi": "Video", "m4v": "Video",
}
GEOSPATIAL_EXTENSIONS = {
    "shp", "gpkg", "geojson", "json", "kml", "kmz", "gdb", "mdb", "gml", "gpx",
    "tif", "tiff", "cog", "ecw", "img", "aprx", "mxd", "qgz", "qgs", "lyr", "lyrx",
    "lpkx", "dwg", "dxf", "dgn", "las", "laz", "xyz", "pts",
}
GIS_PROJECT_EXTENSIONS = {"aprx", "mxd", "qgz", "qgs", "lyr", "lyrx", "lpkx"}
LARGE_DATA_EXTENSIONS = {"tif", "tiff", "cog", "ecw", "img", "las", "laz", "gdb"}

_METADATA_BASE_REQUIRED = [
    ("dataset_name", "Dataset name"),
    ("dataset_id", "Unique Dataset ID"),
    ("description", "Description"),
    ("data_owner", "Data owner"),
    ("responsibility", "Institution / Naksha Tech responsibility"),
    ("location", "Micro-catchment / location"),
    ("creation_date", "Creation / survey / modification date"),
    ("source_method", "Source / survey / processing method"),
    ("version", "Version / revision"),
    ("review_status", "Review / approval status"),
]
_METADATA_GEO_REQUIRED = [
    ("crs", "Coordinate reference system"),
    ("datum", "Datum"),
    ("units", "Units"),
    ("accuracy_resolution", "Accuracy / resolution / scale"),
]


def _now() -> str:
    return iso(utc_now())


def _public(prefix: str) -> str:
    return f"{prefix}-{secrets.token_hex(6).upper()}"


def _loads(value: str | None) -> dict[str, Any]:
    if not value:
        return {}
    try:
        parsed = json.loads(value)
        return parsed if isinstance(parsed, dict) else {}
    except json.JSONDecodeError:
        return {}


def _is_company_manager(user: AuthUser) -> bool:
    return user.organization_type == "COMPANY" and user.role in {
        "COMPANY_ADMIN", "COMPANY_PROJECT_MANAGER", "COMPANY_REVIEWER", "COMPANY_DATA_MANAGER",
        "COMPANY_CIVIL_REVIEWER", "COMPANY_GIS_REVIEWER", "COMPANY_SURVEY_REVIEWER",
        "COMPANY_LIDAR_REVIEWER", "COMPANY_PHOTOGRAMMETRY_REVIEWER",
    }


def _is_company_approver(user: AuthUser) -> bool:
    return user.organization_type == "COMPANY" and user.role in {
        "COMPANY_ADMIN", "COMPANY_PROJECT_MANAGER", "COMPANY_REVIEWER",
        "COMPANY_CIVIL_REVIEWER", "COMPANY_GIS_REVIEWER", "COMPANY_SURVEY_REVIEWER",
        "COMPANY_LIDAR_REVIEWER", "COMPANY_PHOTOGRAMMETRY_REVIEWER",
    }


def _institution_can_write(user: AuthUser) -> bool:
    return user.organization_type == "INSTITUTION" and user.role in {"INSTITUTION_ADMIN", "INSTITUTION_USER"}


def ensure_scientific_schema() -> None:
    with connect() as db:
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS project_micro_catchments(
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                institution_id TEXT NOT NULL,
                area_sq_km REAL,
                perimeter_km REAL,
                boundary_status TEXT NOT NULL DEFAULT 'PENDING',
                drainage_status TEXT NOT NULL DEFAULT 'PENDING',
                validation_status TEXT NOT NULL DEFAULT 'PENDING',
                remarks TEXT NOT NULL DEFAULT '',
                updated_by INTEGER,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(institution_id) REFERENCES organizations(id),
                FOREIGN KEY(updated_by) REFERENCES users(id)
            );

            CREATE TABLE IF NOT EXISTS scientific_records(
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                public_id TEXT NOT NULL UNIQUE,
                record_type TEXT NOT NULL,
                institution_id TEXT,
                micro_catchment_id TEXT,
                status TEXT NOT NULL DEFAULT 'DRAFT',
                fields_json TEXT NOT NULL DEFAULT '{}',
                metadata_json TEXT NOT NULL DEFAULT '{}',
                created_by INTEGER NOT NULL,
                reviewer_id INTEGER,
                review_comment TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                submitted_at TEXT,
                review_started_at TEXT,
                reviewed_at TEXT,
                FOREIGN KEY(institution_id) REFERENCES organizations(id),
                FOREIGN KEY(micro_catchment_id) REFERENCES project_micro_catchments(id),
                FOREIGN KEY(created_by) REFERENCES users(id),
                FOREIGN KEY(reviewer_id) REFERENCES users(id)
            );
            CREATE INDEX IF NOT EXISTS idx_scientific_records_type ON scientific_records(record_type);
            CREATE INDEX IF NOT EXISTS idx_scientific_records_status ON scientific_records(status);
            CREATE INDEX IF NOT EXISTS idx_scientific_records_institution ON scientific_records(institution_id);
            CREATE INDEX IF NOT EXISTS idx_scientific_records_mc ON scientific_records(micro_catchment_id);

            CREATE TABLE IF NOT EXISTS scientific_package_checks(
                institution_id TEXT NOT NULL,
                item_key TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'PENDING',
                notes TEXT NOT NULL DEFAULT '',
                updated_by INTEGER,
                updated_at TEXT NOT NULL,
                PRIMARY KEY(institution_id,item_key),
                FOREIGN KEY(institution_id) REFERENCES organizations(id),
                FOREIGN KEY(updated_by) REFERENCES users(id)
            );

            CREATE TABLE IF NOT EXISTS scientific_audit(
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                actor_id INTEGER NOT NULL,
                action TEXT NOT NULL,
                entity_type TEXT NOT NULL,
                entity_ref TEXT NOT NULL,
                details_json TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL,
                FOREIGN KEY(actor_id) REFERENCES users(id)
            );
            """
        )
        now = _now()
        for i in range(1, 13):
            mc_id = f"MC{i:02d}"
            inst_id = f"INST-{i:03d}"
            db.execute(
                """
                INSERT OR IGNORE INTO project_micro_catchments(
                    id,name,institution_id,updated_at
                ) VALUES(?,?,?,?)
                """,
                (mc_id, f"Micro-Catchment {i:02d}", inst_id, now),
            )
            for item_key, _ in PACKAGE_REQUIREMENTS:
                db.execute(
                    """
                    INSERT OR IGNORE INTO scientific_package_checks(
                        institution_id,item_key,status,notes,updated_at
                    ) VALUES(?,?,'PENDING','',?)
                    """,
                    (inst_id, item_key, now),
                )
        db.commit()


def _audit(db: sqlite3.Connection, user: AuthUser, action: str, entity_type: str, entity_ref: str, details: dict[str, Any] | None = None) -> None:
    db.execute(
        "INSERT INTO scientific_audit(actor_id,action,entity_type,entity_ref,details_json,created_at) VALUES(?,?,?,?,?,?)",
        (user.id, action[:80], entity_type[:80], entity_ref[:160], json.dumps(details or {}, separators=(",", ":")), _now()),
    )


def _mc_row(db: sqlite3.Connection, mc_id: str) -> sqlite3.Row:
    row = db.execute(
        """
        SELECT mc.*,o.name AS institution_name
        FROM project_micro_catchments mc
        JOIN organizations o ON o.id=mc.institution_id
        WHERE mc.id=?
        """,
        (mc_id,),
    ).fetchone()
    if not row:
        raise LookupError("Micro-catchment not found")
    return row


def _mc_visible(user: AuthUser, row: sqlite3.Row) -> bool:
    if user.organization_type in {"COMPANY", "CNNL"}:
        return True
    return user.organization_type == "INSTITUTION" and row["institution_id"] == user.organization_id


def _mc_dict(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "name": row["name"],
        "institution_id": row["institution_id"],
        "institution_name": row["institution_name"],
        "area_sq_km": row["area_sq_km"],
        "perimeter_km": row["perimeter_km"],
        "boundary_status": row["boundary_status"],
        "drainage_status": row["drainage_status"],
        "validation_status": row["validation_status"],
        "remarks": row["remarks"],
        "updated_at": row["updated_at"],
    }


def list_micro_catchments(user: AuthUser) -> list[dict[str, Any]]:
    ensure_scientific_schema()
    with connect() as db:
        rows = db.execute(
            """
            SELECT mc.*,o.name AS institution_name
            FROM project_micro_catchments mc
            JOIN organizations o ON o.id=mc.institution_id
            ORDER BY mc.id
            """
        ).fetchall()
        return [_mc_dict(row) for row in rows if _mc_visible(user, row)]


def update_micro_catchment(user: AuthUser, mc_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    ensure_scientific_schema()
    if not (user.organization_type == "COMPANY" and user.role in {"COMPANY_ADMIN", "COMPANY_PROJECT_MANAGER"}):
        raise PermissionError("Nakshatech project manager access required")
    allowed_status = {"PENDING", "UPLOADED", "VALIDATED", "APPROVED"}
    with connect() as db:
        _mc_row(db, mc_id)
        name = str(payload.get("name", "")).strip()
        boundary_status = str(payload.get("boundary_status", "PENDING")).strip().upper()
        drainage_status = str(payload.get("drainage_status", "PENDING")).strip().upper()
        validation_status = str(payload.get("validation_status", "PENDING")).strip().upper()
        if boundary_status not in allowed_status or drainage_status not in allowed_status or validation_status not in allowed_status:
            raise ValueError("Micro-catchment status must be PENDING, UPLOADED, VALIDATED or APPROVED")
        area = payload.get("area_sq_km")
        perimeter = payload.get("perimeter_km")
        db.execute(
            """
            UPDATE project_micro_catchments
            SET name=COALESCE(NULLIF(?,''),name),area_sq_km=?,perimeter_km=?,boundary_status=?,drainage_status=?,
                validation_status=?,remarks=?,updated_by=?,updated_at=?
            WHERE id=?
            """,
            (
                name,
                (float(area) if area not in {None, ""} else None),
                (float(perimeter) if perimeter not in {None, ""} else None),
                boundary_status,
                drainage_status,
                validation_status,
                str(payload.get("remarks", "")).strip()[:3000],
                user.id,
                _now(),
                mc_id,
            ),
        )
        _audit(db, user, "UPDATE_MICRO_CATCHMENT", "MICRO_CATCHMENT", mc_id, payload)
        db.commit()
        return _mc_dict(_mc_row(db, mc_id))


def _record_row(db: sqlite3.Connection, public_id: str) -> sqlite3.Row:
    row = db.execute(
        """
        SELECT r.*,o.name AS institution_name,mc.name AS micro_catchment_name,
               u.display_name AS created_by_name,rv.display_name AS reviewer_name
        FROM scientific_records r
        LEFT JOIN organizations o ON o.id=r.institution_id
        LEFT JOIN project_micro_catchments mc ON mc.id=r.micro_catchment_id
        JOIN users u ON u.id=r.created_by
        LEFT JOIN users rv ON rv.id=r.reviewer_id
        WHERE r.public_id=?
        """,
        (public_id,),
    ).fetchone()
    if not row:
        raise LookupError("Scientific record not found")
    return row


def _record_visible(user: AuthUser, row: sqlite3.Row) -> bool:
    if user.organization_type == "COMPANY":
        return True
    if user.organization_type == "CNNL":
        return row["status"] == "APPROVED"
    return row["institution_id"] == user.organization_id


def _record_dict(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "public_id": row["public_id"],
        "record_type": row["record_type"],
        "institution_id": row["institution_id"],
        "institution_name": row["institution_name"],
        "micro_catchment_id": row["micro_catchment_id"],
        "micro_catchment_name": row["micro_catchment_name"],
        "status": row["status"],
        "fields": _loads(row["fields_json"]),
        "metadata": _loads(row["metadata_json"]),
        "created_by": row["created_by"],
        "created_by_name": row["created_by_name"],
        "reviewer_name": row["reviewer_name"],
        "review_comment": row["review_comment"] or "",
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "submitted_at": row["submitted_at"],
        "review_started_at": row["review_started_at"],
        "reviewed_at": row["reviewed_at"],
    }


def _validate_mc_scope(db: sqlite3.Connection, user: AuthUser, mc_id: str | None) -> str | None:
    if not mc_id:
        return None
    mc_id = mc_id.strip().upper()
    row = _mc_row(db, mc_id)
    if user.organization_type == "INSTITUTION" and row["institution_id"] != user.organization_id:
        raise PermissionError("This micro-catchment is assigned to another institution")
    return mc_id


def create_scientific_record(user: AuthUser, payload: dict[str, Any]) -> dict[str, Any]:
    ensure_scientific_schema()
    if not (_institution_can_write(user) or _is_company_manager(user)):
        raise PermissionError("This account has read-only scientific data access")
    record_type = str(payload.get("record_type", "")).strip().upper()
    if record_type not in RECORD_TYPES:
        raise ValueError("Unknown scientific record type")
    fields = payload.get("fields") or {}
    metadata = payload.get("metadata") or {}
    if not isinstance(fields, dict) or not isinstance(metadata, dict):
        raise ValueError("fields and metadata must be objects")
    submit = bool(payload.get("submit", False))
    status = "SUBMITTED" if submit else "DRAFT"
    now = _now()
    public_id = _public({
        "WATERSHED": "WAT", "DRAINAGE": "DRN", "INDUSTRY": "IND", "WATER_SAMPLE": "SMP",
        "LAB_RESULT": "LAB", "HYDROLOGY": "HYD", "POLLUTION_HOTSPOT": "HOT", "ISSUE_RISK": "RSK",
    }[record_type])
    with connect() as db:
        mc_id = _validate_mc_scope(db, user, str(payload.get("micro_catchment_id", "")).strip() or None)
        if user.organization_type == "INSTITUTION":
            institution_id = user.organization_id
            if not mc_id:
                row = db.execute("SELECT id FROM project_micro_catchments WHERE institution_id=? ORDER BY id LIMIT 1", (institution_id,)).fetchone()
                mc_id = row["id"] if row else None
        else:
            institution_id = str(payload.get("institution_id", "")).strip() or None
            if institution_id:
                exists = db.execute("SELECT 1 FROM organizations WHERE id=? AND org_type='INSTITUTION'", (institution_id,)).fetchone()
                if not exists:
                    raise ValueError("Unknown institution_id")
            if mc_id and not institution_id:
                institution_id = _mc_row(db, mc_id)["institution_id"]
        db.execute(
            """
            INSERT INTO scientific_records(
                public_id,record_type,institution_id,micro_catchment_id,status,fields_json,metadata_json,
                created_by,created_at,updated_at,submitted_at
            ) VALUES(?,?,?,?,?,?,?,?,?,?,?)
            """,
            (
                public_id, record_type, institution_id, mc_id, status,
                json.dumps(fields, ensure_ascii=False, separators=(",", ":")),
                json.dumps(metadata, ensure_ascii=False, separators=(",", ":")),
                user.id, now, now, (now if submit else None),
            ),
        )
        _audit(db, user, "CREATE_SCIENTIFIC_RECORD", record_type, public_id, {"status": status, "micro_catchment_id": mc_id})
        db.commit()
        return _record_dict(_record_row(db, public_id))


def list_scientific_records(
    user: AuthUser,
    *,
    record_type: str | None = None,
    status: str | None = None,
    institution_id: str | None = None,
    micro_catchment_id: str | None = None,
    limit: int = 1000,
) -> list[dict[str, Any]]:
    ensure_scientific_schema()
    where = ["1=1"]
    params: list[Any] = []
    if record_type:
        rt = record_type.strip().upper()
        if rt not in RECORD_TYPES:
            raise ValueError("Unknown scientific record type")
        where.append("r.record_type=?")
        params.append(rt)
    if status:
        st = status.strip().upper()
        if st not in RECORD_STATUSES:
            raise ValueError("Unknown scientific status")
        where.append("r.status=?")
        params.append(st)
    if institution_id:
        where.append("r.institution_id=?")
        params.append(institution_id.strip())
    if micro_catchment_id:
        where.append("r.micro_catchment_id=?")
        params.append(micro_catchment_id.strip().upper())
    limit = max(1, min(int(limit), 5000))
    with connect() as db:
        rows = db.execute(
            f"""
            SELECT r.*,o.name AS institution_name,mc.name AS micro_catchment_name,
                   u.display_name AS created_by_name,rv.display_name AS reviewer_name
            FROM scientific_records r
            LEFT JOIN organizations o ON o.id=r.institution_id
            LEFT JOIN project_micro_catchments mc ON mc.id=r.micro_catchment_id
            JOIN users u ON u.id=r.created_by
            LEFT JOIN users rv ON rv.id=r.reviewer_id
            WHERE {' AND '.join(where)}
            ORDER BY r.updated_at DESC,r.id DESC
            LIMIT ?
            """,
            (*params, limit),
        ).fetchall()
        return [_record_dict(row) for row in rows if _record_visible(user, row)]


def update_scientific_record(user: AuthUser, public_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    ensure_scientific_schema()
    with connect() as db:
        row = _record_row(db, public_id)
        if not _record_visible(user, row):
            raise PermissionError("Scientific record is outside your access scope")
        owner_edit = _institution_can_write(user) and row["institution_id"] == user.organization_id and row["status"] in {"DRAFT", "CORRECTION_REQUIRED"}
        company_edit = _is_company_manager(user)
        if not (owner_edit or company_edit):
            raise PermissionError("This scientific record cannot be edited in its current status")
        fields = payload.get("fields", _loads(row["fields_json"]))
        metadata = payload.get("metadata", _loads(row["metadata_json"]))
        if not isinstance(fields, dict) or not isinstance(metadata, dict):
            raise ValueError("fields and metadata must be objects")
        mc_id = _validate_mc_scope(db, user, str(payload.get("micro_catchment_id", row["micro_catchment_id"] or "")).strip() or None)
        institution_id = row["institution_id"]
        if company_edit and payload.get("institution_id"):
            institution_id = str(payload.get("institution_id")).strip()
        db.execute(
            "UPDATE scientific_records SET institution_id=?,micro_catchment_id=?,fields_json=?,metadata_json=?,updated_at=? WHERE public_id=?",
            (
                institution_id, mc_id,
                json.dumps(fields, ensure_ascii=False, separators=(",", ":")),
                json.dumps(metadata, ensure_ascii=False, separators=(",", ":")),
                _now(), public_id,
            ),
        )
        _audit(db, user, "UPDATE_SCIENTIFIC_RECORD", row["record_type"], public_id)
        db.commit()
        return _record_dict(_record_row(db, public_id))


def scientific_record_action(user: AuthUser, public_id: str, action: str, comment: str = "") -> dict[str, Any]:
    ensure_scientific_schema()
    action = action.strip().lower().replace("_", "-")
    comment = comment.strip()[:3000]
    with connect() as db:
        row = _record_row(db, public_id)
        if not _record_visible(user, row) and user.organization_type != "COMPANY":
            raise PermissionError("Scientific record is outside your access scope")
        old = row["status"]
        now = _now()
        reviewer_id = row["reviewer_id"]
        submitted_at = row["submitted_at"]
        review_started_at = row["review_started_at"]
        reviewed_at = row["reviewed_at"]

        if action in {"submit", "resubmit"}:
            owner_ok = (
                (_institution_can_write(user) and row["institution_id"] == user.organization_id)
                or (_is_company_manager(user) and user.organization_type == "COMPANY")
            )
            if not owner_ok:
                raise PermissionError("Only the owning institution or Nakshatech can submit this record")
            if old not in {"DRAFT", "CORRECTION_REQUIRED"}:
                raise ValueError("Only Draft or Correction Required records can be submitted")
            new = "SUBMITTED"
            submitted_at = now
        elif action == "start-review":
            if not _is_company_approver(user):
                raise PermissionError("Nakshatech reviewer access required")
            if old != "SUBMITTED":
                raise ValueError("Only Submitted records can enter review")
            new = "UNDER_REVIEW"
            reviewer_id = user.id
            review_started_at = now
        elif action == "return":
            if not _is_company_approver(user):
                raise PermissionError("Nakshatech reviewer access required")
            if old not in {"SUBMITTED", "UNDER_REVIEW"}:
                raise ValueError("Only Submitted or Under Review records can be returned")
            if not comment:
                raise ValueError("Correction comment is required")
            new = "CORRECTION_REQUIRED"
            reviewer_id = user.id
            reviewed_at = now
        elif action == "approve":
            if not _is_company_approver(user):
                raise PermissionError("Nakshatech reviewer access required")
            if old not in {"SUBMITTED", "UNDER_REVIEW"}:
                raise ValueError("Only Submitted or Under Review records can be approved")
            new = "APPROVED"
            reviewer_id = user.id
            reviewed_at = now
        elif action == "reopen":
            if not (user.organization_type == "COMPANY" and user.role == "COMPANY_ADMIN"):
                raise PermissionError("Company administrator access required")
            new = "DRAFT"
            reviewer_id = None
            reviewed_at = None
        else:
            raise ValueError("action must be submit, resubmit, start-review, return, approve or reopen")

        db.execute(
            """
            UPDATE scientific_records
            SET status=?,reviewer_id=?,review_comment=?,updated_at=?,submitted_at=?,review_started_at=?,reviewed_at=?
            WHERE public_id=?
            """,
            (new, reviewer_id, comment, now, submitted_at, review_started_at, reviewed_at, public_id),
        )
        _audit(db, user, f"SCIENTIFIC_{action.upper().replace('-', '_')}", row["record_type"], public_id, {"from": old, "to": new, "comment": comment})
        db.commit()
        return _record_dict(_record_row(db, public_id))


def delete_scientific_record(user: AuthUser, public_id: str) -> dict[str, Any]:
    ensure_scientific_schema()
    with connect() as db:
        row = _record_row(db, public_id)
        owner_delete = _institution_can_write(user) and row["institution_id"] == user.organization_id and row["status"] == "DRAFT"
        admin_delete = user.organization_type == "COMPANY" and user.role == "COMPANY_ADMIN"
        if not (owner_delete or admin_delete):
            raise PermissionError("Only draft owners or Company Admin can delete this record")
        db.execute("DELETE FROM scientific_records WHERE public_id=?", (public_id,))
        _audit(db, user, "DELETE_SCIENTIFIC_RECORD", row["record_type"], public_id)
        db.commit()
        return {"status": "ok", "deleted": public_id}


def _package_target(user: AuthUser, institution_id: str | None) -> str:
    if user.organization_type == "INSTITUTION":
        return user.organization_id
    target = (institution_id or "INST-001").strip()
    if not re.fullmatch(r"INST-\d{3}", target):
        raise ValueError("institution_id is required")
    return target


def package_status(user: AuthUser, institution_id: str | None = None) -> dict[str, Any]:
    ensure_scientific_schema()
    target = _package_target(user, institution_id)
    with connect() as db:
        org = db.execute("SELECT id,name FROM organizations WHERE id=? AND org_type='INSTITUTION'", (target,)).fetchone()
        if not org:
            raise LookupError("Institution not found")
        rows = db.execute(
            "SELECT * FROM scientific_package_checks WHERE institution_id=? ORDER BY rowid",
            (target,),
        ).fetchall()
        label_by_key = dict(PACKAGE_REQUIREMENTS)
        items = [
            {
                "item_key": row["item_key"],
                "label": label_by_key.get(row["item_key"], row["item_key"].replace("_", " ").title()),
                "status": row["status"],
                "notes": row["notes"],
                "updated_at": row["updated_at"],
            }
            for row in rows
        ]
        complete = sum(1 for item in items if item["status"] in {"VALIDATED", "APPROVED"})
        return {
            "institution_id": org["id"],
            "institution_name": org["name"],
            "items": items,
            "complete_items": complete,
            "total_items": len(items),
            "completion_pct": round((complete / len(items) * 100.0) if items else 0.0, 1),
        }


def update_package_item(user: AuthUser, item_key: str, payload: dict[str, Any], institution_id: str | None = None) -> dict[str, Any]:
    ensure_scientific_schema()
    key = item_key.strip().upper()
    if key not in dict(PACKAGE_REQUIREMENTS):
        raise ValueError("Unknown mandatory upload-package item")
    target = _package_target(user, institution_id)
    if user.organization_type == "INSTITUTION":
        if not _institution_can_write(user):
            raise PermissionError("Institution account is read-only")
        if target != user.organization_id:
            raise PermissionError("Institutions can update only their own upload package")
    elif not _is_company_manager(user):
        raise PermissionError("Nakshatech manager access required")
    status = str(payload.get("status", "PENDING")).strip().upper()
    if status not in PACKAGE_STATUSES:
        raise ValueError("Package status must be PENDING, UPLOADED, VALIDATED or APPROVED")
    if user.organization_type == "INSTITUTION" and status in {"VALIDATED", "APPROVED"}:
        raise PermissionError("Only Nakshatech can validate or approve upload-package items")
    with connect() as db:
        db.execute(
            """
            UPDATE scientific_package_checks
            SET status=?,notes=?,updated_by=?,updated_at=?
            WHERE institution_id=? AND item_key=?
            """,
            (status, str(payload.get("notes", "")).strip()[:3000], user.id, _now(), target, key),
        )
        _audit(db, user, "UPDATE_UPLOAD_PACKAGE", "PACKAGE_ITEM", f"{target}:{key}", {"status": status})
        db.commit()
    return package_status(user, target)


def validate_dataset(user: AuthUser, payload: dict[str, Any]) -> dict[str, Any]:
    # user is intentionally accepted for future audit/role-specific validation rules.
    _ = user
    filename = str(payload.get("filename", "")).strip()
    metadata = payload.get("metadata") or {}
    if not isinstance(metadata, dict):
        raise ValueError("metadata must be an object")
    errors: list[str] = []
    warnings: list[str] = []
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    group = ALLOWED_EXTENSIONS.get(ext)
    if not filename:
        errors.append("Filename is required")
    elif not group:
        errors.append(f".{ext or 'unknown'} is not in the supported project format list")

    naming_ok = bool(re.fullmatch(r"ARK_(?:MC\d{2}|NT)_[A-Za-z0-9][A-Za-z0-9_-]*_\d{6,8}_R\d{2}\.[A-Za-z0-9]+", filename, flags=re.IGNORECASE))
    if filename and not naming_ok:
        errors.append("Filename must follow Project_MicroCatchment_DataType_Location_Date_Revision, e.g. ARK_MC05_WaterQuality_Sample03_20260825_R01.xlsx")

    missing: list[str] = []
    for key, label in _METADATA_BASE_REQUIRED:
        if not str(metadata.get(key, "")).strip():
            missing.append(label)
    if ext in GEOSPATIAL_EXTENSIONS:
        for key, label in _METADATA_GEO_REQUIRED:
            if not str(metadata.get(key, "")).strip():
                missing.append(label)
    if missing:
        errors.append("Missing metadata: " + ", ".join(missing))

    if ext in GIS_PROJECT_EXTENSIONS:
        warnings.append("GIS project files must be submitted with their referenced GeoPackage/Shapefile/raster datasets; the project file alone is not the master database.")
    if ext in LARGE_DATA_EXTENSIONS:
        warnings.append("Large raster/point-cloud data should use the project repository/object-storage path rather than the transactional SQLite database.")
    if ext in {"csv", "xlsx", "xls"} and not str(metadata.get("schema_description", "")).strip():
        warnings.append("Add a schema/column description for structured tabular data when available.")

    return {
        "valid": not errors,
        "filename": filename,
        "extension": ext,
        "data_group": group,
        "naming_convention_ok": naming_ok,
        "errors": errors,
        "warnings": warnings,
        "supported_formats": sorted(ALLOWED_EXTENSIONS.keys()),
    }


def scientific_summary(user: AuthUser) -> dict[str, Any]:
    ensure_scientific_schema()
    records = list_scientific_records(user, limit=5000)
    micro = list_micro_catchments(user)
    type_counts = {kind: 0 for kind in sorted(RECORD_TYPES)}
    status_counts = {kind: 0 for kind in sorted(RECORD_STATUSES)}
    for record in records:
        type_counts[record["record_type"]] = type_counts.get(record["record_type"], 0) + 1
        status_counts[record["status"]] = status_counts.get(record["status"], 0) + 1
    result: dict[str, Any] = {
        "records": len(records),
        "micro_catchments": len(micro),
        "type_counts": type_counts,
        "status_counts": status_counts,
        "approved_records": status_counts.get("APPROVED", 0),
        "pending_review": status_counts.get("SUBMITTED", 0) + status_counts.get("UNDER_REVIEW", 0),
    }
    if user.organization_type == "INSTITUTION":
        result["package"] = package_status(user, user.organization_id)
    elif user.organization_type == "COMPANY":
        packages = [package_status(user, f"INST-{i:03d}") for i in range(1, 13)]
        result["institution_package_average_pct"] = round(sum(p["completion_pct"] for p in packages) / len(packages), 1)
    return result
