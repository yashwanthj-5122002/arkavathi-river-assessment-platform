from __future__ import annotations

import json
import secrets
import sqlite3
from datetime import datetime, timezone
from typing import Any

from app.auth_store import AuthUser, connect

WORKFLOW_STATUSES = {
    "DRAFT",
    "SUBMITTED",
    "UNDER_REVIEW",
    "CORRECTION_REQUIRED",
    "RESUBMITTED",
    "TECHNICALLY_APPROVED",
    "FINAL_APPROVED",
    "INTEGRATED",
    "REJECTED",
}

TASK_STATUSES = {
    "DRAFT",
    "ASSIGNED",
    "IN_PROGRESS",
    "SUBMITTED",
    "UNDER_REVIEW",
    "CORRECTION_REQUIRED",
    "RESUBMITTED",
    "APPROVED",
    "COMPLETED",
    "CANCELLED",
}

PRIORITIES = {"LOW", "MEDIUM", "HIGH", "CRITICAL"}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _public(prefix: str) -> str:
    return f"{prefix}-{datetime.now(timezone.utc):%Y%m%d}-{secrets.token_hex(4).upper()}"


def _table_exists(db: sqlite3.Connection, name: str) -> bool:
    return db.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,)
    ).fetchone() is not None


def ensure_phase2_ready() -> dict[str, Any]:
    required = {
        "roles",
        "permissions",
        "role_permissions",
        "tasks",
        "task_assignments",
        "task_history",
        "dataset_workflow",
        "approval_history",
        "notifications",
        "audit_logs",
    }
    with connect() as db:
        missing = sorted(name for name in required if not _table_exists(db, name))
        if missing:
            raise RuntimeError(
                "V1.8 Phase-1 database migration is required before Phase-2: "
                + ", ".join(missing)
            )
        db.execute(
            "CREATE INDEX IF NOT EXISTS idx_workflow_source ON dataset_workflow(source_type,source_ref)"
        )
        db.execute(
            "CREATE INDEX IF NOT EXISTS idx_task_history_task_time ON task_history(task_id,created_at DESC)"
        )
        db.commit()
    return {"status": "ready", "phase": "v1.8-phase2"}


def _role_row(db: sqlite3.Connection, user: AuthUser) -> sqlite3.Row | None:
    return db.execute(
        "SELECT * FROM roles WHERE role_code=? AND active=1", (user.role,)
    ).fetchone()


def permissions_for_user(user: AuthUser) -> dict[str, Any]:
    ensure_phase2_ready()
    with connect() as db:
        role = _role_row(db, user)
        rows = db.execute(
            """
            SELECT p.permission_code
            FROM role_permissions rp
            JOIN permissions p ON p.permission_code=rp.permission_code
            WHERE rp.role_code=? AND p.active=1
            ORDER BY p.permission_code
            """,
            (user.role,),
        ).fetchall()
        return {
            "role": user.role,
            "organization_type": user.organization_type,
            "organization_id": user.organization_id,
            "department_scope": role["department_scope"] if role else None,
            "permissions": [row["permission_code"] for row in rows],
        }


def _permission_set(db: sqlite3.Connection, user: AuthUser) -> set[str]:
    return {
        row[0]
        for row in db.execute(
            "SELECT permission_code FROM role_permissions WHERE role_code=?", (user.role,)
        ).fetchall()
    }


def _department_scope(db: sqlite3.Connection, user: AuthUser) -> str | None:
    row = _role_row(db, user)
    return str(row["department_scope"]) if row and row["department_scope"] else None


def require_permission(user: AuthUser, permission: str) -> None:
    ensure_phase2_ready()
    with connect() as db:
        if permission not in _permission_set(db, user):
            raise PermissionError(f"Permission required: {permission}")


def _json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), default=str)


def _audit(
    db: sqlite3.Connection,
    user: AuthUser,
    action: str,
    module: str,
    *,
    entity_type: str | None = None,
    entity_ref: str | None = None,
    department_id: str | None = None,
    details: dict[str, Any] | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> None:
    db.execute(
        """
        INSERT INTO audit_logs(
            public_id,user_id,organization_id,department_id,action,module,
            entity_type,entity_ref,details_json,ip_address,user_agent,occurred_at
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
        """,
        (
            _public("AUD"),
            user.id,
            user.organization_id,
            department_id,
            action,
            module,
            entity_type,
            entity_ref,
            _json(details or {}),
            (ip_address or "")[:120],
            (user_agent or "")[:500],
            _now(),
        ),
    )


def _notify(
    db: sqlite3.Connection,
    *,
    notification_type: str,
    title: str,
    message: str,
    user_id: int | None = None,
    organization_id: str | None = None,
    department_id: str | None = None,
    related_type: str | None = None,
    related_ref: str | None = None,
) -> None:
    db.execute(
        """
        INSERT INTO notifications(
            public_id,user_id,organization_id,department_id,notification_type,title,message,
            related_type,related_ref,is_read,created_at
        ) VALUES(?,?,?,?,?,?,?,?,?,0,?)
        """,
        (
            _public("NTF"),
            user_id,
            organization_id,
            department_id,
            notification_type[:80],
            title[:220],
            message[:2000],
            related_type,
            related_ref,
            _now(),
        ),
    )


def _source_info(db: sqlite3.Connection, source_type: str, source_ref: str) -> dict[str, Any]:
    source_type = source_type.strip().upper()
    source_ref = source_ref.strip()
    if source_type == "REPOSITORY_BATCH":
        row = db.execute(
            """
            SELECT b.public_id,b.department_id,b.status,b.created_by,b.created_at,b.completed_at,
                   b.data_date,b.category,b.description,b.total_files,b.total_bytes,
                   d.name AS department_name,u.display_name AS created_by_name
            FROM repository_batches b
            JOIN project_departments d ON d.id=b.department_id
            JOIN users u ON u.id=b.created_by
            WHERE b.public_id=?
            """,
            (source_ref,),
        ).fetchone()
        if not row:
            raise LookupError("Repository batch not found")
        return {
            "source_type": source_type,
            "source_ref": row["public_id"],
            "owner_organization_id": "ORG-NAKSHA",
            "department_id": row["department_id"],
            "institution_id": None,
            "created_by": row["created_by"],
            "created_at": row["created_at"],
            "submitted_at": row["completed_at"],
            "default_status": "SUBMITTED" if row["status"] == "COMPLETE" else "DRAFT",
            "summary": {
                "department_name": row["department_name"],
                "category": row["category"],
                "data_date": row["data_date"],
                "description": row["description"] or "",
                "total_files": int(row["total_files"] or 0),
                "total_bytes": int(row["total_bytes"] or 0),
                "created_by_name": row["created_by_name"],
            },
        }
    if source_type == "INSTITUTION_ENTRY":
        row = db.execute(
            """
            SELECT e.public_id,e.institution_id,e.entry_type,e.status,e.created_by,e.created_at,e.updated_at,
                   e.submitted_at,e.payload_json,o.name AS institution_name,u.display_name AS created_by_name
            FROM civil_entries e
            JOIN organizations o ON o.id=e.institution_id
            JOIN users u ON u.id=e.created_by
            WHERE e.public_id=?
            """,
            (source_ref,),
        ).fetchone()
        if not row:
            raise LookupError("Institution entry not found")
        mapped = {
            "DRAFT": "DRAFT",
            "SUBMITTED": "SUBMITTED",
            "UNDER_REVIEW": "UNDER_REVIEW",
            "RETURNED": "CORRECTION_REQUIRED",
            "APPROVED": "FINAL_APPROVED",
        }.get(str(row["status"]).upper(), "DRAFT")
        payload = json.loads(row["payload_json"] or "{}")
        return {
            "source_type": source_type,
            "source_ref": row["public_id"],
            "owner_organization_id": row["institution_id"],
            "department_id": None,
            "institution_id": row["institution_id"],
            "created_by": row["created_by"],
            "created_at": row["created_at"],
            "submitted_at": row["submitted_at"],
            "default_status": mapped,
            "summary": {
                "institution_name": row["institution_name"],
                "entry_type": row["entry_type"],
                "fields": payload,
                "created_by_name": row["created_by_name"],
            },
        }
    raise ValueError("source_type must be REPOSITORY_BATCH or INSTITUTION_ENTRY")


def _ensure_workflow_locked(db: sqlite3.Connection, source_type: str, source_ref: str) -> sqlite3.Row:
    source_type = source_type.strip().upper()
    source_ref = source_ref.strip()
    row = db.execute(
        "SELECT * FROM dataset_workflow WHERE source_type=? AND source_ref=?",
        (source_type, source_ref),
    ).fetchone()
    if row:
        return row
    info = _source_info(db, source_type, source_ref)
    prefix = "WF-REPO-" if source_type == "REPOSITORY_BATCH" else "WF-INST-"
    now = _now()
    db.execute(
        """
        INSERT INTO dataset_workflow(
            public_id,source_type,source_ref,owner_organization_id,department_id,institution_id,
            current_status,created_by,submitted_at,created_at,updated_at
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?)
        """,
        (
            prefix + source_ref,
            source_type,
            source_ref,
            info["owner_organization_id"],
            info["department_id"],
            info["institution_id"],
            info["default_status"],
            info["created_by"],
            info["submitted_at"],
            info["created_at"] or now,
            now,
        ),
    )
    return db.execute(
        "SELECT * FROM dataset_workflow WHERE source_type=? AND source_ref=?",
        (source_type, source_ref),
    ).fetchone()


def sync_workflows() -> dict[str, int]:
    ensure_phase2_ready()
    repo_added = 0
    inst_added = 0
    with connect() as db:
        if _table_exists(db, "repository_batches"):
            refs = db.execute(
                "SELECT public_id FROM repository_batches WHERE public_id IS NOT NULL AND status='COMPLETE'"
            ).fetchall()
            for item in refs:
                before = db.execute(
                    "SELECT 1 FROM dataset_workflow WHERE source_type='REPOSITORY_BATCH' AND source_ref=?",
                    (item[0],),
                ).fetchone()
                if not before:
                    _ensure_workflow_locked(db, "REPOSITORY_BATCH", item[0])
                    repo_added += 1
        if _table_exists(db, "civil_entries"):
            refs = db.execute(
                "SELECT public_id FROM civil_entries WHERE public_id IS NOT NULL"
            ).fetchall()
            for item in refs:
                before = db.execute(
                    "SELECT 1 FROM dataset_workflow WHERE source_type='INSTITUTION_ENTRY' AND source_ref=?",
                    (item[0],),
                ).fetchone()
                if not before:
                    _ensure_workflow_locked(db, "INSTITUTION_ENTRY", item[0])
                    inst_added += 1
        db.commit()
    return {"repository_added": repo_added, "institution_added": inst_added}


def _workflow_row_to_dict(db: sqlite3.Connection, row: sqlite3.Row, include_history: bool = True) -> dict[str, Any]:
    info = _source_info(db, row["source_type"], row["source_ref"])
    result = {
        "public_id": row["public_id"],
        "source_type": row["source_type"],
        "source_ref": row["source_ref"],
        "owner_organization_id": row["owner_organization_id"],
        "department_id": row["department_id"],
        "institution_id": row["institution_id"],
        "micro_catchment_id": row["micro_catchment_id"],
        "current_status": row["current_status"],
        "created_by": row["created_by"],
        "technical_reviewer_id": row["technical_reviewer_id"],
        "final_approver_id": row["final_approver_id"],
        "submitted_at": row["submitted_at"],
        "review_started_at": row["review_started_at"],
        "technical_approved_at": row["technical_approved_at"],
        "final_approved_at": row["final_approved_at"],
        "integrated_at": row["integrated_at"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "source": info["summary"],
    }
    if include_history:
        result["history"] = [
            dict(item)
            for item in db.execute(
                """
                SELECT h.action,h.from_status,h.to_status,h.performed_by,h.reviewer_role,h.remarks,
                       h.details_json,h.created_at,u.display_name AS performed_by_name
                FROM approval_history h
                LEFT JOIN users u ON u.id=h.performed_by
                WHERE h.workflow_id=? ORDER BY h.id
                """,
                (row["id"],),
            ).fetchall()
        ]
    return result


def _workflow_by_public(db: sqlite3.Connection, public_id: str) -> sqlite3.Row:
    row = db.execute(
        "SELECT * FROM dataset_workflow WHERE public_id=?", (public_id.strip(),)
    ).fetchone()
    if not row:
        raise LookupError("Workflow item not found")
    return row


def _workflow_visible(user: AuthUser, row: sqlite3.Row, *, approved_only: bool = False) -> bool:
    with connect() as db:
        permissions = _permission_set(db, user)
        dep_scope = _department_scope(db, user)
    if user.organization_type == "CNNL":
        return "CNNL.VIEW_APPROVED" in permissions and row["current_status"] in {"FINAL_APPROVED", "INTEGRATED"}
    if user.organization_type == "INSTITUTION":
        return row["institution_id"] == user.organization_id
    if user.organization_type == "COMPANY":
        if approved_only and row["current_status"] not in {"FINAL_APPROVED", "INTEGRATED"}:
            return False
        # The generic department uploader is intentionally not a project-wide
        # data viewer. It can inspect workflow state only for records created by
        # its own account. Department passkeys still govern each upload batch.
        if user.role == "COMPANY_DEPARTMENT_USER":
            return row["created_by"] == user.id
        if dep_scope and row["department_id"] != dep_scope:
            return False
        return True
    return False


def get_workflow(user: AuthUser, public_id: str) -> dict[str, Any]:
    sync_workflows()
    with connect() as db:
        row = _workflow_by_public(db, public_id)
        if not _workflow_visible(user, row):
            raise LookupError("Workflow item not found")
        return _workflow_row_to_dict(db, row, include_history=True)


def list_visible_workflows(
    user: AuthUser,
    *,
    status: str | None = None,
    department_id: str | None = None,
    source_type: str | None = None,
    limit: int = 1000,
) -> list[dict[str, Any]]:
    """List workflow items visible to the current account.

    This is the UI-facing Phase-3 listing endpoint. It preserves the same
    organization and reviewer scoping rules used by get_workflow().
    """
    sync_workflows()
    limit = max(1, min(int(limit), 2000))
    requested_status = (status or "").strip().upper()
    requested_source = (source_type or "").strip().upper()
    requested_department = (department_id or "").strip().upper()
    if requested_status and requested_status not in WORKFLOW_STATUSES:
        raise ValueError("Unknown workflow status")
    if requested_source and requested_source not in {"REPOSITORY_BATCH", "INSTITUTION_ENTRY"}:
        raise ValueError("Unknown source_type")

    with connect() as db:
        permissions = _permission_set(db, user)
        dep_scope = _department_scope(db, user)
        where: list[str] = ["1=1"]
        params: list[Any] = []

        if user.organization_type == "CNNL":
            if "CNNL.VIEW_APPROVED" not in permissions:
                raise PermissionError("Permission required: CNNL.VIEW_APPROVED")
            where.append("current_status IN ('FINAL_APPROVED','INTEGRATED')")
        elif user.organization_type == "INSTITUTION":
            where.append("institution_id=?")
            params.append(user.organization_id)
        elif user.organization_type == "COMPANY":
            if user.role == "COMPANY_DEPARTMENT_USER":
                where.append("created_by=?")
                params.append(user.id)
            elif dep_scope:
                where.append("department_id=?")
                params.append(dep_scope)
        else:
            raise PermissionError("Workflow access is not available to this account")

        if requested_status:
            where.append("current_status=?")
            params.append(requested_status)
        if requested_department:
            if dep_scope and requested_department != dep_scope:
                return []
            if user.organization_type == "INSTITUTION":
                return []
            where.append("department_id=?")
            params.append(requested_department)
        if requested_source:
            where.append("source_type=?")
            params.append(requested_source)

        params.append(limit)
        rows = db.execute(
            "SELECT * FROM dataset_workflow WHERE " + " AND ".join(where) +
            " ORDER BY updated_at DESC,id DESC LIMIT ?",
            params,
        ).fetchall()
        return [_workflow_row_to_dict(db, row, include_history=False) for row in rows]


def task_targets(user: AuthUser) -> dict[str, Any]:
    """Safe assignment targets for the Phase-3 task creation UI."""
    require_permission(user, "TASK.ASSIGN")
    with connect() as db:
        departments = [
            dict(row)
            for row in db.execute(
                "SELECT id,name,code FROM project_departments WHERE active=1 ORDER BY id"
            ).fetchall()
        ]
        institutions = [
            dict(row)
            for row in db.execute(
                "SELECT id,name,code FROM organizations WHERE org_type='INSTITUTION' AND active=1 ORDER BY id"
            ).fetchall()
        ]
        eligible_users = [
            dict(row)
            for row in db.execute(
                """
                SELECT u.id,u.email,u.display_name,u.organization_id,u.role,o.name AS organization_name
                FROM users u JOIN organizations o ON o.id=u.organization_id
                WHERE u.active=1 AND u.role IN (
                    'COMPANY_DEPARTMENT_USER','INSTITUTION_ADMIN','INSTITUTION_USER'
                )
                ORDER BY o.org_type,o.id,u.display_name,u.id
                """
            ).fetchall()
        ]
        return {
            "departments": departments,
            "institutions": institutions,
            "eligible_users": eligible_users,
        }


def list_review_queue(
    user: AuthUser,
    *,
    status: str | None = None,
    department_id: str | None = None,
    source_type: str | None = None,
) -> list[dict[str, Any]]:
    sync_workflows()
    require_permission(user, "WORKFLOW.REVIEW")
    with connect() as db:
        dep_scope = _department_scope(db, user)
        where = ["1=1"]
        params: list[Any] = []
        requested_status = (status or "").strip().upper()
        if requested_status:
            if requested_status not in WORKFLOW_STATUSES:
                raise ValueError("Unknown workflow status")
            where.append("current_status=?")
            params.append(requested_status)
        else:
            where.append("current_status IN ('SUBMITTED','RESUBMITTED','UNDER_REVIEW')")
        if dep_scope:
            where.append("department_id=?")
            params.append(dep_scope)
        elif department_id:
            where.append("department_id=?")
            params.append(department_id.strip().upper())
        if source_type:
            st = source_type.strip().upper()
            if st not in {"REPOSITORY_BATCH", "INSTITUTION_ENTRY"}:
                raise ValueError("Unknown source_type")
            where.append("source_type=?")
            params.append(st)
        rows = db.execute(
            "SELECT * FROM dataset_workflow WHERE " + " AND ".join(where) + " ORDER BY updated_at DESC,id DESC",
            params,
        ).fetchall()
        return [_workflow_row_to_dict(db, row, include_history=False) for row in rows]


def list_cnnl_approved(user: AuthUser, *, limit: int = 500) -> list[dict[str, Any]]:
    sync_workflows()
    require_permission(user, "CNNL.VIEW_APPROVED")
    limit = max(1, min(int(limit), 2000))
    with connect() as db:
        rows = db.execute(
            """
            SELECT * FROM dataset_workflow
            WHERE current_status IN ('FINAL_APPROVED','INTEGRATED')
            ORDER BY COALESCE(final_approved_at,updated_at) DESC,id DESC LIMIT ?
            """,
            (limit,),
        ).fetchall()
        return [_workflow_row_to_dict(db, row, include_history=False) for row in rows]


def _assert_submit_owner(db: sqlite3.Connection, user: AuthUser, row: sqlite3.Row) -> None:
    permissions = _permission_set(db, user)
    if "WORKFLOW.SUBMIT" not in permissions:
        raise PermissionError("Permission required: WORKFLOW.SUBMIT")
    if user.organization_type == "INSTITUTION":
        if row["institution_id"] != user.organization_id:
            raise PermissionError("Institution users can submit only their own institution data")
        return
    if user.organization_type != "COMPANY":
        raise PermissionError("This account cannot submit project data")
    if user.role == "COMPANY_DEPARTMENT_USER" and row["created_by"] != user.id:
        raise PermissionError("Department users can submit only data uploaded by their own account")


def _assert_review_scope(db: sqlite3.Connection, user: AuthUser, row: sqlite3.Row, permission: str) -> None:
    permissions = _permission_set(db, user)
    if permission not in permissions:
        raise PermissionError(f"Permission required: {permission}")
    if user.organization_type != "COMPANY":
        raise PermissionError("Nakshatech review access required")
    dep_scope = _department_scope(db, user)
    if dep_scope and row["department_id"] != dep_scope:
        raise PermissionError(f"Reviewer is restricted to {dep_scope} data")


def _history(
    db: sqlite3.Connection,
    row: sqlite3.Row,
    user: AuthUser,
    action: str,
    from_status: str,
    to_status: str,
    remarks: str,
    details: dict[str, Any] | None = None,
) -> None:
    db.execute(
        """
        INSERT INTO approval_history(
            workflow_id,action,from_status,to_status,performed_by,reviewer_role,remarks,details_json,created_at
        ) VALUES(?,?,?,?,?,?,?,?,?)
        """,
        (
            row["id"],
            action,
            from_status,
            to_status,
            user.id,
            user.role,
            remarks[:3000],
            _json(details or {}),
            _now(),
        ),
    )


def _mirror_source_status(db: sqlite3.Connection, row: sqlite3.Row, workflow_status: str, reviewer_id: int | None, remarks: str) -> None:
    if row["source_type"] != "INSTITUTION_ENTRY" or not _table_exists(db, "civil_entries"):
        return
    mapping = {
        "DRAFT": "DRAFT",
        "SUBMITTED": "SUBMITTED",
        "UNDER_REVIEW": "UNDER_REVIEW",
        "CORRECTION_REQUIRED": "RETURNED",
        "RESUBMITTED": "SUBMITTED",
        "TECHNICALLY_APPROVED": "UNDER_REVIEW",
        "FINAL_APPROVED": "APPROVED",
        "INTEGRATED": "APPROVED",
        "REJECTED": "RETURNED",
    }
    civil_status = mapping.get(workflow_status)
    if not civil_status:
        return
    now = _now()
    db.execute(
        """
        UPDATE civil_entries
        SET status=?,updated_at=?,reviewer_id=COALESCE(?,reviewer_id),review_comment=CASE WHEN ?<>'' THEN ? ELSE review_comment END,
            review_started_at=CASE WHEN ?='UNDER_REVIEW' THEN COALESCE(review_started_at,?) ELSE review_started_at END,
            reviewed_at=CASE WHEN ? IN ('RETURNED','APPROVED') THEN ? ELSE reviewed_at END
        WHERE public_id=?
        """,
        (
            civil_status,
            now,
            reviewer_id,
            remarks,
            remarks[:3000],
            civil_status,
            now,
            civil_status,
            now,
            row["source_ref"],
        ),
    )


def transition_workflow(
    user: AuthUser,
    workflow_public_id: str,
    action: str,
    *,
    comment: str = "",
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> dict[str, Any]:
    sync_workflows()
    action = action.strip().lower().replace("_", "-")
    comment = comment.strip()[:3000]
    with connect() as db:
        row = _workflow_by_public(db, workflow_public_id)
        old = row["current_status"]
        now = _now()
        updates: dict[str, Any] = {}

        if action == "submit":
            _assert_submit_owner(db, user, row)
            if old not in {"DRAFT", "CORRECTION_REQUIRED"}:
                raise ValueError("Only Draft or Correction Required data can be submitted")
            new = "SUBMITTED" if old == "DRAFT" else "RESUBMITTED"
            updates["submitted_at"] = now
        elif action == "resubmit":
            _assert_submit_owner(db, user, row)
            if old != "CORRECTION_REQUIRED":
                raise ValueError("Only Correction Required data can be resubmitted")
            new = "RESUBMITTED"
            updates["submitted_at"] = now
        elif action == "start-review":
            _assert_review_scope(db, user, row, "WORKFLOW.REVIEW")
            if old not in {"SUBMITTED", "RESUBMITTED"}:
                raise ValueError("Only Submitted or Resubmitted data can enter review")
            new = "UNDER_REVIEW"
            updates["technical_reviewer_id"] = user.id
            updates["review_started_at"] = now
        elif action == "return":
            _assert_review_scope(db, user, row, "WORKFLOW.RETURN")
            if old not in {"SUBMITTED", "RESUBMITTED", "UNDER_REVIEW"}:
                raise ValueError("Only submitted/review data can be returned")
            if not comment:
                raise ValueError("Correction comment is required")
            new = "CORRECTION_REQUIRED"
            updates["technical_reviewer_id"] = user.id
        elif action == "technical-approve":
            _assert_review_scope(db, user, row, "WORKFLOW.TECHNICAL_APPROVE")
            if old != "UNDER_REVIEW":
                raise ValueError("Technical approval requires Under Review status")
            new = "TECHNICALLY_APPROVED"
            updates["technical_reviewer_id"] = user.id
            updates["technical_approved_at"] = now
        elif action == "final-approve":
            _assert_review_scope(db, user, row, "WORKFLOW.FINAL_APPROVE")
            if old != "TECHNICALLY_APPROVED":
                raise ValueError("Final approval requires Technically Approved status")
            new = "FINAL_APPROVED"
            updates["final_approver_id"] = user.id
            updates["final_approved_at"] = now
        elif action == "integrate":
            _assert_review_scope(db, user, row, "WORKFLOW.INTEGRATE")
            if old != "FINAL_APPROVED":
                raise ValueError("Only Final Approved data can be integrated")
            new = "INTEGRATED"
            updates["integrated_at"] = now
        else:
            raise ValueError(
                "action must be submit, resubmit, start-review, return, technical-approve, final-approve or integrate"
            )

        assignments = ["current_status=?", "updated_at=?"]
        params: list[Any] = [new, now]
        for key, value in updates.items():
            assignments.append(f"{key}=?")
            params.append(value)
        params.append(row["id"])
        db.execute(
            "UPDATE dataset_workflow SET " + ",".join(assignments) + " WHERE id=?",
            params,
        )
        _history(db, row, user, action.upper().replace("-", "_"), old, new, comment)
        _mirror_source_status(db, row, new, user.id, comment)
        _audit(
            db,
            user,
            "WORKFLOW_" + action.upper().replace("-", "_"),
            "WORKFLOW",
            entity_type=row["source_type"],
            entity_ref=row["source_ref"],
            department_id=row["department_id"],
            details={"workflow_id": row["public_id"], "from": old, "to": new, "comment": comment},
            ip_address=ip_address,
            user_agent=user_agent,
        )

        if new in {"SUBMITTED", "RESUBMITTED"}:
            _notify(
                db,
                notification_type="REVIEW_REQUIRED",
                title="Dataset submitted for review",
                message=f"{row['source_ref']} is ready for Nakshatech technical review.",
                organization_id="ORG-NAKSHA",
                department_id=row["department_id"],
                related_type="WORKFLOW",
                related_ref=row["public_id"],
            )
        elif new == "CORRECTION_REQUIRED":
            _notify(
                db,
                notification_type="CORRECTION_REQUIRED",
                title="Correction required",
                message=f"{row['source_ref']} was returned for correction. {comment}"[:2000],
                user_id=row["created_by"],
                organization_id=row["owner_organization_id"],
                department_id=row["department_id"],
                related_type="WORKFLOW",
                related_ref=row["public_id"],
            )
        elif new == "TECHNICALLY_APPROVED":
            _notify(
                db,
                notification_type="FINAL_APPROVAL_REQUIRED",
                title="Technical review completed",
                message=f"{row['source_ref']} is ready for Nakshatech final approval.",
                organization_id="ORG-NAKSHA",
                related_type="WORKFLOW",
                related_ref=row["public_id"],
            )
        elif new in {"FINAL_APPROVED", "INTEGRATED"}:
            _notify(
                db,
                notification_type="APPROVED_OUTPUT",
                title="Approved project output",
                message=f"{row['source_ref']} is {new.replace('_', ' ').title()}.",
                organization_id="ORG-CNNL",
                related_type="WORKFLOW",
                related_ref=row["public_id"],
            )
        db.commit()
        updated = _workflow_by_public(db, workflow_public_id)
        return _workflow_row_to_dict(db, updated, include_history=True)


def _task_row_to_dict(db: sqlite3.Connection, row: sqlite3.Row, include_history: bool = True) -> dict[str, Any]:
    result = dict(row)
    result["assignments"] = [
        dict(item)
        for item in db.execute(
            """
            SELECT a.id,a.assignee_user_id,a.assignee_organization_id,a.assignee_department_id,
                   a.is_primary,a.active,a.assigned_at,u.display_name AS assignee_name,u.email AS assignee_email
            FROM task_assignments a
            LEFT JOIN users u ON u.id=a.assignee_user_id
            WHERE a.task_id=? AND a.active=1 ORDER BY a.is_primary DESC,a.id
            """,
            (row["id"],),
        ).fetchall()
    ]
    if include_history:
        result["history"] = [
            dict(item)
            for item in db.execute(
                """
                SELECT h.action,h.from_status,h.to_status,h.comment,h.performed_by,h.created_at,
                       u.display_name AS performed_by_name
                FROM task_history h LEFT JOIN users u ON u.id=h.performed_by
                WHERE h.task_id=? ORDER BY h.id
                """,
                (row["id"],),
            ).fetchall()
        ]
    result.pop("id", None)
    return result


def _task_by_public(db: sqlite3.Connection, public_id: str) -> sqlite3.Row:
    row = db.execute("SELECT * FROM tasks WHERE public_id=?", (public_id.strip(),)).fetchone()
    if not row:
        raise LookupError("Task not found")
    return row


def _task_visible(db: sqlite3.Connection, user: AuthUser, row: sqlite3.Row) -> bool:
    permissions = _permission_set(db, user)
    dep_scope = _department_scope(db, user)
    if "TASK.VIEW_ALL" in permissions:
        if dep_scope and row["department_id"] != dep_scope:
            return False
        return user.organization_type == "COMPANY"
    if "TASK.VIEW_ASSIGNED" not in permissions:
        return False
    assigned = db.execute(
        """
        SELECT 1 FROM task_assignments
        WHERE task_id=? AND active=1 AND (
            assignee_user_id=? OR assignee_organization_id=?
        ) LIMIT 1
        """,
        (row["id"], user.id, user.organization_id),
    ).fetchone()
    return bool(assigned)


def create_task(
    user: AuthUser,
    *,
    title: str,
    description: str = "",
    department_id: str | None = None,
    institution_id: str | None = None,
    micro_catchment_id: str | None = None,
    priority: str = "MEDIUM",
    due_date: str | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> dict[str, Any]:
    require_permission(user, "TASK.CREATE")
    title = title.strip()[:240]
    if not title:
        raise ValueError("Task title is required")
    priority = priority.strip().upper() or "MEDIUM"
    if priority not in PRIORITIES:
        raise ValueError("priority must be LOW, MEDIUM, HIGH or CRITICAL")
    department_id = (department_id or "").strip().upper() or None
    institution_id = (institution_id or "").strip().upper() or None
    if department_id and institution_id:
        raise ValueError("Assign task scope to either a department or an institution, not both")
    now = _now()
    with connect() as db:
        if department_id and not db.execute(
            "SELECT 1 FROM project_departments WHERE id=? AND active=1", (department_id,)
        ).fetchone():
            raise ValueError("Unknown department_id")
        if institution_id and not db.execute(
            "SELECT 1 FROM organizations WHERE id=? AND org_type='INSTITUTION' AND active=1", (institution_id,)
        ).fetchone():
            raise ValueError("Unknown institution_id")
        cur = db.execute(
            """
            INSERT INTO tasks(
                public_id,title,description,created_by,owner_organization_id,department_id,institution_id,
                micro_catchment_id,priority,status,due_date,created_at,updated_at
            ) VALUES(?,?,?,?,?,?,?,?,?,'DRAFT',?,?,?)
            """,
            (
                _public("TASK"),
                title,
                description.strip()[:5000],
                user.id,
                "ORG-NAKSHA",
                department_id,
                institution_id,
                (micro_catchment_id or "").strip()[:80] or None,
                priority,
                (due_date or "").strip()[:40] or None,
                now,
                now,
            ),
        )
        task_id = int(cur.lastrowid)
        db.execute(
            "INSERT INTO task_history(task_id,action,from_status,to_status,comment,performed_by,created_at) VALUES(?,?,'',?,'',?,?)",
            (task_id, "CREATED", "DRAFT", user.id, now),
        )
        row = db.execute("SELECT * FROM tasks WHERE id=?", (task_id,)).fetchone()
        _audit(
            db,
            user,
            "TASK_CREATED",
            "TASK",
            entity_type="TASK",
            entity_ref=row["public_id"],
            department_id=department_id,
            details={"title": title, "priority": priority},
            ip_address=ip_address,
            user_agent=user_agent,
        )
        db.commit()
        return _task_row_to_dict(db, row, include_history=True)


def assign_task(
    user: AuthUser,
    task_public_id: str,
    *,
    assignee_user_id: int | None = None,
    assignee_organization_id: str | None = None,
    assignee_department_id: str | None = None,
    primary: bool = True,
    comment: str = "",
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> dict[str, Any]:
    require_permission(user, "TASK.ASSIGN")
    if not any([assignee_user_id, assignee_organization_id, assignee_department_id]):
        raise ValueError("An assignee user, organization or department is required")
    with connect() as db:
        row = _task_by_public(db, task_public_id)
        if assignee_user_id and not db.execute("SELECT 1 FROM users WHERE id=? AND active=1", (int(assignee_user_id),)).fetchone():
            raise ValueError("Unknown assignee_user_id")
        if assignee_organization_id and not db.execute("SELECT 1 FROM organizations WHERE id=? AND active=1", (assignee_organization_id,)).fetchone():
            raise ValueError("Unknown assignee_organization_id")
        if assignee_department_id and not db.execute("SELECT 1 FROM project_departments WHERE id=? AND active=1", (assignee_department_id,)).fetchone():
            raise ValueError("Unknown assignee_department_id")
        now = _now()
        if primary:
            db.execute("UPDATE task_assignments SET is_primary=0 WHERE task_id=?", (row["id"],))
        db.execute(
            """
            INSERT OR IGNORE INTO task_assignments(
                task_id,assignee_user_id,assignee_organization_id,assignee_department_id,assigned_by,is_primary,active,assigned_at
            ) VALUES(?,?,?,?,?,?,1,?)
            """,
            (
                row["id"],
                int(assignee_user_id) if assignee_user_id else None,
                (assignee_organization_id or "").strip() or None,
                (assignee_department_id or "").strip().upper() or None,
                user.id,
                1 if primary else 0,
                now,
            ),
        )
        old = row["status"]
        if old == "DRAFT":
            db.execute("UPDATE tasks SET status='ASSIGNED',updated_at=? WHERE id=?", (now, row["id"]))
            new = "ASSIGNED"
        else:
            db.execute("UPDATE tasks SET updated_at=? WHERE id=?", (now, row["id"]))
            new = old
        db.execute(
            "INSERT INTO task_history(task_id,action,from_status,to_status,comment,performed_by,created_at) VALUES(?,?,?,?,?,?,?)",
            (row["id"], "ASSIGNED", old, new, comment.strip()[:3000], user.id, now),
        )
        _notify(
            db,
            notification_type="TASK_ASSIGNED",
            title="Arkavathi task assigned",
            message=f"Task {row['public_id']}: {row['title']}",
            user_id=int(assignee_user_id) if assignee_user_id else None,
            organization_id=(assignee_organization_id or None),
            department_id=(assignee_department_id or row["department_id"]),
            related_type="TASK",
            related_ref=row["public_id"],
        )
        _audit(
            db,
            user,
            "TASK_ASSIGNED",
            "TASK",
            entity_type="TASK",
            entity_ref=row["public_id"],
            department_id=row["department_id"],
            details={
                "assignee_user_id": assignee_user_id,
                "assignee_organization_id": assignee_organization_id,
                "assignee_department_id": assignee_department_id,
            },
            ip_address=ip_address,
            user_agent=user_agent,
        )
        db.commit()
        updated = _task_by_public(db, task_public_id)
        return _task_row_to_dict(db, updated, include_history=True)


def list_tasks(user: AuthUser, *, status: str | None = None, department_id: str | None = None) -> list[dict[str, Any]]:
    ensure_phase2_ready()
    with connect() as db:
        permissions = _permission_set(db, user)
        if not ({"TASK.VIEW_ALL", "TASK.VIEW_ASSIGNED"} & permissions):
            raise PermissionError("Task view permission required")
        where: list[str] = ["1=1"]
        params: list[Any] = []
        if status:
            st = status.strip().upper()
            if st not in TASK_STATUSES:
                raise ValueError("Unknown task status")
            where.append("t.status=?")
            params.append(st)
        dep_scope = _department_scope(db, user)
        if dep_scope:
            where.append("t.department_id=?")
            params.append(dep_scope)
        elif department_id and "TASK.VIEW_ALL" in permissions:
            where.append("t.department_id=?")
            params.append(department_id.strip().upper())
        if "TASK.VIEW_ALL" not in permissions:
            where.append(
                "EXISTS (SELECT 1 FROM task_assignments a WHERE a.task_id=t.id AND a.active=1 AND (a.assignee_user_id=? OR a.assignee_organization_id=?))"
            )
            params.extend([user.id, user.organization_id])
        rows = db.execute(
            "SELECT t.* FROM tasks t WHERE " + " AND ".join(where) + " ORDER BY t.updated_at DESC,t.id DESC",
            params,
        ).fetchall()
        return [_task_row_to_dict(db, row, include_history=False) for row in rows]


def get_task(user: AuthUser, task_public_id: str) -> dict[str, Any]:
    ensure_phase2_ready()
    with connect() as db:
        row = _task_by_public(db, task_public_id)
        if not _task_visible(db, user, row):
            raise LookupError("Task not found")
        return _task_row_to_dict(db, row, include_history=True)


def _task_assignee_or_controller(db: sqlite3.Connection, user: AuthUser, row: sqlite3.Row) -> bool:
    permissions = _permission_set(db, user)
    # Project controllers may intervene in an assigned task; technical reviewers
    # cannot impersonate the assignee simply because they can view all tasks.
    if ({"TASK.ASSIGN", "TASK.APPROVE"} & permissions) and user.organization_type == "COMPANY":
        dep_scope = _department_scope(db, user)
        return not dep_scope or row["department_id"] == dep_scope
    return bool(
        db.execute(
            """
            SELECT 1 FROM task_assignments WHERE task_id=? AND active=1
            AND (assignee_user_id=? OR assignee_organization_id=?) LIMIT 1
            """,
            (row["id"], user.id, user.organization_id),
        ).fetchone()
    )


def transition_task(
    user: AuthUser,
    task_public_id: str,
    action: str,
    *,
    comment: str = "",
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> dict[str, Any]:
    action = action.strip().lower().replace("_", "-")
    comment = comment.strip()[:3000]
    with connect() as db:
        row = _task_by_public(db, task_public_id)
        old = row["status"]
        permissions = _permission_set(db, user)
        now = _now()
        approved_at = None
        completed_at = None

        if action == "start":
            if "TASK.UPDATE_ASSIGNED" not in permissions and not _task_assignee_or_controller(db, user, row):
                raise PermissionError("Assigned-task update permission required")
            if not _task_assignee_or_controller(db, user, row):
                raise PermissionError("Task is not assigned to this account")
            if old not in {"ASSIGNED", "CORRECTION_REQUIRED"}:
                raise ValueError("Only Assigned or Correction Required tasks can be started")
            new = "IN_PROGRESS"
        elif action == "submit":
            if "TASK.UPDATE_ASSIGNED" not in permissions and not _task_assignee_or_controller(db, user, row):
                raise PermissionError("Assigned-task update permission required")
            if not _task_assignee_or_controller(db, user, row):
                raise PermissionError("Task is not assigned to this account")
            if old not in {"IN_PROGRESS", "CORRECTION_REQUIRED"}:
                raise ValueError("Only In Progress or Correction Required tasks can be submitted")
            new = "RESUBMITTED" if old == "CORRECTION_REQUIRED" else "SUBMITTED"
        elif action == "review":
            if "TASK.REVIEW" not in permissions:
                raise PermissionError("Permission required: TASK.REVIEW")
            dep_scope = _department_scope(db, user)
            if dep_scope and row["department_id"] != dep_scope:
                raise PermissionError(f"Reviewer is restricted to {dep_scope} tasks")
            if old not in {"SUBMITTED", "RESUBMITTED"}:
                raise ValueError("Only Submitted/Resubmitted tasks can enter review")
            new = "UNDER_REVIEW"
        elif action == "return":
            if "TASK.REVIEW" not in permissions:
                raise PermissionError("Permission required: TASK.REVIEW")
            dep_scope = _department_scope(db, user)
            if dep_scope and row["department_id"] != dep_scope:
                raise PermissionError(f"Reviewer is restricted to {dep_scope} tasks")
            if old not in {"SUBMITTED", "RESUBMITTED", "UNDER_REVIEW"}:
                raise ValueError("Task is not currently reviewable")
            if not comment:
                raise ValueError("Return comment is required")
            new = "CORRECTION_REQUIRED"
        elif action == "approve":
            if "TASK.APPROVE" not in permissions:
                raise PermissionError("Permission required: TASK.APPROVE")
            if old != "UNDER_REVIEW":
                raise ValueError("Task approval requires Under Review status")
            new = "APPROVED"
            approved_at = now
        elif action == "complete":
            if "TASK.APPROVE" not in permissions:
                raise PermissionError("Permission required: TASK.APPROVE")
            if old != "APPROVED":
                raise ValueError("Only Approved tasks can be completed")
            new = "COMPLETED"
            completed_at = now
        else:
            raise ValueError("action must be start, submit, review, return, approve or complete")

        db.execute(
            """
            UPDATE tasks SET status=?,updated_at=?,
                submitted_at=CASE WHEN ? IN ('SUBMITTED','RESUBMITTED') THEN ? ELSE submitted_at END,
                approved_at=COALESCE(?,approved_at),completed_at=COALESCE(?,completed_at)
            WHERE id=?
            """,
            (new, now, new, now, approved_at, completed_at, row["id"]),
        )
        db.execute(
            "INSERT INTO task_history(task_id,action,from_status,to_status,comment,performed_by,created_at) VALUES(?,?,?,?,?,?,?)",
            (row["id"], action.upper().replace("-", "_"), old, new, comment, user.id, now),
        )
        if new in {"SUBMITTED", "RESUBMITTED"}:
            _notify(
                db,
                notification_type="TASK_REVIEW_REQUIRED",
                title="Task submitted for review",
                message=f"Task {row['public_id']} was submitted for Nakshatech review.",
                organization_id="ORG-NAKSHA",
                department_id=row["department_id"],
                related_type="TASK",
                related_ref=row["public_id"],
            )
        elif new == "CORRECTION_REQUIRED":
            assignments = db.execute(
                "SELECT assignee_user_id,assignee_organization_id,assignee_department_id FROM task_assignments WHERE task_id=? AND active=1",
                (row["id"],),
            ).fetchall()
            for assignment in assignments:
                _notify(
                    db,
                    notification_type="TASK_CORRECTION_REQUIRED",
                    title="Task correction required",
                    message=f"Task {row['public_id']} was returned. {comment}"[:2000],
                    user_id=assignment["assignee_user_id"],
                    organization_id=assignment["assignee_organization_id"],
                    department_id=assignment["assignee_department_id"],
                    related_type="TASK",
                    related_ref=row["public_id"],
                )
        _audit(
            db,
            user,
            "TASK_" + action.upper().replace("-", "_"),
            "TASK",
            entity_type="TASK",
            entity_ref=row["public_id"],
            department_id=row["department_id"],
            details={"from": old, "to": new, "comment": comment},
            ip_address=ip_address,
            user_agent=user_agent,
        )
        db.commit()
        updated = _task_by_public(db, task_public_id)
        return _task_row_to_dict(db, updated, include_history=True)


def list_notifications(user: AuthUser, *, unread_only: bool = False, limit: int = 200) -> list[dict[str, Any]]:
    require_permission(user, "NOTIFICATION.VIEW")
    limit = max(1, min(int(limit), 1000))
    with connect() as db:
        dep_scope = _department_scope(db, user)
        where = ["(n.user_id=? OR (n.user_id IS NULL AND n.organization_id=?))"]
        params: list[Any] = [user.id, user.organization_id]
        if dep_scope:
            where.append("(n.department_id IS NULL OR n.department_id=?)")
            params.append(dep_scope)
        if unread_only:
            where.append("n.is_read=0")
        params.append(limit)
        rows = db.execute(
            "SELECT n.* FROM notifications n WHERE " + " AND ".join(where) + " ORDER BY n.created_at DESC,n.id DESC LIMIT ?",
            params,
        ).fetchall()
        return [dict(row) for row in rows]


def mark_notification_read(user: AuthUser, notification_public_id: str) -> dict[str, Any]:
    require_permission(user, "NOTIFICATION.VIEW")
    with connect() as db:
        dep_scope = _department_scope(db, user)
        row = db.execute("SELECT * FROM notifications WHERE public_id=?", (notification_public_id,)).fetchone()
        if not row:
            raise LookupError("Notification not found")
        visible = row["user_id"] == user.id or (row["user_id"] is None and row["organization_id"] == user.organization_id)
        if dep_scope and row["department_id"] and row["department_id"] != dep_scope:
            visible = False
        if not visible:
            raise LookupError("Notification not found")
        now = _now()
        db.execute("UPDATE notifications SET is_read=1,read_at=? WHERE id=?", (now, row["id"]))
        db.commit()
        return {"public_id": notification_public_id, "is_read": True, "read_at": now}


def list_audit(user: AuthUser, *, limit: int = 200, module: str | None = None) -> list[dict[str, Any]]:
    require_permission(user, "AUDIT.VIEW")
    limit = max(1, min(int(limit), 2000))
    with connect() as db:
        dep_scope = _department_scope(db, user)
        where = ["1=1"]
        params: list[Any] = []
        if dep_scope:
            where.append("a.department_id=?")
            params.append(dep_scope)
        if module:
            where.append("a.module=?")
            params.append(module.strip().upper())
        params.append(limit)
        rows = db.execute(
            """
            SELECT a.*,u.display_name AS user_name,u.email AS user_email
            FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id
            WHERE """ + " AND ".join(where) + " ORDER BY a.occurred_at DESC,a.id DESC LIMIT ?",
            params,
        ).fetchall()
        return [dict(row) for row in rows]
