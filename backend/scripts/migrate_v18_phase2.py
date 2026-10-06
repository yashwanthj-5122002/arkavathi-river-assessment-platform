from __future__ import annotations

import argparse
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

MIGRATION_ID = "v18_phase2_secured_task_review_approval_api"
REQUIRED_TABLES = [
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
]


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def table_exists(db: sqlite3.Connection, name: str) -> bool:
    return db.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,)
    ).fetchone() is not None


def verify(db: sqlite3.Connection) -> dict[str, object]:
    missing = [name for name in REQUIRED_TABLES if not table_exists(db, name)]
    role_count = db.execute("SELECT COUNT(*) FROM roles WHERE active=1").fetchone()[0] if not missing else 0
    permission_count = db.execute("SELECT COUNT(*) FROM permissions WHERE active=1").fetchone()[0] if not missing else 0
    mapping_count = db.execute("SELECT COUNT(*) FROM role_permissions").fetchone()[0] if not missing else 0
    workflow_count = db.execute("SELECT COUNT(*) FROM dataset_workflow").fetchone()[0] if not missing else 0
    migration = False
    if table_exists(db, "schema_migrations"):
        migration = db.execute(
            "SELECT 1 FROM schema_migrations WHERE migration_id=?", (MIGRATION_ID,)
        ).fetchone() is not None
    return {
        "missing": missing,
        "roles": role_count,
        "permissions": permission_count,
        "mappings": mapping_count,
        "workflows": workflow_count,
        "migration": migration,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", required=True)
    parser.add_argument("--verify", action="store_true")
    args = parser.parse_args()

    db_path = Path(args.db).resolve()
    if not db_path.is_file():
        raise SystemExit(f"Database not found: {db_path}")

    db = sqlite3.connect(db_path)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys=ON")
    try:
        initial = verify(db)
        if initial["missing"]:
            print("V18_PHASE2_SCHEMA=FAIL")
            print("MISSING=" + ",".join(initial["missing"]))
            print("Run V1.8 Phase-1 before Phase-2.")
            return 2

        if not args.verify:
            db.execute(
                "CREATE INDEX IF NOT EXISTS idx_workflow_source ON dataset_workflow(source_type,source_ref)"
            )
            db.execute(
                "CREATE INDEX IF NOT EXISTS idx_task_history_task_time ON task_history(task_id,created_at DESC)"
            )
            db.execute(
                """
                INSERT INTO schema_migrations(migration_id,applied_at,details_json)
                VALUES(?,?,?)
                ON CONFLICT(migration_id) DO UPDATE SET
                    applied_at=excluded.applied_at,
                    details_json=excluded.details_json
                """,
                (
                    MIGRATION_ID,
                    now(),
                    json.dumps(
                        {
                            "api": "v1.8.2",
                            "modules": ["tasks", "workflow", "review", "notifications", "audit", "cnnl-approved"],
                        },
                        separators=(",", ":"),
                    ),
                ),
            )
            db.commit()

        result = verify(db)
        print("V18_PHASE2_SCHEMA=PASS" if not result["missing"] else "V18_PHASE2_SCHEMA=FAIL")
        print("PHASE2_MIGRATION=" + ("PASS" if result["migration"] else "NOT_APPLIED"))
        print("ROLES=" + str(result["roles"]))
        print("PERMISSIONS=" + str(result["permissions"]))
        print("ROLE_PERMISSION_MAPPINGS=" + str(result["mappings"]))
        print("WORKFLOW_ITEMS=" + str(result["workflows"]))
        return 0 if not result["missing"] else 3
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
