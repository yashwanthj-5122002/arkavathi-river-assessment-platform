from __future__ import annotations
import json, re, sqlite3, sys
from pathlib import Path

BACKEND=Path(__file__).resolve().parents[1]
ROOT=BACKEND.parent
sys.path.insert(0,str(BACKEND))
from app.production_config import FRONTEND_DIST, PROJECT_TITLE, ensure_production_dirs
from app.media_store import media_status
from app.auth_store import ensure_initialized, connect

PASS='PASS'; WARN='WARN'; FAIL='FAIL'
results=[]
def add(level,name,detail): results.append((level,name,detail))

ensure_production_dirs(); ensure_initialized()
if PROJECT_TITLE == 'Arkavati River Population Assessment Project': add(PASS,'Project title',PROJECT_TITLE)
else: add(WARN,'Project title',PROJECT_TITLE)

required=[
 ROOT/'frontend'/'package.json', ROOT/'frontend'/'src', BACKEND/'app'/'simple_server.py',
 BACKEND/'app'/'industry_intelligence.py', BACKEND/'runtime'/'auth.db'
]
for p in required: add(PASS if p.exists() else FAIL,'Required path',str(p))

try:
    with connect() as db:
        integrity=db.execute('PRAGMA integrity_check').fetchone()[0]
        add(PASS if integrity=='ok' else FAIL,'SQLite integrity',str(integrity))
        tables={r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
        expected={'users','organizations','sessions','roles','permissions','dataset_workflow','tasks','industry_candidates'}
        missing=sorted(expected-tables)
        add(PASS if not missing else FAIL,'Database schema','complete' if not missing else 'missing: '+', '.join(missing))
        users=db.execute('SELECT COUNT(*) FROM users WHERE active=1').fetchone()[0]
        inst=db.execute("SELECT COUNT(*) FROM organizations WHERE org_type='INSTITUTION'").fetchone()[0]
        placeholder=db.execute("SELECT COUNT(*) FROM organizations WHERE org_type='INSTITUTION' AND COALESCE(placeholder_name,0)=1").fetchone()[0] if 'placeholder_name' in {x[1] for x in db.execute('PRAGMA table_info(organizations)').fetchall()} else 0
        add(PASS,'Active users',str(users))
        add(WARN if placeholder else PASS,'Institution names',f'{inst} institutions; {placeholder} placeholder names require replacement' if placeholder else f'{inst} institutions configured')
except Exception as exc: add(FAIL,'Database check',repr(exc))

m=media_status(); add(PASS,'Media directories',json.dumps(m,ensure_ascii=False))
if FRONTEND_DIST.exists() and (FRONTEND_DIST/'index.html').exists(): add(PASS,'Production frontend build',str(FRONTEND_DIST))
else: add(WARN,'Production frontend build','frontend/dist is not built yet; run PRODUCTION_SETUP.ps1')

# Scan example assignments for accidentally committed secret-looking values. Do not print values.
flagged=[]
for p in list(ROOT.rglob('*.example'))+list(ROOT.rglob('*.env.example')):
    try:
        lines=p.read_text(encoding='utf-8',errors='ignore').splitlines()
    except Exception:
        continue
    for raw in lines:
        line=raw.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key,value=line.split('=',1)
        upper=key.upper()
        value=value.strip().strip('\"\'')
        if not any(word in upper for word in ('KEY','TOKEN','SECRET','PASSWORD')):
            continue
        if len(value) < 20:
            continue
        if any(tag in value.upper() for tag in ('YOUR_','CHANGE_','PLACEHOLDER','EXAMPLE')):
            continue
        flagged.append(str(p.relative_to(ROOT))); break
add(WARN if flagged else PASS,'Example-file secret scan',('review: '+', '.join(sorted(set(flagged)))) if flagged else 'no obvious committed secrets detected')

print('\nARKAVATI PRODUCTION READINESS CHECK')
print('='*90)
for level,name,detail in results: print(f'[{level:4}] {name:28} {detail}')
print('='*90)
fails=sum(1 for r in results if r[0]==FAIL); warns=sum(1 for r in results if r[0]==WARN)
print(f'Result: {fails} failure(s), {warns} warning(s)')
raise SystemExit(1 if fails else 0)
