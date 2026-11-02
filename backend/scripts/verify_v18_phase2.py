from __future__ import annotations

# Allow direct execution from the backend/scripts folder.
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.auth_store import AuthUser, connect
from app.workflow_store import ensure_phase2_ready, permissions_for_user, sync_workflows


def main() -> int:
    ensure_phase2_ready()
    sync = sync_workflows()
    with connect() as db:
        row = db.execute(
            """
            SELECT u.id,u.email,u.display_name,u.organization_id,o.name AS organization_name,o.org_type,u.role,u.active,u.must_change_password
            FROM users u JOIN organizations o ON o.id=u.organization_id
            WHERE u.organization_id='ORG-NAKSHA' AND u.role='COMPANY_ADMIN' AND u.active=1
            ORDER BY u.id LIMIT 1
            """
        ).fetchone()
        if not row:
            print("PHASE2_VERIFY=FAIL")
            print("REASON=No active Company Admin account")
            return 2
        user = AuthUser(
            id=int(row["id"]),
            email=row["email"],
            display_name=row["display_name"],
            organization_id=row["organization_id"],
            organization_name=row["organization_name"],
            organization_type=row["org_type"],
            role=row["role"],
            active=bool(row["active"]),
            must_change_password=bool(row["must_change_password"]),
        )
    perms = permissions_for_user(user)
    required = {
        "TASK.CREATE",
        "TASK.ASSIGN",
        "TASK.APPROVE",
        "WORKFLOW.REVIEW",
        "WORKFLOW.FINAL_APPROVE",
        "WORKFLOW.INTEGRATE",
        "AUDIT.VIEW",
    }
    missing = sorted(required - set(perms["permissions"]))
    print("PHASE2_IMPORT=PASS")
    print("WORKFLOW_SYNC_REPOSITORY_ADDED=" + str(sync["repository_added"]))
    print("WORKFLOW_SYNC_INSTITUTION_ADDED=" + str(sync["institution_added"]))
    print("COMPANY_ADMIN_PERMISSIONS=" + str(len(perms["permissions"])))
    if missing:
        print("PHASE2_VERIFY=FAIL")
        print("MISSING_ADMIN_PERMISSIONS=" + ",".join(missing))
        return 3
    print("PHASE2_VERIFY=PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
