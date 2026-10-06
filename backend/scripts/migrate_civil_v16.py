from __future__ import annotations

# Allow direct execution from the backend/scripts folder.
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pathlib import Path
import sys

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.auth_store import _insert_user, _random_password, connect, ensure_initialized
from app.civil_store import ensure_civil_schema

PROJECT_ROOT = BACKEND_DIR.parent
CREDENTIALS = PROJECT_ROOT / "STUDENT_LOGIN_CREDENTIALS_V16.txt"


def main() -> int:
    ensure_initialized()
    ensure_civil_schema()
    created = []
    with connect() as db:
        for i in range(1, 13):
            email = f"inst{i:02d}.student@arkavathi.local"
            existing = db.execute("SELECT id FROM users WHERE email=?", (email,)).fetchone()
            if existing:
                continue
            password = _random_password()
            _insert_user(
                db,
                email=email,
                display_name=f"Institution {i:02d} Student",
                organization_id=f"INST-{i:03d}",
                role="INSTITUTION_USER",
                password=password,
            )
            created.append((i, email, password))
        db.commit()

    if created:
        lines = [
            "ARKAVATHI RIVER PROJECT - STUDENT DATA ENTRY ACCOUNTS V1.6",
            "=" * 70,
            "Generated locally. Keep this file private.",
            "These demo student accounts can create Draft records, upload attachments and submit records for Company review.",
            "",
        ]
        for i, email, password in created:
            lines += [
                f"Institution   : Institution {i:02d} (INST-{i:03d})",
                "Role          : INSTITUTION_USER",
                f"Email         : {email}",
                f"Password      : {password}",
                "-" * 70,
            ]
        CREDENTIALS.write_text("\n".join(lines) + "\n", encoding="utf-8")

    print(f"CIVIL_SCHEMA=PASS")
    print(f"STUDENT_USERS_CREATED={len(created)}")
    print(f"STUDENT_CREDENTIALS={CREDENTIALS}")
    print("CIVIL_V16_MIGRATION=PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
