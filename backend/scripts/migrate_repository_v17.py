from __future__ import annotations

# Allow direct execution from the backend/scripts folder.
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from datetime import datetime, timezone
from pathlib import Path
import sys

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.auth_store import connect, create_user, ensure_initialized
from app.repository_store import DEPARTMENTS, PASSKEYS_PATH, ensure_repository_schema

UPLOADER_EMAIL = "data.uploader@arkavathi.local"
UPLOADER_NAME = "Arkavathi Department Data Uploader"
UPLOADER_ROLE = "COMPANY_DEPARTMENT_USER"
UPLOADER_ORG = "ORG-NAKSHA"


def main() -> None:
    ensure_initialized()
    repo = ensure_repository_schema()
    created_password = None

    with connect() as db:
        existing = db.execute("SELECT id,email,role FROM users WHERE email=?", (UPLOADER_EMAIL,)).fetchone()
    if not existing:
        created = create_user(
            email=UPLOADER_EMAIL,
            display_name=UPLOADER_NAME,
            organization_id=UPLOADER_ORG,
            role=UPLOADER_ROLE,
            password=None,
        )
        created_password = created["temporary_password"]

    created_passkeys = repo.get("created_passkeys", {})
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")

    if created_password or created_passkeys:
        lines = []
        if PASSKEYS_PATH.exists():
            lines.append(PASSKEYS_PATH.read_text(encoding="utf-8").rstrip())
            lines += ["", "=" * 72, f"UPDATED {now}", "=" * 72]
        else:
            lines += [
                "ARKAVATHI RIVER PROJECT - DEPARTMENT DATA HUB CREDENTIALS",
                "=" * 72,
                "Generated locally on the host PC. Keep this file private.",
                "Company Admin can view/download all departments.",
                "Department Data Uploader must also unlock a department using its passkey.",
                "",
            ]

        if created_password:
            lines += [
                "COMPANY DEPARTMENT DATA UPLOADER LOGIN",
                "-" * 72,
                f"Portal       : Company Login",
                f"Email        : {UPLOADER_EMAIL}",
                f"Password     : {created_password}",
                f"Role         : {UPLOADER_ROLE}",
                "",
            ]

        if created_passkeys:
            lines += ["DEPARTMENT PASSKEYS", "-" * 72]
            for dep_id, name, code in DEPARTMENTS:
                raw = created_passkeys.get(dep_id)
                if raw:
                    lines.append(f"{name:<18} ({dep_id:<15}) : {raw}")
            lines += [
                "",
                "Passkeys are stored as hashes in SQLite. The clear values above are shown only in this local file.",
                "Company Admin can rotate a department passkey from the Data Repository screen.",
            ]
        PASSKEYS_PATH.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")

    print(f"REPOSITORY_DB={Path(repo['credentials_path']).parent / 'backend' / 'runtime' / 'auth.db'}")
    print(f"CREDENTIALS_FILE={PASSKEYS_PATH}")
    print(f"DEPARTMENTS={len(DEPARTMENTS)}")
    print(f"NEW_PASSKEYS={len(created_passkeys)}")
    print(f"UPLOADER_CREATED={1 if created_password else 0}")
    print("REPOSITORY_INIT=PASS")


if __name__ == "__main__":
    main()
