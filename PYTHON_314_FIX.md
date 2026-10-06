# Python 3.14 startup fix — Arkavathi Dashboard V1.2

## Why V1.1 failed
The computer used CPython 3.14 (`cp314-win_amd64`). V1.1 pinned `pydantic==2.11.7`, whose `pydantic-core==2.33.2` build uses PyO3 0.24.1. That PyO3 version explicitly stops when the interpreter is newer than Python 3.13.

The important error from the supplied log was:

    the configured Python interpreter version (3.14) is newer than PyO3's maximum supported version (3.13)

This is a dependency compatibility failure, not an Arkavathi dataset failure.

## What V1.2 changes
V1.2 starts the demo API with Python's standard library (`ThreadingHTTPServer`). Therefore:

- Python 3.14 is supported.
- No Pydantic build is required.
- No FastAPI/Uvicorn installation is required for the demonstration.
- Existing React/Tailwind/MapLibre frontend API URLs remain unchanged.
- The same verified JSON/GeoJSON source data is used.

## Run
From the project root, double-click:

    RUN_ARKAVATHI.bat

Then test:

    http://127.0.0.1:8765/health
    http://127.0.0.1:8765/api/v1/summary
    http://localhost:5173

## Expected health response

    {"status":"ok","service":"Arkavathi Survey GIS Dashboard API","version":"1.2.0"}

## Optional FastAPI version
`backend/app/main.py` is retained as the FastAPI implementation for future production development. The demo launcher does not invoke it. If you intentionally want the old pinned FastAPI environment, use Python 3.11-3.13 with `requirements-fastapi-optional.txt`.
