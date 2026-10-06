from __future__ import annotations

import os
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
PROJECT_ROOT = BACKEND_DIR.parent


def _bool(name: str, default: bool = False) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _int(name: str, default: int, minimum: int = 1, maximum: int | None = None) -> int:
    raw = os.environ.get(name)
    if raw is None or not raw.strip():
        return default
    try:
        value = int(raw)
    except ValueError:
        return default
    value = max(minimum, value)
    if maximum is not None:
        value = min(maximum, value)
    return value


def _list(name: str, default: list[str] | None = None) -> list[str]:
    raw = os.environ.get(name)
    if raw is None:
        return list(default or [])
    return [item.strip().rstrip("/") for item in raw.split(",") if item.strip()]


PROJECT_TITLE = os.environ.get(
    "ARKAVATI_PROJECT_TITLE",
    "Arkavati River Population Assessment Project",
).strip()

HOST = os.environ.get("ARKAVATI_HOST", os.environ.get("ARKAVATHI_HOST", "127.0.0.1")).strip()
PORT = _int("ARKAVATI_PORT", _int("ARKAVATHI_PORT", 8766, 1, 65535), 1, 65535)
PUBLIC_URL = os.environ.get("ARKAVATI_PUBLIC_URL", "").strip().rstrip("/")
PRODUCTION = _bool("ARKAVATI_PRODUCTION", False)
TRUST_PROXY = _bool("ARKAVATI_TRUST_PROXY", False)
DEBUG_ERRORS = _bool("ARKAVATI_DEBUG_ERRORS", not PRODUCTION)
SESSION_HOURS = _int("ARKAVATI_SESSION_HOURS", 12 if PRODUCTION else 24, 1, 168)

# In production, frontend and API are normally same-origin because the Python
# server serves frontend/dist. Explicit CORS is only needed for a separate UI.
DEFAULT_DEV_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:9765",
    "http://127.0.0.1:9765",
]
ALLOWED_ORIGINS = _list("ARKAVATI_ALLOWED_ORIGINS", [] if PRODUCTION else DEFAULT_DEV_ORIGINS)
if PUBLIC_URL:
    ALLOWED_ORIGINS.append(PUBLIC_URL)
ALLOWED_ORIGINS = sorted(set(ALLOWED_ORIGINS))

SECURE_COOKIES_RAW = os.environ.get("ARKAVATI_SECURE_COOKIES", "auto").strip().lower()
SAME_SITE = os.environ.get("ARKAVATI_COOKIE_SAMESITE", "Lax").strip().capitalize()
if SAME_SITE not in {"Lax", "Strict", "None"}:
    SAME_SITE = "Lax"

FRONTEND_DIST = Path(os.environ.get("ARKAVATI_FRONTEND_DIST", str(PROJECT_ROOT / "frontend" / "dist"))).resolve()
PRODUCTION_DATA_DIR = Path(
    os.environ.get("ARKAVATI_DATA_DIR", str(PROJECT_ROOT / "production_data"))
).resolve()
SHOWCASE_VIDEO_DIR = Path(
    os.environ.get("ARKAVATI_SHOWCASE_VIDEO_DIR", str(PRODUCTION_DATA_DIR / "showcase_videos"))
).resolve()
VIDEO_SRT_LIBRARY_DIR = Path(
    os.environ.get("ARKAVATI_VIDEO_SRT_LIBRARY_DIR", str(PRODUCTION_DATA_DIR / "video_srt_pairs"))
).resolve()
IMPORTS_DIR = Path(os.environ.get("ARKAVATI_IMPORTS_DIR", str(PRODUCTION_DATA_DIR / "imports"))).resolve()
BACKUPS_DIR = Path(os.environ.get("ARKAVATI_BACKUPS_DIR", str(PRODUCTION_DATA_DIR / "backups"))).resolve()

MAX_JSON_BYTES = _int("ARKAVATI_MAX_JSON_BYTES", 1_000_000, 32_768, 20_000_000)
MAX_ATTACHMENT_MB = _int("ARKAVATI_MAX_ATTACHMENT_MB", 15, 1, 200)
FAILED_LOGIN_WINDOW_SECONDS = _int("ARKAVATI_LOGIN_WINDOW_SECONDS", 600, 60, 86_400)
FAILED_LOGIN_MAX = _int("ARKAVATI_LOGIN_MAX", 5, 2, 100)

VIDEO_EXTENSIONS = {".mp4", ".m4v", ".mov", ".webm"}
SRT_EXTENSIONS = {".srt"}


def ensure_production_dirs() -> None:
    for path in (PRODUCTION_DATA_DIR, SHOWCASE_VIDEO_DIR, VIDEO_SRT_LIBRARY_DIR, IMPORTS_DIR, BACKUPS_DIR):
        path.mkdir(parents=True, exist_ok=True)


def request_is_https(headers) -> bool:
    if SECURE_COOKIES_RAW in {"1", "true", "yes", "on"}:
        return True
    if SECURE_COOKIES_RAW in {"0", "false", "no", "off"}:
        return False
    if PUBLIC_URL.lower().startswith("https://"):
        return True
    if TRUST_PROXY:
        forwarded = str(headers.get("X-Forwarded-Proto", "")).split(",", 1)[0].strip().lower()
        if forwarded == "https":
            return True
        cf_visitor = str(headers.get("CF-Visitor", "")).lower()
        if '"scheme":"https"' in cf_visitor.replace(" ", ""):
            return True
    return False
