"""Route identity helpers for Arkavathi Video + SRT workflows.

No third-party dependencies.  The route_id is derived from the actual GPS route,
not the SRT/video filename, so repeated DJI filenames on different survey days
remain distinct.
"""
from __future__ import annotations

import hashlib
import json
import math
import re
from pathlib import Path
from typing import Any, Iterable

_LAT_RE = re.compile(r"\[latitude\s*:\s*([-+0-9.]+)\]", re.I)
_LNG_RE = re.compile(r"\[longitude\s*:\s*([-+0-9.]+)\]", re.I)
_ALT_RE = re.compile(r"\[altitude\s*:\s*([-+0-9.]+)\]", re.I)
_TIME_RE = re.compile(r"^(\d{2}):(\d{2}):(\d{2}),(\d{3})\s+-->")
_DATE_RE = re.compile(r"(20\d{2}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})")


def _finite(value: Any) -> float | None:
    try:
        v = float(value)
    except (TypeError, ValueError):
        return None
    return v if math.isfinite(v) else None


def parse_dji_srt_text(text: str) -> list[dict[str, float]]:
    """Parse DJI SRT telemetry into time/lat/lng/alt route points."""
    points: list[dict[str, float]] = []
    current_time: float | None = None
    for raw in text.splitlines():
        line = raw.strip()
        m = _TIME_RE.search(line)
        if m:
            h, minute, sec, ms = map(int, m.groups())
            current_time = h * 3600 + minute * 60 + sec + ms / 1000.0
            continue
        lat_m = _LAT_RE.search(line)
        lng_m = _LNG_RE.search(line)
        if not (lat_m and lng_m):
            continue
        lat = _finite(lat_m.group(1))
        lng = _finite(lng_m.group(1))
        if lat is None or lng is None or not (-90 <= lat <= 90) or not (-180 <= lng <= 180):
            continue
        alt_m = _ALT_RE.search(line)
        alt = _finite(alt_m.group(1)) if alt_m else None
        point: dict[str, float] = {
            "time": float(current_time if current_time is not None else len(points)),
            "lat": lat,
            "lng": lng,
        }
        if alt is not None:
            point["alt"] = alt
        points.append(point)
    return points


def parse_dji_srt_file(path: str | Path) -> list[dict[str, float]]:
    return parse_dji_srt_text(Path(path).read_text(encoding="utf-8", errors="replace"))


def srt_capture_datetime(text: str) -> str:
    m = _DATE_RE.search(text)
    return f"{m.group(1)} {m.group(2)}" if m else ""


def normalize_route(route: Iterable[dict[str, Any]]) -> list[dict[str, float]]:
    out: list[dict[str, float]] = []
    for index, raw in enumerate(route or []):
        if not isinstance(raw, dict):
            continue
        lat = _finite(raw.get("lat", raw.get("latitude")))
        lng = _finite(raw.get("lng", raw.get("lon", raw.get("longitude"))))
        if lat is None or lng is None or not (-90 <= lat <= 90) or not (-180 <= lng <= 180):
            continue
        t = _finite(raw.get("time", raw.get("time_s", raw.get("timestamp"))))
        alt = _finite(raw.get("alt", raw.get("altitude")))
        row: dict[str, float] = {"time": float(t if t is not None else index), "lat": lat, "lng": lng}
        if alt is not None:
            row["alt"] = alt
        out.append(row)
    return out


def _sample_indices(count: int, limit: int = 128) -> list[int]:
    if count <= 0:
        return []
    if count <= limit:
        return list(range(count))
    return sorted({round(i * (count - 1) / (limit - 1)) for i in range(limit)})


def route_fingerprint(route: Iterable[dict[str, Any]], *, prefix: str = "R") -> str:
    """Return a deterministic ID based on the actual route geometry and time.

    Coordinates are rounded to 5 decimals (~1.1 m latitude) and the route is
    deterministically sampled, making the ID compact while keeping separate
    flights with reused filenames distinct.
    """
    points = normalize_route(route)
    if not points:
        return f"{prefix}-EMPTY"
    chunks: list[str] = []
    for i in _sample_indices(len(points)):
        p = points[i]
        chunks.append(f"{p['time']:.1f},{p['lat']:.5f},{p['lng']:.5f}")
    digest = hashlib.sha256("|".join(chunks).encode("utf-8")).hexdigest()[:20]
    return f"{prefix}-{digest.upper()}"


def route_signature(route: Iterable[dict[str, Any]]) -> dict[str, Any]:
    points = normalize_route(route)
    if not points:
        return {"route_id": "R-EMPTY", "point_count": 0, "duration_s": 0.0, "bbox": None}
    lats = [p["lat"] for p in points]
    lngs = [p["lng"] for p in points]
    duration = max(0.0, points[-1]["time"] - points[0]["time"])
    return {
        "route_id": route_fingerprint(points),
        "point_count": len(points),
        "duration_s": round(duration, 3),
        "bbox": {
            "south": min(lats),
            "west": min(lngs),
            "north": max(lats),
            "east": max(lngs),
        },
        "start": {"lat": points[0]["lat"], "lng": points[0]["lng"], "time": points[0]["time"]},
        "end": {"lat": points[-1]["lat"], "lng": points[-1]["lng"], "time": points[-1]["time"]},
    }


def route_signature_json(route: Iterable[dict[str, Any]]) -> str:
    return json.dumps(route_signature(route), separators=(",", ":"), sort_keys=True)
