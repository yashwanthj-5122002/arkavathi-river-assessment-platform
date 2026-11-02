# Fix for "Dashboard could not load - 404 Not Found"

The React frontend and Python backend are two separate local services.

- Frontend: `http://localhost:5173`
- Backend: `http://127.0.0.1:8765`

The screenshot showing Vite on port 5173 but a dashboard 404 means the frontend started, while the required backend API was not available to the page.

## Recommended startup

Double-click:

`RUN_ARKAVATHI.bat` (project root)

or:

`scripts\run_demo_windows.bat`

The v1.1 launcher waits until `http://127.0.0.1:8765/health` returns HTTP 200 before it starts/opens the frontend.

## Manual startup

1. Double-click `scripts\start_backend.bat`.
2. Wait until the backend window says `Uvicorn running on http://127.0.0.1:8765`.
3. Open `http://127.0.0.1:8765/health`. It must return JSON with `"status":"ok"`.
4. Double-click `scripts\start_frontend.bat`.
5. Open `http://localhost:5173`.

## Diagnostics

Double-click `scripts\check_system.bat`.

All three checks should show PASS:

- Backend health
- Summary API
- Frontend

## If port 8765 is already occupied

In Command Prompt:

`netstat -ano | findstr :8765`

If another unrelated process owns port 8765, stop it from Task Manager or run this dashboard after that service is closed.
