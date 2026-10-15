# Colleague Setup Guide — Arkavati River Population Assessment Project

Handoff document for setting up this repository on a **new Windows computer** from a fresh clone.

## 1. Project overview

The Arkavati River Population Assessment Platform is a full-stack application:

- **Backend:** Python HTTP application (`backend/app/simple_server.py`, standard library only for core startup) with FastAPI available as an optional runtime (`backend/app/main.py`).
- **Frontend:** React + TypeScript + Vite application (`frontend/`), proxied to the backend during development.
- **Database:** SQLite (`backend/runtime/auth.db`), created and seeded automatically on first start.
- **Modules:** Authentication and institutional portals, GIS atlas and survey layers, Department Data Hub (Civil / GIS / Survey / LiDAR / Photogrammetry), scientific assessment records, industry intelligence (Video + SRT), repository/workflow/event management.

## 2. Repository and branch

- **Repository URL:** `https://github.com/yashwanthj-5122002/arkavathi-river-assessment-platform.git`
- **Handoff branch:** `feature/arkavathi-team-handoff`
- **Do not develop on the originator's branches.** Create your own development branch (step 10).

Clone command:

```powershell
git clone --branch feature/arkavathi-team-handoff https://github.com/yashwanthj-5122002/arkavathi-river-assessment-platform.git
cd arkavathi-river-assessment-platform
```

## 3. Prerequisites

| Tool | Version | Purpose |
|---|---|---|
| Git | any recent | clone the repository |
| Python | 3.10+ (3.10–3.13 recommended) | backend, migrations, tests |
| Node.js | 20 LTS or newer (includes npm) | frontend |
| Windows PowerShell | 5.1+ | setup and launcher scripts |

Notes:
- Python 3.14 works with the standard-library server; see `PYTHON_314_FIX.md` if you use 3.14 and need the optional Pydantic/FastAPI stack.
- Optional GIS dependencies (`pyproj`, `pyshp`, `openpyxl`) may require a prebuilt wheel for your Python version; see `backend/requirements.txt`.

## 4. One-time project setup

From the repository root in PowerShell:

```powershell
# 1) Create the backend virtual environment and install Python dependencies
python -m venv backend\.venv
backend\.venv\Scripts\python.exe -m pip install --upgrade pip
backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt

# 2) (Only if you will run the backend test suite / FastAPI app)
backend\.venv\Scripts\python.exe -m pip install -r backend\requirements-fastapi-optional.txt

# 3) Create local config and data folders from the safe template
Copy-Item config\production.env.example config\production.env

# 4) Install frontend dependencies (ALWAYS run npm inside frontend\)
#    --include=dev is required because typescript/vite are devDependencies;
#    on machines with NODE_ENV=production a plain "npm ci" skips them and
#    "npm run build" fails with "'tsc' is not recognized".
cd frontend
npm ci --include=dev
cd ..

# 5) Initialize the database and apply required schema migrations
#    init_auth.py creates backend\runtime\auth.db if it does not exist,
#    then the two migration scripts must run before the server's first start
backend\.venv\Scripts\python.exe backend\scripts\init_auth.py
backend\.venv\Scripts\python.exe backend\scripts\migrate_v18_phase1.py --db backend\runtime\auth.db
backend\.venv\Scripts\python.exe backend\scripts\migrate_v18_phase2.py --db backend\runtime\auth.db
```

Alternatively, run `.\PRODUCTION_SETUP.ps1` from the repository root — it performs steps 1–4 plus migrations and readiness checks (run the database initialization in step 5 first if `backend\runtime\auth.db` does not exist yet, because the migration scripts require the database file to be present).

**Important:** `package.json` lives in `frontend\`, not in the repository root or `backend\`. Running `npm install` anywhere else produces `npm ERR! ENOENT: no such file or directory, package.json`.

## 5. Local environment variables (optional)

All core startup works with defaults. Create these files only if you need the optional integrations — **never commit real values** (`.env*` files are git-ignored):

- `frontend\.env` (optional):
  ```
  VITE_GOOGLE_MAPS_API_KEY=YOUR_VALUE_HERE
  VITE_MAPILLARY_ACCESS_TOKEN=YOUR_VALUE_HERE
  ```
- `backend\.env` (optional):
  ```
  ARKAVATHI_GOOGLE_PLACES_ENABLED=YOUR_VALUE_HERE
  ARKAVATHI_GOOGLE_PLACES_API_KEY=YOUR_VALUE_HERE
  ```
- `config\production.env` (created from `config\production.env.example` in step 4): host/port/session settings. Defaults: `127.0.0.1:8766`.

Maps/Places/Mapillary keys are obtained from your project lead — they are not stored in Git. The application runs without them; only the optional map-provider and places-lookup features degrade.

## 6. Database initialization (safe, automatic)

No database file is shipped in Git. During initialization (step 5, or implicitly on first backend start) the application:

1. Creates `backend\runtime\auth.db` with the full schema.
2. Seeds 14 organizations/institutions and administrator accounts with **randomly generated passwords**.
3. Writes the plaintext passwords once to `PRODUCTION_INITIAL_CREDENTIALS.txt` in the repository root (git-ignored).

If you skip the migration commands in step 5, the first backend start creates the database and then stops with
`RuntimeError: V1.8 Phase-1 database migration is required before Phase-2` — that is expected; run the two migration commands from step 5 and start the server again.

Handle that credentials file securely: distribute passwords through a secure channel, then delete the file after first password rotation. To re-seed or reset later:

```powershell
cd backend
..\backend\.venv\Scripts\python.exe scripts\init_auth.py           # initialize if empty
..\backend\.venv\Scripts\python.exe scripts\manage_users.py list   # list accounts
..\backend\.venv\Scripts\python.exe scripts\manage_users.py reset-password --email <email> --generate
cd ..
```

If you receive a populated `backend\runtime\auth.db` from the project lead instead, place it at `backend\runtime\auth.db` before first start (transfer it securely — outside of Git).

## 7. Running the application

### Backend (terminal 1)

```powershell
cd backend
..\backend\.venv\Scripts\python.exe -m app.simple_server
```

- Binds to `http://127.0.0.1:8766` by default (the port the frontend proxy expects).
- Health check: open `http://127.0.0.1:8766/health` — expect JSON like
  `{"status":"ok","service":"Arkavati River Population Assessment Platform API", ...}`.

### Frontend (terminal 2)

```powershell
cd frontend
npm run dev
```

- Open `http://localhost:5173`.
- The Vite dev server proxies `/api` and `/health` to `http://127.0.0.1:8766` (see `frontend/vite.config.ts`).

### Verify successful startup

1. `http://127.0.0.1:8766/health` returns `"status":"ok"`.
2. `http://localhost:5173` renders the landing page.
3. Login works with an account from `PRODUCTION_INITIAL_CREDENTIALS.txt`.

### Alternative launchers

- `.\RUN_PRODUCTION.ps1` — production-style run (requires `.\PRODUCTION_SETUP.ps1` first: it builds `frontend\dist` and loads `config\production.env`).
- `RUN_ARKAVATHI.bat` / `scripts\start_backend.bat` — legacy demo launcher that forces backend port **8765**; the current Vite config proxies to **8766**. If you use it, set `ARKAVATHI_PORT=8766` before starting the backend (see Troubleshooting).

## 8. Tests and checks

```powershell
# Backend tests (48 tests) — MUST run from the backend directory
cd backend
..\backend\.venv\Scripts\python.exe -m pytest tests -q
cd ..

# Frontend type-check + production build
cd frontend
npm run build
cd ..
```

## 9. Data and files NOT stored in Git

The following are intentionally excluded (local/private). The application starts without them, but features degrade until the data is provided. Transfer them **securely (network share/encrypted drive — never through Git)**:

| Path | Purpose | Needed for |
|---|---|---|
| `backend\runtime\auth.db` | live accounts/password hashes | reusing existing logins (else auto-seed) |
| `production_data\gis\` | processed GIS layers | Department Data Hub GIS imports |
| `production_data\showcase_videos\` | showcase media | project showcase player |
| `production_data\video_srt_pairs\<DATE>\` | operational Video + SRT pairs | industry intelligence runs |
| `backend\runtime\department_repository\` | uploaded repository documents | repository module content |
| `backend\runtime\event_media\`, `uploads\`, `industry_media\` | uploaded media | events/industry evidence |
| `frontend\dist\`, `node_modules\`, `.venv`, `venv` | build artifacts | rebuild locally instead |

Essential GIS boundary/layer files for the map UI **are** tracked under `frontend\public\gis\`, and survey reference data ships in `backend\app\data\`.

## 10. Create your development branch

```powershell
git switch -c feature/colleague-development
git push -u origin feature/colleague-development
```

Do all of your work on `feature/colleague-development` (or branches you create from it). Do not commit to `feature/arkavathi-team-handoff`, `feature/arkavathi-ui-security-streetview`, `main`, or `develop`.

## 11. Common troubleshooting

- **`npm ERR! ENOENT: no such file or directory, 'package.json'`** — you ran npm in the wrong folder. Always `cd frontend` first.
- **Frontend loads but every API call fails** — backend not running, or it is on the wrong port. Current Vite config expects **8766**: verify `http://127.0.0.1:8766/health`. If you started via `scripts\start_backend.bat`, it forces 8765; restart the backend without that override or set `ARKAVATHI_PORT=8766`.
- **Port already in use** — another process holds 8766/5173: `Get-NetTCPConnection -LocalPort 8766 -State Listen` to find the PID, then stop that process or change `ARKAVATI_PORT`.
- **`ModuleNotFoundError: No module named 'fastapi'`** — install `backend\requirements-fastapi-optional.txt` (only needed for tests/optional API), or run the standard-library server as shown in step 7.
- **pytest: `No module named 'app'`** — run pytest from inside `backend\`.
- **Python 3.14 + Pydantic install errors** — see `PYTHON_314_FIX.md`.
- **pyproj/pyshp install failures** — use Python 3.10–3.13, or install a prebuilt wheel for your version.
- **Port 8765 vs 8766 confusion** — 8766 is the current default (backend config, `config\production.env.example`, Vite proxy). 8765 appears only in legacy demo scripts (`scripts\start_backend.bat`, `scripts\check_system.bat`).
- **Login failures on a copied database** — passwords are hash-verified; reset with `scripts\manage_users.py reset-password --email <email> --generate`.
- **Backend stops with `V1.8 Phase-1 database migration is required before Phase-2`** — run the two migration commands from step 5, then start the server again.
- **`'tsc' is not recognized` or `vite` not found during `npm run build`** — devDependencies were skipped, usually because `NODE_ENV=production` is set on the machine. Reinstall with `npm ci --include=dev`.
- **Rebuild frontend from scratch** — delete `frontend\node_modules` and rerun `npm ci --include=dev`.

## 12. Where to read next

- `README.md` — production package overview
- `docs\PRODUCTION_DEPLOYMENT_GUIDE.md` — production deployment
- `docs\USER_TRAINING_AND_WORKFLOW_GUIDE.md` — user workflows
- `docs\DATA_AND_MEDIA_OPERATIONS_GUIDE.md` — data/media operations
- `docs\ROLE_AND_USE_CASE_MATRIX.md` — roles and permissions
- `V29_INDUSTRY_INTELLIGENCE_README.md` — industry intelligence module
- `DEMO_GUIDE.md`, `VERIFICATION.md`, `FIX_404_WINDOWS.md` — demo and Windows notes
