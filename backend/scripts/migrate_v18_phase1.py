from __future__ import annotations

import argparse
import json
import sqlite3
from datetime import datetime
from pathlib import Path

MIGRATION_ID = "v18_phase1_permission_task_approval"

ROLES = [
    ("COMPANY_ADMIN", "Nakshatech Super Admin", "COMPANY", None, "Full project administration, approval and integration"),
    ("COMPANY_PROJECT_MANAGER", "Nakshatech Project Manager", "COMPANY", None, "Project-wide task, review and final approval control"),
    ("COMPANY_REVIEWER", "Nakshatech Technical Reviewer", "COMPANY", None, "Project-wide technical review"),
    ("COMPANY_DATA_MANAGER", "Nakshatech Data Manager", "COMPANY", None, "Repository and metadata management"),
    ("COMPANY_DEPARTMENT_USER", "Nakshatech Department User", "COMPANY", None, "Department-scoped uploader"),
    ("COMPANY_VIEWER", "Nakshatech Viewer", "COMPANY", None, "Read-only company access"),
    ("COMPANY_CIVIL_REVIEWER", "Civil Reviewer", "COMPANY", "CIVIL", "Technical review limited to Civil"),
    ("COMPANY_GIS_REVIEWER", "GIS Reviewer", "COMPANY", "GIS", "Technical review limited to GIS"),
    ("COMPANY_SURVEY_REVIEWER", "Survey Reviewer", "COMPANY", "SURVEY", "Technical review limited to Survey"),
    ("COMPANY_LIDAR_REVIEWER", "LiDAR Reviewer", "COMPANY", "LIDAR", "Technical review limited to LiDAR"),
    ("COMPANY_PHOTOGRAMMETRY_REVIEWER", "Photogrammetry Reviewer", "COMPANY", "PHOTOGRAMMETRY", "Technical review limited to Photogrammetry"),
    ("CNNL_ADMIN", "CNNL Admin", "CNNL", None, "Approved project monitoring"),
    ("CNNL_OFFICIAL", "CNNL Official", "CNNL", None, "Approved executive project view"),
    ("CNNL_VIEWER", "CNNL Viewer", "CNNL", None, "Read-only approved project view"),
    ("INSTITUTION_ADMIN", "Institution Admin", "INSTITUTION", None, "Own micro-catchment administration and submission"),
    ("INSTITUTION_USER", "Institution User", "INSTITUTION", None, "Own micro-catchment data entry and submission"),
    ("INSTITUTION_VIEWER", "Institution Viewer", "INSTITUTION", None, "Read-only own micro-catchment access"),
]

PERMISSIONS = [
    ("AUTH.MANAGE_USERS", "Create, update and manage project users"),
    ("AUTH.MANAGE_PERMISSIONS", "Manage roles and permissions"),
    ("TASK.CREATE", "Create project tasks"),
    ("TASK.ASSIGN", "Assign project tasks"),
    ("TASK.VIEW_ALL", "View all project tasks"),
    ("TASK.VIEW_ASSIGNED", "View tasks assigned to the current user or scope"),
    ("TASK.UPDATE_ASSIGNED", "Update assigned task progress"),
    ("TASK.REVIEW", "Review submitted task output"),
    ("TASK.APPROVE", "Approve submitted task output"),
    ("REPOSITORY.UPLOAD", "Upload project repository data"),
    ("REPOSITORY.VIEW_OWN_DEPARTMENT", "View repository data for an authorized department"),
    ("REPOSITORY.VIEW_ALL", "View all Nakshatech repository data"),
    ("REPOSITORY.DOWNLOAD_OWN", "Download authorized department data"),
    ("REPOSITORY.DOWNLOAD_ALL", "Download project-wide repository data"),
    ("WORKFLOW.SUBMIT", "Submit data for technical review"),
    ("WORKFLOW.REVIEW", "Start and perform technical review"),
    ("WORKFLOW.RETURN", "Return data for correction"),
    ("WORKFLOW.TECHNICAL_APPROVE", "Technically approve reviewed data"),
    ("WORKFLOW.FINAL_APPROVE", "Give Nakshatech final approval"),
    ("WORKFLOW.INTEGRATE", "Mark final-approved data as integrated"),
    ("INSTITUTION.VIEW_OWN", "View assigned institution/micro-catchment data"),
    ("INSTITUTION.EDIT_OWN", "Edit assigned institution/micro-catchment data"),
    ("INSTITUTION.SUBMIT_OWN", "Submit assigned institution data"),
    ("CNNL.VIEW_APPROVED", "View approved/integrated project outputs"),
    ("REPORT.DOWNLOAD_APPROVED", "Download approved project reports and outputs"),
    ("AUDIT.VIEW", "View project audit history"),
    ("NOTIFICATION.VIEW", "View workflow and task notifications"),
]

ROLE_PERMISSIONS = {
    "COMPANY_ADMIN": [p[0] for p in PERMISSIONS],
    "COMPANY_PROJECT_MANAGER": [
        "TASK.CREATE", "TASK.ASSIGN", "TASK.VIEW_ALL", "TASK.REVIEW", "TASK.APPROVE",
        "REPOSITORY.VIEW_ALL", "REPOSITORY.DOWNLOAD_ALL",
        "WORKFLOW.REVIEW", "WORKFLOW.RETURN", "WORKFLOW.TECHNICAL_APPROVE",
        "WORKFLOW.FINAL_APPROVE", "WORKFLOW.INTEGRATE",
        "AUDIT.VIEW", "NOTIFICATION.VIEW", "REPORT.DOWNLOAD_APPROVED",
    ],
    "COMPANY_REVIEWER": [
        "TASK.VIEW_ALL", "TASK.REVIEW", "REPOSITORY.VIEW_ALL", "REPOSITORY.DOWNLOAD_ALL",
        "WORKFLOW.REVIEW", "WORKFLOW.RETURN", "WORKFLOW.TECHNICAL_APPROVE",
        "NOTIFICATION.VIEW", "REPORT.DOWNLOAD_APPROVED",
    ],
    "COMPANY_DATA_MANAGER": [
        "TASK.VIEW_ALL", "REPOSITORY.UPLOAD", "REPOSITORY.VIEW_ALL", "REPOSITORY.DOWNLOAD_ALL",
        "WORKFLOW.SUBMIT", "AUDIT.VIEW", "NOTIFICATION.VIEW",
    ],
    "COMPANY_DEPARTMENT_USER": [
        "TASK.VIEW_ASSIGNED", "TASK.UPDATE_ASSIGNED", "REPOSITORY.UPLOAD",
        "REPOSITORY.VIEW_OWN_DEPARTMENT", "REPOSITORY.DOWNLOAD_OWN", "WORKFLOW.SUBMIT",
        "NOTIFICATION.VIEW",
    ],
    "COMPANY_VIEWER": ["REPOSITORY.VIEW_ALL", "TASK.VIEW_ALL", "NOTIFICATION.VIEW"],
    "CNNL_ADMIN": ["CNNL.VIEW_APPROVED", "REPORT.DOWNLOAD_APPROVED", "NOTIFICATION.VIEW"],
    "CNNL_OFFICIAL": ["CNNL.VIEW_APPROVED", "REPORT.DOWNLOAD_APPROVED", "NOTIFICATION.VIEW"],
    "CNNL_VIEWER": ["CNNL.VIEW_APPROVED", "REPORT.DOWNLOAD_APPROVED"],
    "INSTITUTION_ADMIN": [
        "TASK.VIEW_ASSIGNED", "TASK.UPDATE_ASSIGNED", "INSTITUTION.VIEW_OWN", "INSTITUTION.EDIT_OWN",
        "INSTITUTION.SUBMIT_OWN", "WORKFLOW.SUBMIT", "NOTIFICATION.VIEW",
    ],
    "INSTITUTION_USER": [
        "TASK.VIEW_ASSIGNED", "TASK.UPDATE_ASSIGNED", "INSTITUTION.VIEW_OWN", "INSTITUTION.EDIT_OWN",
        "INSTITUTION.SUBMIT_OWN", "WORKFLOW.SUBMIT", "NOTIFICATION.VIEW",
    ],
    "INSTITUTION_VIEWER": ["TASK.VIEW_ASSIGNED", "INSTITUTION.VIEW_OWN", "NOTIFICATION.VIEW"],
}

for reviewer_role in [
    "COMPANY_CIVIL_REVIEWER",
    "COMPANY_GIS_REVIEWER",
    "COMPANY_SURVEY_REVIEWER",
    "COMPANY_LIDAR_REVIEWER",
    "COMPANY_PHOTOGRAMMETRY_REVIEWER",
]:
    ROLE_PERMISSIONS[reviewer_role] = [
        "TASK.VIEW_ALL", "TASK.REVIEW",
        "REPOSITORY.VIEW_OWN_DEPARTMENT", "REPOSITORY.DOWNLOAD_OWN",
        "WORKFLOW.REVIEW", "WORKFLOW.RETURN", "WORKFLOW.TECHNICAL_APPROVE",
        "NOTIFICATION.VIEW",
    ]


def table_exists(db: sqlite3.Connection, name: str) -> bool:
    return db.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,)
    ).fetchone() is not None


def now() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


def create_schema(db: sqlite3.Connection) -> None:
    db.executescript(
        """
        CREATE TABLE IF NOT EXISTS schema_migrations (
            migration_id TEXT PRIMARY KEY,
            applied_at TEXT NOT NULL,
            details_json TEXT
        );

        CREATE TABLE IF NOT EXISTS roles (
            role_code TEXT PRIMARY KEY,
            display_name TEXT NOT NULL,
            organization_type TEXT NOT NULL CHECK(organization_type IN ('COMPANY','CNNL','INSTITUTION')),
            department_scope TEXT,
            description TEXT,
            active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS permissions (
            permission_code TEXT PRIMARY KEY,
            description TEXT NOT NULL,
            active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS role_permissions (
            role_code TEXT NOT NULL REFERENCES roles(role_code) ON DELETE CASCADE,
            permission_code TEXT NOT NULL REFERENCES permissions(permission_code) ON DELETE CASCADE,
            created_at TEXT NOT NULL,
            PRIMARY KEY(role_code, permission_code)
        );

        CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            public_id TEXT NOT NULL UNIQUE,
            project_code TEXT NOT NULL DEFAULT 'ARKAVATHI',
            title TEXT NOT NULL,
            description TEXT,
            created_by INTEGER NOT NULL REFERENCES users(id),
            owner_organization_id TEXT,
            department_id TEXT,
            institution_id TEXT,
            micro_catchment_id TEXT,
            priority TEXT NOT NULL DEFAULT 'MEDIUM' CHECK(priority IN ('LOW','MEDIUM','HIGH','CRITICAL')),
            status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN (
                'DRAFT','ASSIGNED','IN_PROGRESS','SUBMITTED','UNDER_REVIEW',
                'CORRECTION_REQUIRED','RESUBMITTED','APPROVED','COMPLETED','CANCELLED'
            )),
            due_date TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            submitted_at TEXT,
            approved_at TEXT,
            completed_at TEXT
        );

        CREATE TABLE IF NOT EXISTS task_assignments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
            assignee_user_id INTEGER REFERENCES users(id),
            assignee_organization_id TEXT,
            assignee_department_id TEXT,
            assigned_by INTEGER NOT NULL REFERENCES users(id),
            is_primary INTEGER NOT NULL DEFAULT 0,
            active INTEGER NOT NULL DEFAULT 1,
            assigned_at TEXT NOT NULL,
            UNIQUE(task_id, assignee_user_id, assignee_organization_id, assignee_department_id)
        );

        CREATE TABLE IF NOT EXISTS task_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
            action TEXT NOT NULL,
            from_status TEXT,
            to_status TEXT,
            comment TEXT,
            performed_by INTEGER REFERENCES users(id),
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS dataset_workflow (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            public_id TEXT NOT NULL UNIQUE,
            source_type TEXT NOT NULL,
            source_ref TEXT NOT NULL,
            owner_organization_id TEXT,
            department_id TEXT,
            institution_id TEXT,
            micro_catchment_id TEXT,
            current_status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(current_status IN (
                'DRAFT','SUBMITTED','UNDER_REVIEW','CORRECTION_REQUIRED','RESUBMITTED',
                'TECHNICALLY_APPROVED','FINAL_APPROVED','INTEGRATED','REJECTED'
            )),
            created_by INTEGER REFERENCES users(id),
            technical_reviewer_id INTEGER REFERENCES users(id),
            final_approver_id INTEGER REFERENCES users(id),
            submitted_at TEXT,
            review_started_at TEXT,
            technical_approved_at TEXT,
            final_approved_at TEXT,
            integrated_at TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(source_type, source_ref)
        );

        CREATE TABLE IF NOT EXISTS approval_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            workflow_id INTEGER NOT NULL REFERENCES dataset_workflow(id) ON DELETE CASCADE,
            action TEXT NOT NULL,
            from_status TEXT,
            to_status TEXT,
            performed_by INTEGER REFERENCES users(id),
            reviewer_role TEXT,
            remarks TEXT,
            details_json TEXT,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            public_id TEXT NOT NULL UNIQUE,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            organization_id TEXT,
            department_id TEXT,
            notification_type TEXT NOT NULL,
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            related_type TEXT,
            related_ref TEXT,
            is_read INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            read_at TEXT
        );

        CREATE TABLE IF NOT EXISTS audit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            public_id TEXT NOT NULL UNIQUE,
            user_id INTEGER REFERENCES users(id),
            organization_id TEXT,
            department_id TEXT,
            action TEXT NOT NULL,
            module TEXT NOT NULL,
            entity_type TEXT,
            entity_ref TEXT,
            details_json TEXT,
            ip_address TEXT,
            user_agent TEXT,
            occurred_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_tasks_status_due ON tasks(status, due_date);
        CREATE INDEX IF NOT EXISTS idx_tasks_department ON tasks(department_id, status);
        CREATE INDEX IF NOT EXISTS idx_task_assignments_user ON task_assignments(assignee_user_id, active);
        CREATE INDEX IF NOT EXISTS idx_workflow_status ON dataset_workflow(current_status, updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_workflow_department ON dataset_workflow(department_id, current_status);
        CREATE INDEX IF NOT EXISTS idx_workflow_institution ON dataset_workflow(institution_id, current_status);
        CREATE INDEX IF NOT EXISTS idx_approval_workflow_time ON approval_history(workflow_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, is_read, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_logs(occurred_at DESC);
        CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_ref);
        """
    )


def seed_rbac(db: sqlite3.Connection) -> None:
    ts = now()
    for role_code, display_name, org_type, department_scope, description in ROLES:
        db.execute(
            """
            INSERT INTO roles(role_code,display_name,organization_type,department_scope,description,active,created_at,updated_at)
            VALUES(?,?,?,?,?,1,?,?)
            ON CONFLICT(role_code) DO UPDATE SET
              display_name=excluded.display_name,
              organization_type=excluded.organization_type,
              department_scope=excluded.department_scope,
              description=excluded.description,
              active=1,
              updated_at=excluded.updated_at
            """,
            (role_code, display_name, org_type, department_scope, description, ts, ts),
        )

    for permission_code, description in PERMISSIONS:
        db.execute(
            """
            INSERT INTO permissions(permission_code,description,active,created_at,updated_at)
            VALUES(?,?,1,?,?)
            ON CONFLICT(permission_code) DO UPDATE SET
              description=excluded.description,
              active=1,
              updated_at=excluded.updated_at
            """,
            (permission_code, description, ts, ts),
        )

    for role_code, permission_codes in ROLE_PERMISSIONS.items():
        for permission_code in permission_codes:
            db.execute(
                "INSERT OR IGNORE INTO role_permissions(role_code,permission_code,created_at) VALUES(?,?,?)",
                (role_code, permission_code, ts),
            )


def backfill_repository(db: sqlite3.Connection) -> int:
    if not table_exists(db, "repository_batches"):
        return 0
    rows = db.execute(
        """
        SELECT public_id, department_id, status, created_by, created_at, completed_at
        FROM repository_batches
        WHERE public_id IS NOT NULL
        """
    ).fetchall()
    count = 0
    ts = now()
    for row in rows:
        status = "SUBMITTED" if row[2] == "COMPLETE" else "DRAFT"
        submitted_at = row[5] or row[4] if status == "SUBMITTED" else None
        cur = db.execute(
            """
            INSERT OR IGNORE INTO dataset_workflow(
                public_id,source_type,source_ref,owner_organization_id,department_id,current_status,
                created_by,submitted_at,created_at,updated_at
            ) VALUES(?,?,?,?,?,?,?,?,?,?)
            """,
            (
                "WF-REPO-" + row[0], "REPOSITORY_BATCH", row[0], "ORG-NAKSHA", row[1], status,
                row[3], submitted_at, row[4] or ts, ts,
            ),
        )
        count += max(cur.rowcount, 0)
    return count


def map_civil_status(value: str) -> str:
    return {
        "DRAFT": "DRAFT",
        "SUBMITTED": "SUBMITTED",
        "UNDER_REVIEW": "UNDER_REVIEW",
        "RETURNED": "CORRECTION_REQUIRED",
        "APPROVED": "FINAL_APPROVED",
    }.get((value or "").upper(), "DRAFT")


def backfill_institution_entries(db: sqlite3.Connection) -> int:
    if not table_exists(db, "civil_entries"):
        return 0
    rows = db.execute(
        """
        SELECT public_id,institution_id,status,created_by,created_at,updated_at,submitted_at,
               review_started_at,reviewed_at,reviewer_id
        FROM civil_entries
        WHERE public_id IS NOT NULL
        """
    ).fetchall()
    count = 0
    ts = now()
    for row in rows:
        status = map_civil_status(row[2])
        final_at = row[8] if status == "FINAL_APPROVED" else None
        cur = db.execute(
            """
            INSERT OR IGNORE INTO dataset_workflow(
                public_id,source_type,source_ref,owner_organization_id,institution_id,current_status,
                created_by,technical_reviewer_id,final_approver_id,submitted_at,review_started_at,
                final_approved_at,created_at,updated_at
            ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            (
                "WF-INST-" + row[0], "INSTITUTION_ENTRY", row[0], row[1], row[1], status,
                row[3], row[9], row[9] if final_at else None, row[6], row[7], final_at,
                row[4] or ts, row[5] or ts,
            ),
        )
        count += max(cur.rowcount, 0)
    return count


def verify(db: sqlite3.Connection) -> dict[str, object]:
    required_tables = [
        "roles", "permissions", "role_permissions", "tasks", "task_assignments", "task_history",
        "dataset_workflow", "approval_history", "notifications", "audit_logs",
    ]
    missing = [name for name in required_tables if not table_exists(db, name)]
    role_count = db.execute("SELECT COUNT(*) FROM roles WHERE active=1").fetchone()[0] if not missing else 0
    permission_count = db.execute("SELECT COUNT(*) FROM permissions WHERE active=1").fetchone()[0] if not missing else 0
    mapping_count = db.execute("SELECT COUNT(*) FROM role_permissions").fetchone()[0] if not missing else 0
    workflow_count = db.execute("SELECT COUNT(*) FROM dataset_workflow").fetchone()[0] if not missing else 0
    return {
        "schema": "PASS" if not missing else "FAIL",
        "missing_tables": missing,
        "roles": role_count,
        "permissions": permission_count,
        "role_permission_mappings": mapping_count,
        "workflow_items": workflow_count,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", required=True)
    parser.add_argument("--verify", action="store_true")
    args = parser.parse_args()

    db_path = Path(args.db).resolve()
    if not db_path.exists():
        raise SystemExit(f"Database not found: {db_path}")

    db = sqlite3.connect(db_path)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys=ON")
    try:
        if not args.verify:
            db.execute("BEGIN")
            create_schema(db)
            seed_rbac(db)
            repo_backfill = backfill_repository(db)
            inst_backfill = backfill_institution_entries(db)
            db.execute(
                """
                INSERT INTO schema_migrations(migration_id,applied_at,details_json)
                VALUES(?,?,?)
                ON CONFLICT(migration_id) DO UPDATE SET
                  applied_at=excluded.applied_at,
                  details_json=excluded.details_json
                """,
                (MIGRATION_ID, now(), json.dumps({"repository_backfill": repo_backfill, "institution_backfill": inst_backfill})),
            )
            db.commit()
            print("V18_PHASE1_MIGRATION=PASS")
            print(f"REPOSITORY_WORKFLOWS_ADDED={repo_backfill}")
            print(f"INSTITUTION_WORKFLOWS_ADDED={inst_backfill}")

        result = verify(db)
        print("V18_PERMISSION_SCHEMA=" + str(result["schema"]))
        print("ROLES=" + str(result["roles"]))
        print("PERMISSIONS=" + str(result["permissions"]))
        print("ROLE_PERMISSION_MAPPINGS=" + str(result["role_permission_mappings"]))
        print("WORKFLOW_ITEMS=" + str(result["workflow_items"]))
        if result["missing_tables"]:
            print("MISSING_TABLES=" + ",".join(result["missing_tables"]))
            return 2
        if result["roles"] < len(ROLES) or result["permissions"] < len(PERMISSIONS):
            return 3
        return 0
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
