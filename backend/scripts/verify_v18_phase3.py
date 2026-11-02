from __future__ import annotations

# Allow direct execution from the backend/scripts folder.
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.auth_store import _row_to_user, connect
from app.workflow_store import (
    ensure_phase2_ready,
    list_visible_workflows,
    permissions_for_user,
    task_targets,
)


def main() -> int:
    ensure_phase2_ready()
    with connect() as db:
        row = db.execute(
            """
            SELECT u.id,u.email,u.display_name,u.organization_id,u.role,u.active,u.must_change_password,
                   o.name AS organization_name,o.org_type AS organization_type
            FROM users u JOIN organizations o ON o.id=u.organization_id
            WHERE u.role='COMPANY_ADMIN' AND u.active=1 ORDER BY u.id LIMIT 1
            """
        ).fetchone()
        if not row:
            print("PHASE3_VERIFY=FAIL")
            print("REASON=No active COMPANY_ADMIN account")
            return 2
        admin = _row_to_user(row)
        table_count = db.execute(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('tasks','task_assignments','task_history','dataset_workflow','approval_history','notifications','audit_logs')"
        ).fetchone()[0]
    profile = permissions_for_user(admin)
    targets = task_targets(admin)
    visible = list_visible_workflows(admin, limit=2000)
    checks = {
        "PHASE2_TABLES": table_count == 7,
        "COMPANY_ADMIN_PERMISSIONS": len(profile.get("permissions", [])) >= 27,
        "DEPARTMENTS": len(targets.get("departments", [])) == 5,
        "INSTITUTIONS": len(targets.get("institutions", [])) == 12,
        "WORKFLOW_LIST_API": isinstance(visible, list),
    }
    for key, value in checks.items():
        print(f"{key}={'PASS' if value else 'FAIL'}")
    if not all(checks.values()):
        print("PHASE3_VERIFY=FAIL")
        return 3
    print("VISIBLE_WORKFLOWS=" + str(len(visible)))
    print("PHASE3_VERIFY=PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
