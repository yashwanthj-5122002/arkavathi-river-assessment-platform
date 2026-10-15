from __future__ import annotations

import argparse
import getpass
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from app.auth_store import (  # noqa: E402
    _hash_password,
    _random_password,
    connect,
    create_user,
    ensure_initialized,
    iso,
    utc_now,
)


def list_users() -> None:
    ensure_initialized()
    with connect() as db:
        rows = db.execute(
            """
            SELECT u.id,u.email,u.display_name,o.name AS organization_name,o.id AS organization_id,
                   o.org_type,u.role,u.active,u.must_change_password,u.last_login_at
            FROM users u JOIN organizations o ON o.id=u.organization_id
            ORDER BY CASE o.org_type WHEN 'COMPANY' THEN 0 WHEN 'CNNL' THEN 1 ELSE 2 END,o.id,u.display_name
            """
        ).fetchall()
    print(f"{'ID':>4}  {'EMAIL':38}  {'ORG':12}  {'ROLE':28}  ACTIVE  CHANGE  LAST LOGIN")
    print('-' * 125)
    for row in rows:
        print(
            f"{row['id']:>4}  {row['email'][:38]:38}  {row['organization_id'][:12]:12}  "
            f"{row['role'][:28]:28}  {row['active']}       {row['must_change_password']}       {row['last_login_at'] or '-'}"
        )


def reset_password(email: str, password: str | None, generate: bool, must_change: bool) -> None:
    ensure_initialized()
    if generate:
        password = _random_password()
    elif not password:
        password = getpass.getpass('New password: ')
        confirm = getpass.getpass('Confirm password: ')
        if password != confirm:
            raise SystemExit('Passwords do not match')
    if len(password) < 12:
        raise SystemExit('Password must contain at least 12 characters')
    salt, digest = _hash_password(password)
    with connect() as db:
        row = db.execute('SELECT id FROM users WHERE email=? COLLATE NOCASE', (email.strip().lower(),)).fetchone()
        if not row:
            raise SystemExit(f'User not found: {email}')
        db.execute(
            'UPDATE users SET password_salt=?,password_hash=?,must_change_password=? WHERE id=?',
            (salt, digest, 1 if must_change else 0, row['id']),
        )
        db.execute('DELETE FROM sessions WHERE user_id=?', (row['id'],))
        db.commit()
    print('PASSWORD RESET OK')
    print('Email:', email.strip().lower())
    if generate:
        print('Temporary password:', password)
        print('Copy it now and distribute it securely. It is not stored in plaintext by this tool.')


def create(args) -> None:
    ensure_initialized()
    result = create_user(
        email=args.email,
        display_name=args.name,
        organization_id=args.organization,
        role=args.role,
        password=args.password or None,
    )
    print('USER CREATED')
    for key in ('email', 'display_name', 'organization_id', 'role'):
        print(f'{key}: {result[key]}')
    if result.get('temporary_password'):
        print('temporary_password:', result['temporary_password'])
        print('Copy it now. The stored database value is only a password hash.')


def rename_institution(org_id: str, name: str) -> None:
    ensure_initialized()
    with connect() as db:
        row = db.execute("SELECT id FROM organizations WHERE id=? AND org_type='INSTITUTION'", (org_id,)).fetchone()
        if not row:
            raise SystemExit(f'Institution not found: {org_id}')
        db.execute('UPDATE organizations SET name=?,placeholder_name=0 WHERE id=?', (name.strip(), org_id))
        db.commit()
    print(f'UPDATED {org_id} -> {name.strip()}')


def main() -> int:
    parser = argparse.ArgumentParser(description='Arkavati production account administration')
    sub = parser.add_subparsers(dest='command', required=True)
    sub.add_parser('list')

    r = sub.add_parser('reset-password')
    r.add_argument('--email', required=True)
    r.add_argument('--password')
    r.add_argument('--generate', action='store_true')
    r.add_argument('--must-change', action='store_true')

    c = sub.add_parser('create')
    c.add_argument('--email', required=True)
    c.add_argument('--name', required=True)
    c.add_argument('--organization', required=True)
    c.add_argument('--role', required=True)
    c.add_argument('--password')

    i = sub.add_parser('rename-institution')
    i.add_argument('--organization', required=True, help='Example: INST-001')
    i.add_argument('--name', required=True)

    args = parser.parse_args()
    if args.command == 'list':
        list_users()
    elif args.command == 'reset-password':
        reset_password(args.email, args.password, args.generate, args.must_change)
    elif args.command == 'create':
        create(args)
    elif args.command == 'rename-institution':
        rename_institution(args.organization, args.name)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
