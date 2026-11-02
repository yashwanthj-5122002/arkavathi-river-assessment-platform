from __future__ import annotations

import json
import mimetypes
import os
import threading
import time
import traceback
from functools import lru_cache
from http import HTTPStatus
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

from app.auth_store import (
    AuthUser,
    authenticate,
    change_password,
    create_session,
    create_user,
    destroy_session,
    ensure_initialized,
    institution_overview,
    list_access_summary,
    portal_config,
    user_from_session,
)

from app.civil_store import (
    attachment_for_user,
    create_entry,
    ensure_civil_schema,
    get_entry,
    institution_metrics,
    list_entries,
    review_entry,
    save_attachment,
    submit_entry,
    update_entry,
)

from app.repository_store import (
    CHUNK_SIZE,
    append_upload_chunk,
    batch_zip_for_download,
    company_export_zip,
    company_repository_summary,
    complete_upload,
    create_batch,
    departments_for_user,
    department_export_zip,
    ensure_repository_schema,
    file_for_download,
    finalize_batch,
    init_upload,
    list_company_batches,
    list_department_batches,
    recent_activity,
    repository_audit,
    rotate_department_passkey,
    unlock_department,
)

from app.event_store import (
    completed_events,
    create_event,
    current_upcoming_event,
    delete_event,
    delete_event_image,
    ensure_event_schema,
    event_image_for_user,
    get_event,
    list_events,
    save_event_image,
    set_event_status,
    update_event,
)

from app.scientific_store import (
    create_scientific_record,
    delete_scientific_record,
    ensure_scientific_schema,
    list_micro_catchments,
    list_scientific_records,
    package_status,
    scientific_record_action,
    scientific_summary,
    update_micro_catchment,
    update_package_item,
    update_scientific_record,
    validate_dataset,
)

from app.industry_intelligence_store import (
    create_industry_observation,
    delete_industry_observation,
    ensure_industry_intelligence_schema,
    get_industry_observation,
    industry_evidence_for_user,
    industry_intelligence_summary,
    list_industry_observations,
    save_industry_evidence,
    set_industry_observation_status,
    update_industry_observation,
)
from app.industry_intelligence import (
    discover_industries,
    ensure_industry_schema,
    industry_source_status,
    latest_industry_discovery,
)

from app.media_store import list_showcase_videos, list_video_srt_pairs, media_pair_paths, media_status, showcase_video_path
from app.nakshatech_survey import survey_catalogue, survey_geojson
from app.production_config import (
    ALLOWED_ORIGINS,
    DEBUG_ERRORS,
    FAILED_LOGIN_MAX,
    FAILED_LOGIN_WINDOW_SECONDS,
    FRONTEND_DIST,
    HOST,
    MAX_ATTACHMENT_MB,
    MAX_JSON_BYTES,
    PORT,
    PRODUCTION,
    PROJECT_TITLE,
    SAME_SITE,
    SESSION_HOURS,
    TRUST_PROXY,
    ensure_production_dirs,
    request_is_https,
)

from app.workflow_store import (
    assign_task,
    create_task,
    ensure_phase2_ready,
    get_task,
    get_workflow,
    list_audit,
    list_cnnl_approved,
    list_notifications,
    list_review_queue,
    list_tasks,
    list_visible_workflows,
    mark_notification_read,
    permissions_for_user,
    sync_workflows,
    task_targets,
    transition_task,
    transition_workflow,
)

DATA_DIR = Path(__file__).resolve().parent / "data"
SERVICE = "Arkavati River Pollution Assessment Platform API"
VERSION = "2.0.0-production"
SESSION_COOKIE = "arkavati_session"

# In-process protection for a single-node deployment. Put a reverse proxy/WAF
# in front of the service for internet-facing production deployments.
FAILED_LOCK = threading.Lock()
FAILED_LOGIN: dict[str, list[float]] = {}
FAILED_WINDOW_SECONDS = FAILED_LOGIN_WINDOW_SECONDS
FAILED_MAX = FAILED_LOGIN_MAX


def load_json(name: str):
    path = DATA_DIR / name
    if not path.exists():
        raise FileNotFoundError(f"Required data file is missing: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def summary():
    return load_json("summary.json")


@lru_cache(maxsize=1)
def flights():
    return load_json("flights.json")


@lru_cache(maxsize=1)
def tracks():
    return load_json("flight_tracks.geojson")


@lru_cache(maxsize=1)
def endpoints():
    return load_json("endpoints.geojson")


@lru_cache(maxsize=1)
def points():
    return load_json("track_points.geojson")


@lru_cache(maxsize=1)
def point_verification():
    return load_json("point_verification.json")


@lru_cache(maxsize=1)
def availability():
    return load_json("data_availability.json")


@lru_cache(maxsize=1)
def verification():
    return load_json("verification.json")


def parse_days(raw: str | None) -> set[int] | None:
    if not raw:
        return None
    try:
        values = {int(v.strip()) for v in raw.split(",") if v.strip()}
    except ValueError as exc:
        raise ValueError("days must be comma-separated integers") from exc
    invalid = values - set(range(3, 9))
    if invalid:
        raise ValueError(f"Invalid day(s): {sorted(invalid)}")
    return values


def filtered_geojson(data: dict, selected: set[int] | None) -> dict:
    if selected is None:
        return data
    return {
        "type": "FeatureCollection",
        "features": [
            feature
            for feature in data.get("features", [])
            if feature.get("properties", {}).get("day") in selected
        ],
    }


def _client_ip(handler: BaseHTTPRequestHandler) -> str:
    # Forwarded client headers are accepted only when the deployment explicitly
    # trusts its reverse proxy. Otherwise a direct client could spoof them.
    if TRUST_PROXY:
        forwarded = (
            handler.headers.get("CF-Connecting-IP")
            or handler.headers.get("X-Forwarded-For", "").split(",")[0].strip()
        )
        if forwarded:
            return forwarded
    return handler.client_address[0]


def _is_login_limited(ip: str) -> bool:
    now = time.time()
    with FAILED_LOCK:
        recent = [t for t in FAILED_LOGIN.get(ip, []) if now - t < FAILED_WINDOW_SECONDS]
        FAILED_LOGIN[ip] = recent
        return len(recent) >= FAILED_MAX


def _register_login_failure(ip: str) -> None:
    now = time.time()
    with FAILED_LOCK:
        recent = [t for t in FAILED_LOGIN.get(ip, []) if now - t < FAILED_WINDOW_SECONDS]
        recent.append(now)
        FAILED_LOGIN[ip] = recent


def _clear_login_failures(ip: str) -> None:
    with FAILED_LOCK:
        FAILED_LOGIN.pop(ip, None)


def _authorized_for_global_data(user: AuthUser) -> bool:
    if user.organization_type == "CNNL":
        return True
    return user.organization_type == "COMPANY" and user.role != "COMPANY_DEPARTMENT_USER"


def _is_company_admin(user: AuthUser) -> bool:
    return user.organization_type == "COMPANY" and user.role == "COMPANY_ADMIN"


class Handler(BaseHTTPRequestHandler):
    server_version = "ArkavatiHTTP/2.0"

    def log_message(self, fmt: str, *args):
        print(f"[{self.log_date_time_string()}] {fmt % args}")

    def _cors(self):
        origin = (self.headers.get("Origin") or "").rstrip("/")
        if origin and origin in ALLOWED_ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Credentials", "true")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Requested-With, X-Department-Token, X-Upload-Offset")

    def _security_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "SAMEORIGIN")
        self.send_header("Referrer-Policy", "same-origin")
        self.send_header("Permissions-Policy", "camera=(), microphone=(), geolocation=(self)")
        self.send_header("Cross-Origin-Opener-Policy", "same-origin-allow-popups")
        if request_is_https(self.headers):
            self.send_header("Strict-Transport-Security", "max-age=31536000; includeSubDomains")

    def _session_cookie_header(self, token: str, max_age: int) -> str:
        parts = [
            f"{SESSION_COOKIE}={token}",
            "Path=/",
            f"Max-Age={max_age}",
            "HttpOnly",
            f"SameSite={SAME_SITE}",
        ]
        if request_is_https(self.headers):
            parts.append("Secure")
        return "; ".join(parts)

    def _send_json(self, payload, status: int = 200, extra_headers: list[tuple[str, str]] | None = None):
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._cors()
        self._security_headers()
        self.send_header("Cache-Control", "no-store")
        for key, value in extra_headers or []:
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self) -> dict:
        raw_len = self.headers.get("Content-Length", "0")
        try:
            length = int(raw_len)
        except ValueError as exc:
            raise ValueError("Invalid Content-Length") from exc
        if length <= 0:
            return {}
        if length > MAX_JSON_BYTES:
            raise ValueError("Request body is too large")
        raw = self.rfile.read(length)
        try:
            value = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise ValueError("Request body must be valid JSON") from exc
        if not isinstance(value, dict):
            raise ValueError("JSON body must be an object")
        return value

    def _read_bytes(self, max_bytes: int = MAX_ATTACHMENT_MB * 1024 * 1024) -> bytes:
        raw_len = self.headers.get("Content-Length", "0")
        try:
            length = int(raw_len)
        except ValueError as exc:
            raise ValueError("Invalid Content-Length") from exc
        if length <= 0:
            raise ValueError("Request body is empty")
        if length > max_bytes:
            raise ValueError(f"Attachment exceeds {max_bytes // (1024 * 1024)} MB limit")
        return self.rfile.read(length)

    def _send_file(self, path: Path, filename: str, content_type: str):
        if not path.is_file():
            self._send_json({"detail": "Attachment file is missing"}, status=404)
            return
        size = path.stat().st_size
        self.send_response(200)
        self.send_header("Content-Type", content_type or "application/octet-stream")
        safe = filename.replace('"', '')
        self.send_header("Content-Disposition", f'attachment; filename="{safe}"')
        self.send_header("Content-Length", str(size))
        self._cors()
        self._security_headers()
        self.end_headers()
        with path.open("rb") as fh:
            while True:
                chunk = fh.read(1024 * 256)
                if not chunk:
                    break
                self.wfile.write(chunk)

    def _send_inline_file(self, path: Path, filename: str, content_type: str):
        if not path.is_file():
            self._send_json({"detail": "Event image file is missing"}, status=404)
            return
        size = path.stat().st_size
        self.send_response(200)
        self.send_header("Content-Type", content_type or "application/octet-stream")
        safe = filename.replace('"', '')
        self.send_header("Content-Disposition", f'inline; filename="{safe}"')
        self.send_header("Content-Length", str(size))
        self._cors()
        self._security_headers()
        self.end_headers()
        with path.open("rb") as fh:
            while True:
                chunk = fh.read(1024 * 256)
                if not chunk:
                    break
                self.wfile.write(chunk)

    def _send_public_file(self, path: Path, content_type: str | None = None, cache_control: str = "public, max-age=3600"):
        if not path.is_file():
            self._send_json({"detail": "Not Found"}, status=404)
            return
        ctype = content_type or mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        size = path.stat().st_size
        range_header = self.headers.get("Range", "")
        if range_header.startswith("bytes="):
            raw = range_header[6:].split(",", 1)[0].strip()
            start_raw, _, end_raw = raw.partition("-")
            try:
                start = int(start_raw) if start_raw else 0
                end = int(end_raw) if end_raw else size - 1
            except ValueError:
                start, end = 0, size - 1
            start = max(0, min(start, size - 1))
            end = max(start, min(end, size - 1))
            length = end - start + 1
            self.send_response(206)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(length))
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
            self.send_header("Accept-Ranges", "bytes")
            self.send_header("Cache-Control", cache_control)
            self._security_headers()
            self.end_headers()
            with path.open("rb") as fh:
                fh.seek(start)
                remaining = length
                while remaining > 0:
                    chunk = fh.read(min(1024 * 1024, remaining))
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    remaining -= len(chunk)
            return
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(size))
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Cache-Control", cache_control)
        self._security_headers()
        self.end_headers()
        with path.open("rb") as fh:
            while True:
                chunk = fh.read(1024 * 1024)
                if not chunk:
                    break
                self.wfile.write(chunk)

    def _serve_frontend(self, path: str) -> bool:
        if not FRONTEND_DIST.is_dir():
            return False
        rel = path.lstrip("/") or "index.html"
        candidate = (FRONTEND_DIST / rel).resolve()
        try:
            candidate.relative_to(FRONTEND_DIST.resolve())
        except ValueError:
            return False
        if candidate.is_file():
            cache = "public, max-age=31536000, immutable" if "/assets/" in ("/" + rel) else "no-cache"
            self._send_public_file(candidate, cache_control=cache)
            return True
        # The React app uses hash routing, but returning index.html for a normal
        # path makes reverse-proxy and bookmark behavior more robust.
        index = FRONTEND_DIST / "index.html"
        if index.is_file() and not path.startswith("/api/"):
            self._send_public_file(index, "text/html; charset=utf-8", "no-cache")
            return True
        return False

    def _session_token(self) -> str | None:
        header = self.headers.get("Cookie", "")
        if not header:
            return None
        cookie = SimpleCookie()
        try:
            cookie.load(header)
        except Exception:
            return None
        morsel = cookie.get(SESSION_COOKIE)
        return morsel.value if morsel else None

    def _current_user(self) -> AuthUser | None:
        return user_from_session(self._session_token())

    def _department_token(self) -> str | None:
        token = self.headers.get("X-Department-Token", "").strip()
        return token or None

    def _require_user(self) -> AuthUser | None:
        user = self._current_user()
        if user is None:
            self._send_json({"detail": "Authentication required", "code": "AUTH_REQUIRED"}, status=401)
            return None
        return user

    def _require_global(self) -> AuthUser | None:
        user = self._require_user()
        if user is None:
            return None
        if not _authorized_for_global_data(user):
            self._send_json(
                {
                    "detail": "This account is restricted to its institution portal",
                    "code": "INSTITUTION_SCOPE_ONLY",
                },
                status=403,
            )
            return None
        return user

    def _require_company_admin(self) -> AuthUser | None:
        user = self._require_user()
        if user is None:
            return None
        if not _is_company_admin(user):
            self._send_json({"detail": "Company administrator access required", "code": "FORBIDDEN"}, status=403)
            return None
        return user

    def _require_company_reviewer(self) -> AuthUser | None:
        user = self._require_user()
        if user is None:
            return None
        if user.organization_type != "COMPANY" or user.role not in {"COMPANY_ADMIN", "COMPANY_PROJECT_MANAGER", "COMPANY_REVIEWER"}:
            self._send_json({"detail": "Company reviewer access required", "code": "FORBIDDEN"}, status=403)
            return None
        return user

    def do_OPTIONS(self):
        self.send_response(HTTPStatus.NO_CONTENT)
        self._cors()
        self._security_headers()
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"
        query = parse_qs(parsed.query)

        try:
            if path == "/":
                if self._serve_frontend(path):
                    return
                self._send_json({
                    "status": "ok",
                    "service": SERVICE,
                    "version": VERSION,
                    "project": PROJECT_TITLE,
                    "health": "/health",
                    "auth": "/api/v1/auth/portal-config",
                })
                return

            if path == "/health":
                self._send_json({"status": "ok", "service": SERVICE, "version": VERSION, "auth": "enabled"})
                return

            if path == "/api/v1/auth/portal-config":
                self._send_json(portal_config())
                return

            if path == "/api/v1/auth/me":
                user = self._require_user()
                if user:
                    self._send_json({"user": user.public()})
                return

            if path == "/docs":
                self._send_json({
                    "service": SERVICE,
                    "version": VERSION,
                    "authentication": "HttpOnly session cookie",
                    "roles": ["COMPANY", "CNNL", "INSTITUTION"],
                    "public_endpoints": ["/health", "/api/v1/auth/portal-config", "/api/v1/auth/login"],
                    "protected_endpoints": [
                        "/api/v1/auth/me",
                        "/api/v1/summary",
                        "/api/v1/flights",
                        "/api/v1/map/tracks",
                        "/api/v1/map/endpoints",
                        "/api/v1/map/points",
                        "/api/v1/gis/nakshatech-survey",
                        "/api/v1/gis/nakshatech-survey/{dataset_id}",
                        "/api/v1/institution/overview",
                        "/api/v1/admin/access-summary",
                        "/api/v1/scientific/summary",
                        "/api/v1/scientific/records",
                        "/api/v1/industry-intelligence/summary",
                        "/api/v1/industry-intelligence/observations",
                        "/api/v1/industry/status",
                        "/api/v1/industry/latest",
                        "/api/v1/industry/discover",
                    ],
                })
                return

            if path == "/api/v1/media/status":
                user = self._require_user()
                if user:
                    self._send_json(media_status())
                return

            if path == "/api/v1/media/pairs":
                user = self._require_user()
                if user:
                    self._send_json(list_video_srt_pairs())
                return

            media_pair_prefix = "/api/v1/media/pairs/"
            if path.startswith(media_pair_prefix):
                user = self._require_user()
                if not user:
                    return
                tail = unquote(path[len(media_pair_prefix):]).strip("/")
                pair_id, sep, kind = tail.partition("/")
                if not sep or kind not in {"video", "srt"}:
                    self._send_json({"detail": "Media pair endpoint not found"}, status=404)
                    return
                try:
                    row, video_path, srt_path = media_pair_paths(pair_id)
                except LookupError as exc:
                    self._send_json({"detail": str(exc)}, status=404)
                    return
                if kind == "video":
                    self._send_public_file(video_path, cache_control="private, max-age=3600")
                else:
                    self._send_public_file(srt_path, "text/plain; charset=utf-8", "private, no-cache")
                return

            if path == "/videos/video-playlist.json":
                self._send_json([row["url"] for row in list_showcase_videos()])
                return

            if path.startswith("/videos/"):
                filename = unquote(path[len("/videos/"):])
                video_path = showcase_video_path(filename)
                if not video_path:
                    self._send_json({"detail": "Video not found"}, status=404)
                    return
                self._send_public_file(video_path, cache_control="public, max-age=3600")
                return

            if path == "/api/v1/events/upcoming":
                user = self._require_user()
                if user:
                    self._send_json(current_upcoming_event(user))
                return

            if path == "/api/v1/events/completed":
                user = self._require_user()
                if not user:
                    return
                raw_limit = query.get("limit", ["50"])[0]
                self._send_json(completed_events(user, int(raw_limit)))
                return

            if path == "/api/v1/events":
                user = self._require_user()
                if not user:
                    return
                self._send_json(list_events(user, status=query.get("status", [None])[0]))
                return

            if path == "/api/v1/industry-intelligence/summary":
                user = self._require_user()
                if user:
                    self._send_json(industry_intelligence_summary(user))
                return

            if path == "/api/v1/industry-intelligence/observations":
                user = self._require_user()
                if not user:
                    return
                raw_day = query.get("day", [None])[0]
                day = int(raw_day) if raw_day not in {None, ""} else None
                self._send_json(list_industry_observations(
                    user,
                    status=query.get("status", [None])[0],
                    discharge_status=query.get("discharge_status", [None])[0],
                    day=day,
                    search=query.get("search", [None])[0],
                    limit=int(query.get("limit", ["1000"])[0]),
                ))
                return

            industry_evidence_prefix = "/api/v1/industry-intelligence/evidence/"
            if path.startswith(industry_evidence_prefix):
                user = self._require_user()
                if not user:
                    return
                evidence_id = unquote(path[len(industry_evidence_prefix):])
                meta, evidence_path = industry_evidence_for_user(user, evidence_id)
                self._send_inline_file(evidence_path, meta["original_name"], meta["content_type"])
                return

            industry_get_prefix = "/api/v1/industry-intelligence/observations/"
            if path.startswith(industry_get_prefix):
                user = self._require_user()
                if not user:
                    return
                observation_id = unquote(path[len(industry_get_prefix):])
                if "/" not in observation_id:
                    self._send_json(get_industry_observation(user, observation_id))
                    return

            if path == "/api/v1/industry/status":
                user = self._require_user()
                if user:
                    self._send_json(industry_source_status(user))
                return

            if path == "/api/v1/industry/latest":
                user = self._require_user()
                if user:
                    latest = latest_industry_discovery(user)
                    self._send_json(latest or {"run_id": None, "version": "V29.4", "candidates": [], "counts": {"total": 0}})
                return
            if path == "/api/v1/scientific/summary":
                user = self._require_user()
                if user:
                    self._send_json(scientific_summary(user))
                return

            if path == "/api/v1/scientific/micro-catchments":
                user = self._require_user()
                if user:
                    self._send_json(list_micro_catchments(user))
                return

            if path == "/api/v1/scientific/records":
                user = self._require_user()
                if not user:
                    return
                self._send_json(list_scientific_records(
                    user,
                    record_type=query.get("record_type", [None])[0],
                    status=query.get("status", [None])[0],
                    institution_id=query.get("institution_id", [None])[0],
                    micro_catchment_id=query.get("micro_catchment_id", [None])[0],
                    limit=int(query.get("limit", ["1000"])[0]),
                ))
                return

            if path == "/api/v1/scientific/package":
                user = self._require_user()
                if user:
                    self._send_json(package_status(user, query.get("institution_id", [None])[0]))
                return

            event_media_prefix = "/api/v1/events/media/"
            if path.startswith(event_media_prefix):
                user = self._require_user()
                if not user:
                    return
                image_id = unquote(path[len(event_media_prefix):])
                meta, image_path = event_image_for_user(user, image_id)
                self._send_inline_file(image_path, meta["original_name"], meta["content_type"])
                return

            event_get_prefix = "/api/v1/events/"
            if path.startswith(event_get_prefix):
                user = self._require_user()
                if not user:
                    return
                event_id = unquote(path[len(event_get_prefix):])
                if "/" not in event_id:
                    self._send_json(get_event(user, event_id))
                    return

            if path == "/api/v18/permissions/me":
                user = self._require_user()
                if user:
                    self._send_json(permissions_for_user(user))
                return

            if path == "/api/v18/tasks":
                user = self._require_user()
                if not user:
                    return
                self._send_json(list_tasks(
                    user,
                    status=query.get("status", [None])[0],
                    department_id=query.get("department_id", [None])[0],
                ))
                return

            task_get_prefix = "/api/v18/tasks/"
            if path.startswith(task_get_prefix):
                user = self._require_user()
                if not user:
                    return
                tail = unquote(path[len(task_get_prefix):])
                if "/" not in tail:
                    self._send_json(get_task(user, tail))
                    return

            if path == "/api/v18/workflows":
                user = self._require_user()
                if not user:
                    return
                self._send_json(list_visible_workflows(
                    user,
                    status=query.get("status", [None])[0],
                    department_id=query.get("department_id", [None])[0],
                    source_type=query.get("source_type", [None])[0],
                    limit=int(query.get("limit", ["1000"])[0]),
                ))
                return

            if path == "/api/v18/task-targets":
                user = self._require_user()
                if not user:
                    return
                self._send_json(task_targets(user))
                return

            if path == "/api/v18/review/queue":
                user = self._require_user()
                if not user:
                    return
                self._send_json(list_review_queue(
                    user,
                    status=query.get("status", [None])[0],
                    department_id=query.get("department_id", [None])[0],
                    source_type=query.get("source_type", [None])[0],
                ))
                return

            workflow_get_prefix = "/api/v18/workflow/"
            if path.startswith(workflow_get_prefix):
                user = self._require_user()
                if not user:
                    return
                tail = unquote(path[len(workflow_get_prefix):])
                if "/" not in tail:
                    self._send_json(get_workflow(user, tail))
                    return

            if path == "/api/v18/notifications":
                user = self._require_user()
                if not user:
                    return
                unread = query.get("unread", ["0"])[0].lower() in {"1", "true", "yes"}
                self._send_json(list_notifications(user, unread_only=unread, limit=int(query.get("limit", ["200"])[0])))
                return

            if path == "/api/v18/audit":
                user = self._require_user()
                if not user:
                    return
                self._send_json(list_audit(
                    user,
                    limit=int(query.get("limit", ["200"])[0]),
                    module=query.get("module", [None])[0],
                ))
                return

            if path == "/api/v18/cnnl/approved":
                user = self._require_user()
                if not user:
                    return
                self._send_json(list_cnnl_approved(user, limit=int(query.get("limit", ["500"])[0])))
                return

            if path == "/api/v1/repository/departments":
                user = self._require_user()
                if user:
                    self._send_json(departments_for_user(user))
                return

            if path == "/api/v1/repository/company/summary":
                user = self._require_company_admin()
                if user:
                    self._send_json(company_repository_summary(user))
                return

            if path == "/api/v1/repository/company/batches":
                user = self._require_company_admin()
                if not user:
                    return
                filters = {
                    "department_id": query.get("department_id", [None])[0],
                    "date_from": query.get("date_from", [None])[0],
                    "date_to": query.get("date_to", [None])[0],
                    "data_date_from": query.get("data_date_from", [None])[0],
                    "data_date_to": query.get("data_date_to", [None])[0],
                    "category": query.get("category", [None])[0],
                    "extension": query.get("extension", [None])[0],
                    "search": query.get("search", [None])[0],
                    "order": query.get("order", ["latest"])[0],
                }
                self._send_json(list_company_batches(user, filters))
                return

            if path == "/api/v1/repository/company/activity":
                user = self._require_company_admin()
                if not user:
                    return
                raw_limit = query.get("limit", ["100"])[0]
                self._send_json(recent_activity(user, int(raw_limit)))
                return

            if path == "/api/v1/repository/company/audit":
                user = self._require_company_admin()
                if not user:
                    return
                raw_limit = query.get("limit", ["200"])[0]
                self._send_json(repository_audit(user, int(raw_limit)))
                return

            if path == "/api/v1/repository/department/batches":
                user = self._require_user()
                if not user:
                    return
                filters = {
                    "date_from": query.get("date_from", [None])[0],
                    "date_to": query.get("date_to", [None])[0],
                    "data_date_from": query.get("data_date_from", [None])[0],
                    "data_date_to": query.get("data_date_to", [None])[0],
                    "category": query.get("category", [None])[0],
                    "extension": query.get("extension", [None])[0],
                    "search": query.get("search", [None])[0],
                    "order": query.get("order", ["latest"])[0],
                }
                self._send_json(list_department_batches(user, self._department_token() or "", filters))
                return

            repo_file_prefix = "/api/v1/repository/files/"
            if path.startswith(repo_file_prefix) and path.endswith("/download"):
                user = self._require_user()
                if not user:
                    return
                file_id = unquote(path[len(repo_file_prefix):-9].rstrip("/"))
                meta, file_path = file_for_download(user, file_id, self._department_token())
                self._send_file(file_path, meta["original_name"], meta.get("content_type") or "application/octet-stream")
                return

            repo_batch_prefix = "/api/v1/repository/batches/"
            if path.startswith(repo_batch_prefix) and path.endswith("/download"):
                user = self._require_user()
                if not user:
                    return
                batch_id = unquote(path[len(repo_batch_prefix):-9].rstrip("/"))
                filename, zip_path = batch_zip_for_download(user, batch_id, self._department_token())
                self._send_file(zip_path, filename, "application/zip")
                return

            if path == "/api/v1/repository/department/export":
                user = self._require_user()
                if not user:
                    return
                filters = {
                    "date_from": query.get("date_from", [None])[0],
                    "date_to": query.get("date_to", [None])[0],
                    "data_date_from": query.get("data_date_from", [None])[0],
                    "data_date_to": query.get("data_date_to", [None])[0],
                    "category": query.get("category", [None])[0],
                    "extension": query.get("extension", [None])[0],
                    "search": query.get("search", [None])[0],
                    "order": query.get("order", ["latest"])[0],
                }
                filename, zip_path, _stats = department_export_zip(user, self._department_token() or "", filters)
                self._send_file(zip_path, filename, "application/zip")
                return

            if path == "/api/v1/repository/company/export":
                user = self._require_company_admin()
                if not user:
                    return
                filters = {
                    "department_id": query.get("department_id", [None])[0],
                    "date_from": query.get("date_from", [None])[0],
                    "date_to": query.get("date_to", [None])[0],
                    "data_date_from": query.get("data_date_from", [None])[0],
                    "data_date_to": query.get("data_date_to", [None])[0],
                    "category": query.get("category", [None])[0],
                    "extension": query.get("extension", [None])[0],
                    "search": query.get("search", [None])[0],
                    "order": query.get("order", ["latest"])[0],
                }
                filename, zip_path, _stats = company_export_zip(user, filters)
                self._send_file(zip_path, filename, "application/zip")
                return

            if path == "/api/v1/institution/overview":
                user = self._require_user()
                if not user:
                    return
                if user.organization_type != "INSTITUTION":
                    self._send_json({"detail": "Institution account required", "code": "FORBIDDEN"}, status=403)
                    return
                overview = institution_overview(user)
                metrics = institution_metrics(user)
                overview["metrics"].update({
                    "surveyed": metrics["field_records"],
                    "samples": metrics["samples"],
                    "progress_pct": metrics["progress_pct"],
                    "total_records": metrics["total_records"],
                    "drafts": metrics["drafts"],
                    "submitted": metrics["submitted"],
                    "under_review": metrics["under_review"],
                    "returned": metrics["returned"],
                    "approved": metrics["approved"],
                })
                overview["data_status"] = "field_data_entry_enabled"
                overview["note"] = "Institution data-entry is active. Progress percentage remains blank until official location/watershed allocation data is supplied."
                overview["available_actions"] = ["create_field_record", "save_draft", "upload_attachment", "submit_for_review", "view_review_status"]
                self._send_json(overview)
                return

            if path == "/api/v1/institution/entries":
                user = self._require_user()
                if not user:
                    return
                if user.organization_type != "INSTITUTION":
                    self._send_json({"detail": "Institution account required", "code": "FORBIDDEN"}, status=403)
                    return
                self._send_json(list_entries(user, status=query.get("status", [None])[0], entry_type=query.get("type", [None])[0]))
                return

            inst_prefix = "/api/v1/institution/entries/"
            if path.startswith(inst_prefix):
                user = self._require_user()
                if not user:
                    return
                if user.organization_type != "INSTITUTION":
                    self._send_json({"detail": "Institution account required", "code": "FORBIDDEN"}, status=403)
                    return
                public_id = unquote(path[len(inst_prefix):])
                if "/" not in public_id:
                    self._send_json(get_entry(user, public_id))
                    return

            if path == "/api/v1/review/entries":
                user = self._require_company_reviewer()
                if not user:
                    return
                self._send_json(list_entries(user, status=query.get("status", [None])[0], entry_type=query.get("type", [None])[0]))
                return

            if path == "/api/v1/civil/approved":
                user = self._require_user()
                if not user:
                    return
                if not _authorized_for_global_data(user):
                    self._send_json({"detail": "Project monitoring access required", "code": "FORBIDDEN"}, status=403)
                    return
                self._send_json(list_entries(user, status="APPROVED", entry_type=query.get("type", [None])[0]))
                return

            att_prefix = "/api/v1/attachments/"
            if path.startswith(att_prefix):
                user = self._require_user()
                if not user:
                    return
                if user.organization_type == "COMPANY" and user.role == "COMPANY_DEPARTMENT_USER":
                    self._send_json({"detail": "Department uploader access is limited to the Department Data Hub", "code": "FORBIDDEN"}, status=403)
                    return
                attachment_id = unquote(path[len(att_prefix):])
                meta, file_path = attachment_for_user(user, attachment_id)
                self._send_file(file_path, meta["original_name"], meta["content_type"])
                return

            if path == "/api/v1/admin/access-summary":
                user = self._require_company_admin()
                if user:
                    self._send_json(list_access_summary())
                return

            survey_prefix = "/api/v1/gis/nakshatech-survey"
            if path == survey_prefix or path.startswith(survey_prefix + "/"):
                user = self._require_user()
                if not user:
                    return
                if user.organization_type != "COMPANY" or user.role == "COMPANY_DEPARTMENT_USER":
                    self._send_json({"detail": "NakshaTech survey data requires company GIS access", "code": "FORBIDDEN"}, status=403)
                    return
                if path == survey_prefix:
                    self._send_json(survey_catalogue())
                else:
                    dataset_id = unquote(path[len(survey_prefix) + 1:])
                    self._send_json(survey_geojson(dataset_id))
                return

            if path == "/production_data" or path.startswith("/production_data/"):
                self._send_json({"detail": "Not Found"}, status=404)
                return

            # PUBLIC_PRODUCTION_FRONTEND_BEFORE_AUTH
            # The browser must be able to download the built React shell, JS, CSS,
            # branding files and SPA routes before a user has a session. API data
            # remains protected by the authorization checks below.
            if not path.startswith("/api/"):
                if self._serve_frontend(path):
                    return

            # Everything below this point is project-wide survey evidence and is
            # intentionally limited to Company/CNNL until institution allocation
            # data is provided.
            if not self._require_global():
                return

            if path == "/api/v1/summary":
                self._send_json(summary())
                return

            if path == "/api/v1/days":
                self._send_json(summary().get("days", []))
                return

            if path == "/api/v1/flights":
                items = flights()
                raw_day = query.get("day", [None])[0]
                if raw_day is not None:
                    try:
                        day = int(raw_day)
                    except ValueError as exc:
                        raise ValueError("day must be an integer from 3 to 8") from exc
                    if day not in range(3, 9):
                        raise ValueError("day must be an integer from 3 to 8")
                    items = [item for item in items if item.get("day") == day]
                keys = (
                    "id", "day", "sequence", "clip", "distance_km",
                    "reported_points", "rendered_vertices", "duration_label",
                    "alt_min_m", "alt_max_m", "start", "end",
                )
                self._send_json([{key: item.get(key) for key in keys} for item in items])
                return

            prefix = "/api/v1/flights/"
            if path.startswith(prefix):
                flight_id = unquote(path[len(prefix):])
                item = next((item for item in flights() if item.get("id") == flight_id), None)
                if item is None:
                    self._send_json({"detail": "Flight not found"}, status=404)
                else:
                    self._send_json(item)
                return

            if path == "/api/v1/map/tracks":
                selected = parse_days(query.get("days", [None])[0])
                self._send_json(filtered_geojson(tracks(), selected))
                return

            if path == "/api/v1/map/endpoints":
                selected = parse_days(query.get("days", [None])[0])
                self._send_json(filtered_geojson(endpoints(), selected))
                return

            if path == "/api/v1/map/points":
                selected = parse_days(query.get("days", [None])[0])
                self._send_json(filtered_geojson(points(), selected))
                return

            if path == "/api/v1/point-verification":
                self._send_json(point_verification())
                return

            if path == "/api/v1/data-availability":
                self._send_json(availability())
                return

            if path == "/api/v1/verification":
                self._send_json(verification())
                return

            if self._serve_frontend(path):
                return
            self._send_json({"detail": "Not Found", "path": path}, status=404)

        except PermissionError as exc:
            self._send_json({"detail": str(exc), "code": "FORBIDDEN"}, status=403)
        except LookupError as exc:
            self._send_json({"detail": str(exc)}, status=404)
        except ValueError as exc:
            self._send_json({"detail": str(exc)}, status=400)
        except FileNotFoundError as exc:
            self._send_json({"detail": str(exc)}, status=500)
        except Exception as exc:
            traceback.print_exc()
            detail = f"Internal server error: {exc}" if DEBUG_ERRORS else "Internal server error"
            self._send_json({"detail": detail}, status=500)

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"
        try:
            if path == "/api/v1/auth/login":
                ip = _client_ip(self)
                if _is_login_limited(ip):
                    self._send_json(
                        {"detail": "Too many failed login attempts. Try again in a few minutes.", "code": "LOGIN_RATE_LIMIT"},
                        status=429,
                    )
                    return
                body = self._read_json()
                user, error = authenticate(
                    portal=str(body.get("portal", "")),
                    email=str(body.get("email", "")),
                    password=str(body.get("password", "")),
                    institution_id=(str(body.get("institution_id")) if body.get("institution_id") else None),
                    ip_address=ip,
                )
                if not user:
                    _register_login_failure(ip)
                    self._send_json({"detail": error or "Login failed", "code": "LOGIN_FAILED"}, status=401)
                    return
                _clear_login_failures(ip)
                token, _expires = create_session(
                    user.id,
                    ip_address=ip,
                    user_agent=self.headers.get("User-Agent"),
                )
                cookie = self._session_cookie_header(token, max_age=SESSION_HOURS * 60 * 60)
                self._send_json({"user": user.public()}, extra_headers=[("Set-Cookie", cookie)])
                return

            if path == "/api/v1/auth/logout":
                destroy_session(self._session_token())
                cookie = self._session_cookie_header("", max_age=0)
                self._send_json({"status": "ok"}, extra_headers=[("Set-Cookie", cookie)])
                return

            if path == "/api/v1/auth/change-password":
                user = self._require_user()
                if not user:
                    return
                body = self._read_json()
                ok, message = change_password(
                    user.id,
                    str(body.get("current_password", "")),
                    str(body.get("new_password", "")),
                )
                if not ok:
                    self._send_json({"detail": message}, status=400)
                else:
                    cookie = self._session_cookie_header("", max_age=0)
                    self._send_json({"status": "ok", "message": message, "reauthenticate": True}, extra_headers=[("Set-Cookie", cookie)])
                return

            if path == "/api/v1/events":
                user = self._require_company_admin()
                if not user:
                    return
                self._send_json(create_event(user, self._read_json()), status=201)
                return

            if path == "/api/v1/industry-intelligence/observations":
                user = self._require_user()
                if not user:
                    return
                self._send_json(create_industry_observation(user, self._read_json()), status=201)
                return

            industry_observation_prefix = "/api/v1/industry-intelligence/observations/"
            if path.startswith(industry_observation_prefix):
                user = self._require_user()
                if not user:
                    return
                tail = unquote(path[len(industry_observation_prefix):])
                if tail.endswith("/update"):
                    observation_id = tail[:-7].rstrip("/")
                    self._send_json(update_industry_observation(user, observation_id, self._read_json()))
                    return
                if tail.endswith("/status"):
                    observation_id = tail[:-7].rstrip("/")
                    body = self._read_json()
                    self._send_json(set_industry_observation_status(
                        user, observation_id, str(body.get("status", "")), str(body.get("registration_reference", ""))
                    ))
                    return
                if tail.endswith("/delete"):
                    observation_id = tail[:-7].rstrip("/")
                    self._send_json(delete_industry_observation(user, observation_id))
                    return
                if tail.endswith("/evidence"):
                    observation_id = tail[:-9].rstrip("/")
                    filename = parse_qs(parsed.query).get("filename", [""])[0]
                    if not filename:
                        raise ValueError("filename is required")
                    content = self._read_bytes(max_bytes=10 * 1024 * 1024)
                    created = save_industry_evidence(
                        user, observation_id, filename, self.headers.get("Content-Type"), content
                    )
                    self._send_json(created, status=201)
                    return

            if path == "/api/v1/industry/discover":
                user = self._require_user()
                if not user:
                    return
                result = discover_industries(user, self._read_json())
                counts = result.get("counts") if isinstance(result, dict) else {}
                sources = result.get("sources") if isinstance(result, dict) else {}
                kiadb = sources.get("kiadb", {}) if isinstance(sources, dict) else {}
                osm = sources.get("openstreetmap", {}) if isinstance(sources, dict) else {}
                places = sources.get("google_places", {}) if isinstance(sources, dict) else {}
                print(
                    "[V29.6.11 DISCOVERY] "
                    f"video={result.get('video_name','')} srt={result.get('srt_name','')} "
                    f"total={counts.get('total',0)} kiadb={counts.get('kiadb',0)} osm={counts.get('openstreetmap',0)} "
                    f"kiadb_ok={kiadb.get('ok')} kiadb_raw={kiadb.get('count',0)} "
                    f"kiadb_candidate_queries={kiadb.get('candidate_query_count',0)} "
                    f"kiadb_candidate_matches={kiadb.get('candidate_match_count',0)} "
                    f"kiadb_candidate_enriched={kiadb.get('candidate_enriched_count',0)} "
                    f"kiadb_candidate_exact={kiadb.get('candidate_exact_count',0)} "
                    f"kiadb_candidate_nearby={kiadb.get('candidate_nearby_count',0)} "
                    f"osm_ok={osm.get('ok')} osm_raw={osm.get('count',0)} "
                    f"osm_mode={osm.get('retrieval_mode','')} cache_used={osm.get('cache_used',False)} "
                    f"cache_count={osm.get('cache_count',0)} "
                    f"identity_anchors={osm.get('identity_anchor_count',0)} identity_enriched={osm.get('identity_enriched_count',0)} "
                    f"identity_exact={osm.get('identity_exact_count',0)} identity_nearby={osm.get('identity_nearby_count',0)} "
                    f"google_configured={places.get('configured',False)} "
                    f"google_anchors={places.get('count',0)} "
                    f"google_enriched={places.get('identity_enriched_count',0)} "
                    f"google_point_queries={places.get('point_query_count',0)} google_broad_queries={places.get('broad_query_count',0)}"
                )
                if not kiadb.get("ok"):
                    print(f"[V29.6.11 KIADB] {kiadb.get('message','')}")
                elif kiadb.get("candidate_lookup_attempted") and not kiadb.get("candidate_lookup_ok", True):
                    print(f"[V29.6.11 KIADB] {kiadb.get('candidate_message','')}")
                if not osm.get("ok"):
                    print(f"[V29.6.11 OSM] {osm.get('message','')}")
                if places.get("attempted") and not places.get("ok"):
                    print(f"[V29.6.11 PLACES] {places.get('message','')}")
                self._send_json(result, status=201)
                return
            if path == "/api/v1/scientific/records":
                user = self._require_user()
                if not user:
                    return
                self._send_json(create_scientific_record(user, self._read_json()), status=201)
                return

            if path == "/api/v1/scientific/validate":
                user = self._require_user()
                if not user:
                    return
                self._send_json(validate_dataset(user, self._read_json()))
                return

            scientific_record_prefix = "/api/v1/scientific/records/"
            if path.startswith(scientific_record_prefix):
                user = self._require_user()
                if not user:
                    return
                tail = unquote(path[len(scientific_record_prefix):])
                if tail.endswith("/update"):
                    record_id = tail[:-7].rstrip("/")
                    self._send_json(update_scientific_record(user, record_id, self._read_json()))
                    return
                if tail.endswith("/action"):
                    record_id = tail[:-7].rstrip("/")
                    body = self._read_json()
                    self._send_json(scientific_record_action(user, record_id, str(body.get("action", "")), str(body.get("comment", ""))))
                    return
                if tail.endswith("/delete"):
                    record_id = tail[:-7].rstrip("/")
                    self._send_json(delete_scientific_record(user, record_id))
                    return

            scientific_mc_prefix = "/api/v1/scientific/micro-catchments/"
            if path.startswith(scientific_mc_prefix) and path.endswith("/update"):
                user = self._require_user()
                if not user:
                    return
                mc_id = unquote(path[len(scientific_mc_prefix):-7].rstrip("/"))
                self._send_json(update_micro_catchment(user, mc_id, self._read_json()))
                return

            scientific_package_prefix = "/api/v1/scientific/package/"
            if path.startswith(scientific_package_prefix):
                user = self._require_user()
                if not user:
                    return
                item_key = unquote(path[len(scientific_package_prefix):]).strip("/")
                body = self._read_json()
                self._send_json(update_package_item(user, item_key, body, str(body.get("institution_id", "")).strip() or None))
                return

            event_post_prefix = "/api/v1/events/"
            if path.startswith(event_post_prefix):
                user = self._require_company_admin()
                if not user:
                    return
                tail = unquote(path[len(event_post_prefix):])
                if tail.endswith("/update"):
                    event_id = tail[:-7].rstrip("/")
                    self._send_json(update_event(user, event_id, self._read_json()))
                    return
                if tail.endswith("/status"):
                    event_id = tail[:-7].rstrip("/")
                    body = self._read_json()
                    self._send_json(set_event_status(user, event_id, str(body.get("status", ""))))
                    return
                if tail.endswith("/delete") and "/images/" not in tail:
                    event_id = tail[:-7].rstrip("/")
                    self._send_json(delete_event(user, event_id))
                    return
                if tail.endswith("/images"):
                    event_id = tail[:-7].rstrip("/")
                    filename = parse_qs(parsed.query).get("filename", [""])[0]
                    if not filename:
                        raise ValueError("filename is required")
                    content = self._read_bytes(max_bytes=15 * 1024 * 1024)
                    self._send_json(save_event_image(user, event_id, filename, self.headers.get("Content-Type"), content), status=201)
                    return
                if "/images/" in tail and tail.endswith("/delete"):
                    event_id, image_tail = tail.split("/images/", 1)
                    image_id = image_tail[:-7].rstrip("/")
                    self._send_json(delete_event_image(user, event_id.rstrip("/"), image_id))
                    return

            if path == "/api/v18/tasks":
                user = self._require_user()
                if not user:
                    return
                body = self._read_json()
                created = create_task(
                    user,
                    title=str(body.get("title", "")),
                    description=str(body.get("description", "")),
                    department_id=(str(body.get("department_id")) if body.get("department_id") else None),
                    institution_id=(str(body.get("institution_id")) if body.get("institution_id") else None),
                    micro_catchment_id=(str(body.get("micro_catchment_id")) if body.get("micro_catchment_id") else None),
                    priority=str(body.get("priority", "MEDIUM")),
                    due_date=(str(body.get("due_date")) if body.get("due_date") else None),
                    ip_address=_client_ip(self),
                    user_agent=self.headers.get("User-Agent", ""),
                )
                self._send_json(created, status=201)
                return

            task_post_prefix = "/api/v18/tasks/"
            if path.startswith(task_post_prefix):
                user = self._require_user()
                if not user:
                    return
                tail = unquote(path[len(task_post_prefix):])
                if tail.endswith("/assign"):
                    task_id = tail[:-7].rstrip("/")
                    body = self._read_json()
                    result = assign_task(
                        user,
                        task_id,
                        assignee_user_id=(int(body["assignee_user_id"]) if body.get("assignee_user_id") else None),
                        assignee_organization_id=(str(body.get("assignee_organization_id")) if body.get("assignee_organization_id") else None),
                        assignee_department_id=(str(body.get("assignee_department_id")) if body.get("assignee_department_id") else None),
                        primary=bool(body.get("primary", True)),
                        comment=str(body.get("comment", "")),
                        ip_address=_client_ip(self),
                        user_agent=self.headers.get("User-Agent", ""),
                    )
                    self._send_json(result)
                    return
                if tail.endswith("/action"):
                    task_id = tail[:-7].rstrip("/")
                    body = self._read_json()
                    result = transition_task(
                        user,
                        task_id,
                        str(body.get("action", "")),
                        comment=str(body.get("comment", "")),
                        ip_address=_client_ip(self),
                        user_agent=self.headers.get("User-Agent", ""),
                    )
                    self._send_json(result)
                    return

            workflow_post_prefix = "/api/v18/workflow/"
            if path.startswith(workflow_post_prefix) and path.endswith("/action"):
                user = self._require_user()
                if not user:
                    return
                workflow_id = unquote(path[len(workflow_post_prefix):-7].rstrip("/"))
                body = self._read_json()
                result = transition_workflow(
                    user,
                    workflow_id,
                    str(body.get("action", "")),
                    comment=str(body.get("comment", "")),
                    ip_address=_client_ip(self),
                    user_agent=self.headers.get("User-Agent", ""),
                )
                self._send_json(result)
                return

            notification_post_prefix = "/api/v18/notifications/"
            if path.startswith(notification_post_prefix) and path.endswith("/read"):
                user = self._require_user()
                if not user:
                    return
                notification_id = unquote(path[len(notification_post_prefix):-5].rstrip("/"))
                self._send_json(mark_notification_read(user, notification_id))
                return

            if path == "/api/v1/repository/unlock":
                user = self._require_user()
                if not user:
                    return
                body = self._read_json()
                self._send_json(unlock_department(user, str(body.get("department_id", "")), str(body.get("passkey", "")), str(body.get("purpose", "BROWSE"))))
                return

            rotate_prefix = "/api/v1/repository/company/departments/"
            if path.startswith(rotate_prefix) and path.endswith("/rotate-passkey"):
                user = self._require_company_admin()
                if not user:
                    return
                dep_id = unquote(path[len(rotate_prefix):-15].rstrip("/"))
                self._send_json(rotate_department_passkey(user, dep_id))
                return

            if path == "/api/v1/repository/batches":
                user = self._require_user()
                if not user:
                    return
                body = self._read_json()
                created = create_batch(
                    user, self._department_token() or "",
                    data_date=str(body.get("data_date", "")),
                    category=str(body.get("category", "")),
                    description=str(body.get("description", "")),
                    remarks=str(body.get("remarks", "")),
                    uploader_label=str(body.get("uploader_label", "")),
                )
                self._send_json(created, status=201)
                return

            batch_prefix = "/api/v1/repository/batches/"
            if path.startswith(batch_prefix) and path.endswith("/files/init"):
                user = self._require_user()
                if not user:
                    return
                batch_id = unquote(path[len(batch_prefix):-11].rstrip("/"))
                body = self._read_json()
                result = init_upload(
                    user, self._department_token() or "", batch_id,
                    filename=str(body.get("filename", "")),
                    size_bytes=int(body.get("size_bytes", 0)),
                    content_type=(str(body.get("content_type")) if body.get("content_type") else None),
                )
                self._send_json(result, status=201 if not result.get("resumed") else 200)
                return

            upload_prefix = "/api/v1/repository/uploads/"
            if path.startswith(upload_prefix) and path.endswith("/chunk"):
                user = self._require_user()
                if not user:
                    return
                upload_id = unquote(path[len(upload_prefix):-6].rstrip("/"))
                raw_offset = parse_qs(parsed.query).get("offset", [self.headers.get("X-Upload-Offset", "0")])[0]
                content = self._read_bytes(max_bytes=CHUNK_SIZE)
                self._send_json(append_upload_chunk(user, self._department_token() or "", upload_id, offset=int(raw_offset), content=content))
                return

            if path.startswith(upload_prefix) and path.endswith("/complete"):
                user = self._require_user()
                if not user:
                    return
                upload_id = unquote(path[len(upload_prefix):-9].rstrip("/"))
                self._send_json(complete_upload(user, self._department_token() or "", upload_id))
                return

            if path.startswith(batch_prefix) and path.endswith("/finalize"):
                user = self._require_user()
                if not user:
                    return
                batch_id = unquote(path[len(batch_prefix):-9].rstrip("/"))
                result = finalize_batch(user, self._department_token() or "", batch_id)
                sync_workflows()
                self._send_json(result)
                return

            if path == "/api/v1/institution/entries":
                user = self._require_user()
                if not user:
                    return
                body = self._read_json()
                created = create_entry(
                    user,
                    str(body.get("entry_type", "")),
                    body.get("fields", {}),
                    submit=bool(body.get("submit", False)),
                )
                sync_workflows()
                self._send_json(created, status=201)
                return

            inst_prefix = "/api/v1/institution/entries/"
            if path.startswith(inst_prefix):
                user = self._require_user()
                if not user:
                    return
                tail = unquote(path[len(inst_prefix):])
                if tail.endswith("/submit"):
                    public_id = tail[:-7].rstrip("/")
                    result = submit_entry(user, public_id)
                    sync_workflows()
                    self._send_json(result)
                    return
                if tail.endswith("/update"):
                    public_id = tail[:-7].rstrip("/")
                    body = self._read_json()
                    self._send_json(update_entry(user, public_id, body.get("fields", {})))
                    return
                if tail.endswith("/attachments"):
                    public_id = tail[:-12].rstrip("/")
                    filename = parse_qs(parsed.query).get("filename", [""])[0]
                    if not filename:
                        raise ValueError("filename is required")
                    content = self._read_bytes()
                    created = save_attachment(user, public_id, filename, self.headers.get("Content-Type"), content)
                    self._send_json(created, status=201)
                    return

            review_prefix = "/api/v1/review/entries/"
            if path.startswith(review_prefix) and path.endswith("/action"):
                user = self._require_company_reviewer()
                if not user:
                    return
                public_id = unquote(path[len(review_prefix):-7].rstrip("/"))
                body = self._read_json()
                legacy_action = str(body.get("action", "")).strip().lower()
                comment = str(body.get("comment", ""))
                # Keep the legacy V1.6 review screen usable, but route the decision
                # through the V1.8 workflow so technical review cannot bypass
                # Nakshatech final approval.
                sync_workflows()
                workflow_id = "WF-INST-" + public_id
                workflow = get_workflow(user, workflow_id)
                status = workflow.get("current_status")
                if legacy_action == "review":
                    transition_workflow(
                        user, workflow_id, "start-review", comment=comment,
                        ip_address=_client_ip(self), user_agent=self.headers.get("User-Agent", ""),
                    )
                elif legacy_action == "return":
                    transition_workflow(
                        user, workflow_id, "return", comment=comment,
                        ip_address=_client_ip(self), user_agent=self.headers.get("User-Agent", ""),
                    )
                elif legacy_action == "approve":
                    if status in {"SUBMITTED", "RESUBMITTED"}:
                        transition_workflow(
                            user, workflow_id, "start-review", comment=comment,
                            ip_address=_client_ip(self), user_agent=self.headers.get("User-Agent", ""),
                        )
                    transition_workflow(
                        user, workflow_id, "technical-approve", comment=comment,
                        ip_address=_client_ip(self), user_agent=self.headers.get("User-Agent", ""),
                    )
                    # Company Admin can complete the final approval from the old
                    # screen; a Technical Reviewer stops at technical approval.
                    if user.role in {"COMPANY_ADMIN", "COMPANY_PROJECT_MANAGER"}:
                        transition_workflow(
                            user, workflow_id, "final-approve", comment=comment,
                            ip_address=_client_ip(self), user_agent=self.headers.get("User-Agent", ""),
                        )
                else:
                    raise ValueError("action must be review, approve or return")
                self._send_json(get_entry(user, public_id))
                return

            if path == "/api/v1/admin/users":
                user = self._require_company_admin()
                if not user:
                    return
                body = self._read_json()
                created = create_user(
                    email=str(body.get("email", "")),
                    display_name=str(body.get("display_name", "")),
                    organization_id=str(body.get("organization_id", "")),
                    role=str(body.get("role", "")),
                    password=(str(body.get("password")) if body.get("password") else None),
                )
                self._send_json(created, status=201)
                return

            self._send_json({"detail": "Not Found", "path": path}, status=404)

        except PermissionError as exc:
            self._send_json({"detail": str(exc), "code": "FORBIDDEN"}, status=403)
        except LookupError as exc:
            self._send_json({"detail": str(exc)}, status=404)
        except ValueError as exc:
            self._send_json({"detail": str(exc)}, status=400)
        except FileNotFoundError as exc:
            self._send_json({"detail": str(exc)}, status=500)
        except Exception as exc:
            traceback.print_exc()
            detail = f"Internal server error: {exc}" if DEBUG_ERRORS else "Internal server error"
            self._send_json({"detail": detail}, status=500)


def main():
    required = [
        "summary.json",
        "flights.json",
        "flight_tracks.geojson",
        "endpoints.geojson",
        "track_points.geojson",
        "point_verification.json",
        "data_availability.json",
        "verification.json",
    ]
    missing = [name for name in required if not (DATA_DIR / name).is_file()]
    if missing:
        raise SystemExit("Missing dashboard data file(s): " + ", ".join(missing))

    ensure_production_dirs()
    auth_result = ensure_initialized()
    ensure_civil_schema()
    ensure_repository_schema()
    ensure_event_schema()
    ensure_scientific_schema()
    ensure_industry_intelligence_schema()
    ensure_industry_schema()
    ensure_phase2_ready()
    sync_workflows()
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print("=" * 66)
    print(f" {PROJECT_TITLE.upper()} - PRODUCTION API {VERSION}")
    print("=" * 66)
    print(f"Python backend : http://{HOST}:{PORT}")
    print(f"Health check   : http://{HOST}:{PORT}/health")
    print("Authentication : Nakshatech / CNNL / 12 Institution portals")
    print("Data Hub       : Civil / GIS / Survey / LiDAR / Photogrammetry")
    print("Workflow       : Tasks / Review / Approval / Notifications / Audit")
    print("Scientific     : Micro-catchments / Drainage / Industry / Lab / Hydrology / Hotspots")
    print("Industry Intel : V28 observations / evidence / verification")
    print("V29.6.16 Industry Identity: Video/SRT route -> OSM geometry -> KIADB/OSM name -> KSRSAC public industry registry fallback")
    print(f"Upload chunk   : {CHUNK_SIZE // (1024 * 1024)} MB resumable chunks")
    print(f"Auth database  : {auth_result['db']}")
    print(f"Credentials    : {auth_result['credentials']}")
    print(f"Frontend       : {FRONTEND_DIST}")
    print(f"Mode           : {'PRODUCTION' if PRODUCTION else 'DEVELOPMENT'} Â· Python + SQLite")
    print("Press Ctrl+C to stop.")
    print()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping Arkavati API...")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()



