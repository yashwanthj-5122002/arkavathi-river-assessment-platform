from __future__ import annotations

import hashlib
import hmac
import secrets
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from app.production_config import SESSION_HOURS

BACKEND_DIR = Path(__file__).resolve().parents[1]
PROJECT_ROOT = BACKEND_DIR.parent
RUNTIME_DIR = BACKEND_DIR / "runtime"
DB_PATH = RUNTIME_DIR / "auth.db"
CREDENTIALS_PATH = PROJECT_ROOT / "PRODUCTION_INITIAL_CREDENTIALS.txt"

PBKDF2_ROUNDS = 310_000

PORTAL_TO_ORG_TYPE = {
    "company": "COMPANY",
    "cnnl": "CNNL",
    "institution": "INSTITUTION",
}

ROLE_BY_ORG_TYPE = {
    "COMPANY": {
        "COMPANY_ADMIN",
        "COMPANY_PROJECT_MANAGER",
        "COMPANY_REVIEWER",
        "COMPANY_DATA_MANAGER",
        "COMPANY_DEPARTMENT_USER",
        "COMPANY_VIEWER",
        "COMPANY_CIVIL_REVIEWER",
        "COMPANY_GIS_REVIEWER",
        "COMPANY_SURVEY_REVIEWER",
        "COMPANY_LIDAR_REVIEWER",
        "COMPANY_PHOTOGRAMMETRY_REVIEWER",
    },
    "CNNL": {"CNNL_ADMIN", "CNNL_OFFICIAL", "CNNL_VIEWER"},
    "INSTITUTION": {"INSTITUTION_ADMIN", "INSTITUTION_USER", "INSTITUTION_VIEWER"},
}

ORGANIZATIONS = [
    ("ORG-NAKSHA", "Nakshatech", "COMPANY", "NAKSHA", 0),
    ("ORG-CNNL", "Cauvery Neeravari Nigam Limited (CNNL)", "CNNL", "CNNL", 0),
] + [
    (f"INST-{i:03d}", f"Institution {i:02d}", "INSTITUTION", f"INST{i:02d}", 1)
    for i in range(1, 13)
]


@dataclass(frozen=True)
class AuthUser:
    id: int
    email: str
    display_name: str
    organization_id: str
    organization_name: str
    organization_type: str
    role: str
    active: bool
    must_change_password: bool

    def public(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "email": self.email,
            "display_name": self.display_name,
            "organization_id": self.organization_id,
            "organization_name": self.organization_name,
            "organization_type": self.organization_type,
            "role": self.role,
            "active": self.active,
            "must_change_password": self.must_change_password,
        }


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat(timespec="seconds")


def connect() -> sqlite3.Connection:
    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB_PATH, timeout=15)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")
    db.execute("PRAGMA journal_mode = WAL")
    return db


def _hash_password(password: str, salt: bytes | None = None) -> tuple[str, str]:
    if salt is None:
        salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ROUNDS)
    return salt.hex(), digest.hex()


def _verify_password(password: str, salt_hex: str, hash_hex: str) -> bool:
    salt = bytes.fromhex(salt_hex)
    _, candidate = _hash_password(password, salt)
    return hmac.compare_digest(candidate, hash_hex)


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _random_password() -> str:
    # 20+ printable URL-safe characters, no whitespace.
    return secrets.token_urlsafe(18)


def _schema(db: sqlite3.Connection) -> None:
    db.executescript(
        """
        CREATE TABLE IF NOT EXISTS organizations (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            org_type TEXT NOT NULL CHECK(org_type IN ('COMPANY','CNNL','INSTITUTION')),
            code TEXT NOT NULL UNIQUE,
            active INTEGER NOT NULL DEFAULT 1,
            placeholder_name INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL UNIQUE COLLATE NOCASE,
            display_name TEXT NOT NULL,
            organization_id TEXT NOT NULL REFERENCES organizations(id),
            role TEXT NOT NULL,
            password_salt TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            active INTEGER NOT NULL DEFAULT 1,
            must_change_password INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            last_login_at TEXT
        );

        CREATE TABLE IF NOT EXISTS sessions (
            token_hash TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            created_at TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            last_seen_at TEXT NOT NULL,
            ip_address TEXT,
            user_agent TEXT
        );

        CREATE TABLE IF NOT EXISTS login_audit (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER REFERENCES users(id),
            email TEXT,
            portal TEXT,
            success INTEGER NOT NULL,
            reason TEXT,
            ip_address TEXT,
            occurred_at TEXT NOT NULL
        );
        """
    )


def _seed_organizations(db: sqlite3.Connection) -> None:
    db.executemany(
        """
        INSERT INTO organizations(id,name,org_type,code,active,placeholder_name)
        VALUES(?,?,?,?,1,?)
        ON CONFLICT(id) DO UPDATE SET
          name=excluded.name,
          org_type=excluded.org_type,
          code=excluded.code,
          placeholder_name=excluded.placeholder_name
        """,
        ORGANIZATIONS,
    )


def _insert_user(
    db: sqlite3.Connection,
    *,
    email: str,
    display_name: str,
    organization_id: str,
    role: str,
    password: str,
    must_change_password: bool = False,
) -> int:
    org = db.execute("SELECT org_type FROM organizations WHERE id=?", (organization_id,)).fetchone()
    if not org:
        raise ValueError(f"Unknown organization: {organization_id}")
    if role not in ROLE_BY_ORG_TYPE[org["org_type"]]:
        raise ValueError(f"Role {role} is not valid for {org['org_type']}")
    salt, digest = _hash_password(password)
    cur = db.execute(
        """
        INSERT INTO users(email,display_name,organization_id,role,password_salt,password_hash,active,must_change_password,created_at)
        VALUES(?,?,?,?,?,?,1,?,?)
        """,
        (
            email.strip().lower(),
            display_name.strip(),
            organization_id,
            role,
            salt,
            digest,
            1 if must_change_password else 0,
            iso(utc_now()),
        ),
    )
    return int(cur.lastrowid)


def ensure_initialized() -> dict[str, Any]:
    """Create schema and first demo accounts once. Existing auth data is preserved."""
    created_credentials: list[tuple[str, str, str, str]] = []
    with connect() as db:
        _schema(db)
        _seed_organizations(db)
        count = int(db.execute("SELECT COUNT(*) FROM users").fetchone()[0])
        if count == 0:
            seeds = [
                ("company.admin@arkavathi.local", "Nakshatech Project Admin", "ORG-NAKSHA", "COMPANY_ADMIN"),
                ("cnnl.official@arkavathi.local", "CNNL Project Official", "ORG-CNNL", "CNNL_OFFICIAL"),
            ] + [
                (
                    f"inst{i:02d}.admin@arkavathi.local",
                    f"Institution {i:02d} Admin",
                    f"INST-{i:03d}",
                    "INSTITUTION_ADMIN",
                )
                for i in range(1, 13)
            ]
            for email, name, org_id, role in seeds:
                password = _random_password()
                _insert_user(
                    db,
                    email=email,
                    display_name=name,
                    organization_id=org_id,
                    role=role,
                    password=password,
                )
                created_credentials.append((org_id, role, email, password))
        db.execute("DELETE FROM sessions WHERE expires_at <= ?", (iso(utc_now()),))
        db.commit()

    if created_credentials:
        lines = [
            "ARKAVATI RIVER POPULATION ASSESSMENT PROJECT - INITIAL LOGIN CREDENTIALS",
            "=" * 62,
            "Generated locally during first-time production initialization.",
            "Keep this file only until the credentials are distributed securely and changed.",
            "Delete this file after the first successful password rotation for all seeded accounts.",
            "Institution names are placeholders until official names/allocation data are supplied.",
            "",
        ]
        for org_id, role, email, password in created_credentials:
            lines += [
                f"Organization : {org_id}",
                f"Role         : {role}",
                f"Email        : {email}",
                f"Password     : {password}",
                "-" * 62,
            ]
        CREDENTIALS_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")

    return {
        "db": str(DB_PATH),
        "credentials": str(CREDENTIALS_PATH),
        "created_users": len(created_credentials),
    }


def portal_config() -> dict[str, Any]:
    ensure_initialized()
    with connect() as db:
        institutions = [
            dict(row)
            for row in db.execute(
                "SELECT id,name,code,placeholder_name FROM organizations WHERE org_type='INSTITUTION' AND active=1 ORDER BY id"
            ).fetchall()
        ]
    return {
        "portals": [
            {"id": "company", "label": "Company", "organization_type": "COMPANY"},
            {"id": "cnnl", "label": "CNNL", "organization_type": "CNNL"},
            {"id": "institution", "label": "Institution", "organization_type": "INSTITUTION"},
        ],
        "institutions": institutions,
        "institution_names_status": "placeholder_until_official_names_are_supplied",
    }


def _row_to_user(row: sqlite3.Row | None) -> AuthUser | None:
    if row is None:
        return None
    return AuthUser(
        id=int(row["id"]),
        email=row["email"],
        display_name=row["display_name"],
        organization_id=row["organization_id"],
        organization_name=row["organization_name"],
        organization_type=row["organization_type"],
        role=row["role"],
        active=bool(row["active"]),
        must_change_password=bool(row["must_change_password"]),
    )


def _user_query() -> str:
    return """
      SELECT u.id,u.email,u.display_name,u.organization_id,u.role,u.active,u.must_change_password,
             o.name AS organization_name,o.org_type AS organization_type
      FROM users u JOIN organizations o ON o.id=u.organization_id
    """


def authenticate(
    *,
    portal: str,
    email: str,
    password: str,
    institution_id: str | None,
    ip_address: str | None,
) -> tuple[AuthUser | None, str | None]:
    ensure_initialized()
    portal = portal.strip().lower()
    expected_type = PORTAL_TO_ORG_TYPE.get(portal)
    if expected_type is None:
        return None, "Unknown portal"
    email = email.strip().lower()
    with connect() as db:
        row = db.execute(_user_query() + " WHERE u.email=?", (email,)).fetchone()
        user = _row_to_user(row)
        success = False
        reason = "Invalid email or password"
        if user and user.active:
            raw = db.execute("SELECT password_salt,password_hash FROM users WHERE id=?", (user.id,)).fetchone()
            if raw and _verify_password(password, raw["password_salt"], raw["password_hash"]):
                if user.organization_type != expected_type:
                    reason = "This account does not belong to the selected portal"
                elif expected_type == "INSTITUTION" and institution_id and user.organization_id != institution_id:
                    reason = "This account does not belong to the selected institution"
                elif expected_type == "INSTITUTION" and not institution_id:
                    reason = "Select your institution"
                else:
                    success = True
                    reason = "ok"
        db.execute(
            "INSERT INTO login_audit(user_id,email,portal,success,reason,ip_address,occurred_at) VALUES(?,?,?,?,?,?,?)",
            (user.id if user else None, email, portal, 1 if success else 0, reason, ip_address, iso(utc_now())),
        )
        if success and user:
            db.execute("UPDATE users SET last_login_at=? WHERE id=?", (iso(utc_now()), user.id))
        db.commit()
    return (user if success else None), (None if success else reason)


def create_session(user_id: int, *, ip_address: str | None, user_agent: str | None) -> tuple[str, datetime]:
    ensure_initialized()
    raw_token = secrets.token_urlsafe(40)
    token_hash = _token_hash(raw_token)
    now = utc_now()
    expires = now + timedelta(hours=SESSION_HOURS)
    with connect() as db:
        db.execute(
            "INSERT INTO sessions(token_hash,user_id,created_at,expires_at,last_seen_at,ip_address,user_agent) VALUES(?,?,?,?,?,?,?)",
            (token_hash, user_id, iso(now), iso(expires), iso(now), ip_address, (user_agent or "")[:500]),
        )
        db.commit()
    return raw_token, expires


def user_from_session(token: str | None) -> AuthUser | None:
    if not token:
        return None
    ensure_initialized()
    token_hash = _token_hash(token)
    now = utc_now()
    with connect() as db:
        row = db.execute(
            _user_query()
            + " JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=? AND s.expires_at>? AND u.active=1",
            (token_hash, iso(now)),
        ).fetchone()
        user = _row_to_user(row)
        if user:
            db.execute("UPDATE sessions SET last_seen_at=? WHERE token_hash=?", (iso(now), token_hash))
            db.commit()
        return user


def destroy_session(token: str | None) -> None:
    if not token:
        return
    with connect() as db:
        db.execute("DELETE FROM sessions WHERE token_hash=?", (_token_hash(token),))
        db.commit()


def change_password(user_id: int, old_password: str, new_password: str) -> tuple[bool, str]:
    if len(new_password) < 12:
        return False, "New password must contain at least 12 characters"
    with connect() as db:
        row = db.execute("SELECT password_salt,password_hash FROM users WHERE id=?", (user_id,)).fetchone()
        if not row or not _verify_password(old_password, row["password_salt"], row["password_hash"]):
            return False, "Current password is incorrect"
        salt, digest = _hash_password(new_password)
        db.execute(
            "UPDATE users SET password_salt=?,password_hash=?,must_change_password=0 WHERE id=?",
            (salt, digest, user_id),
        )
        db.execute("DELETE FROM sessions WHERE user_id=?", (user_id,))
        db.commit()
    return True, "Password changed"


def list_access_summary() -> dict[str, Any]:
    ensure_initialized()
    with connect() as db:
        organizations = [dict(row) for row in db.execute(
            "SELECT id,name,org_type,code,active,placeholder_name FROM organizations ORDER BY CASE org_type WHEN 'COMPANY' THEN 0 WHEN 'CNNL' THEN 1 ELSE 2 END,id"
        ).fetchall()]
        users = [dict(row) for row in db.execute(
            """
            SELECT u.id,u.email,u.display_name,u.organization_id,u.role,u.active,u.must_change_password,u.created_at,u.last_login_at,
                   o.name AS organization_name,o.org_type AS organization_type
            FROM users u JOIN organizations o ON o.id=u.organization_id
            ORDER BY o.org_type,o.id,u.display_name
            """
        ).fetchall()]
    return {
        "organizations": organizations,
        "users": users,
        "counts": {
            "organizations": len(organizations),
            "users": len(users),
            "institutions": sum(1 for o in organizations if o["org_type"] == "INSTITUTION"),
        },
    }


def create_user(
    *,
    email: str,
    display_name: str,
    organization_id: str,
    role: str,
    password: str | None,
) -> dict[str, Any]:
    ensure_initialized()
    email = email.strip().lower()
    display_name = display_name.strip()
    if "@" not in email or len(email) > 254:
        raise ValueError("Enter a valid email address")
    if len(display_name) < 2:
        raise ValueError("Display name is required")
    generated = password is None or password == ""
    if generated:
        password = _random_password()
    if len(password) < 12:
        raise ValueError("Password must contain at least 12 characters")
    with connect() as db:
        try:
            user_id = _insert_user(
                db,
                email=email,
                display_name=display_name,
                organization_id=organization_id,
                role=role,
                password=password,
            )
            db.commit()
        except sqlite3.IntegrityError as exc:
            raise ValueError("A user with this email already exists") from exc
    return {
        "user_id": user_id,
        "email": email,
        "display_name": display_name,
        "organization_id": organization_id,
        "role": role,
        "temporary_password": password if generated else None,
    }


def institution_overview(user: AuthUser) -> dict[str, Any]:
    if user.organization_type != "INSTITUTION":
        raise ValueError("Institution account required")
    with connect() as db:
        org = db.execute(
            "SELECT id,name,code,placeholder_name FROM organizations WHERE id=?", (user.organization_id,)
        ).fetchone()
    return {
        "institution": dict(org) if org else {
            "id": user.organization_id,
            "name": user.organization_name,
            "code": user.organization_id,
            "placeholder_name": 1,
        },
        "data_status": "awaiting_institution_allocation_data",
        "metrics": {
            "watershed": None,
            "locations_assigned": None,
            "surveyed": None,
            "samples": None,
            "progress_pct": None,
        },
        "available_actions": [
            "view_account_scope",
            "prepare_for_assigned_locations",
            "prepare_for_civil_data_entry",
            "prepare_for_submission_workflow",
        ],
        "note": "No institution allocation dataset has been supplied yet, so global Day 3-Day 8 survey telemetry is intentionally not exposed to institution accounts.",
    }
