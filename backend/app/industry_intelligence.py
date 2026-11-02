from __future__ import annotations

import json
import math
import os
import secrets
import ssl
import threading
import xml.etree.ElementTree as ET
from http.cookiejar import CookieJar
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from urllib.request import HTTPCookieProcessor, HTTPSHandler, Request, build_opener, urlopen

from app.auth_store import AuthUser, connect


def _load_local_env() -> None:
    """Load optional project/backend .env values without adding a dotenv dependency."""
    backend_dir = Path(__file__).resolve().parents[1]
    project_root = backend_dir.parent
    for path in (project_root / ".env", backend_dir / ".env"):
        if not path.exists():
            continue
        for raw_line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value


_load_local_env()

DEFAULT_OVERPASS_URL = os.environ.get("ARKAVATHI_OVERPASS_URL", "https://overpass-api.de/api/interpreter")
NETWORK_TIMEOUT = float(os.environ.get("ARKAVATHI_INDUSTRY_HTTP_TIMEOUT", "25"))
SOURCE_HTTP_TIMEOUT = float(os.environ.get("ARKAVATHI_INDUSTRY_SOURCE_TIMEOUT", "10"))
OVERPASS_FALLBACK_URLS = tuple(
    value.strip()
    for value in os.environ.get(
        "ARKAVATHI_OVERPASS_FALLBACK_URLS",
        "https://overpass.kumi.systems/api/interpreter,https://overpass-api.de/api/interpreter",
    ).split(",")
    if value.strip()
)
OSM_MAP_API_URL = os.environ.get(
    "ARKAVATHI_OSM_MAP_API_URL",
    "https://api.openstreetmap.org/api/0.6/map",
).strip()
OSM_MAP_API_ENABLED = os.environ.get("ARKAVATHI_OSM_MAP_API_ENABLED", "1").strip().lower() not in {"0", "false", "no", "off"}
OSM_MAP_TILE_SPAN_DEG = max(0.003, min(0.02, float(os.environ.get("ARKAVATHI_OSM_MAP_TILE_SPAN_DEG", "0.008"))))
OSM_MAP_MAX_TILES = max(1, min(36, int(os.environ.get("ARKAVATHI_OSM_MAP_MAX_TILES", "16"))))
LOCAL_OSM_CACHE_ENABLED = os.environ.get("ARKAVATHI_INDUSTRY_LOCAL_CACHE_ENABLED", "1").strip().lower() not in {"0", "false", "no", "off"}
OSM_IDENTITY_ENRICH_ENABLED = os.environ.get("ARKAVATHI_OSM_IDENTITY_ENRICH_ENABLED", "1").strip().lower() not in {"0", "false", "no", "off"}
OSM_IDENTITY_MATCH_RADIUS_M = max(25.0, min(250.0, float(os.environ.get("ARKAVATHI_OSM_IDENTITY_MATCH_RADIUS_M", "120"))))
OSM_IDENTITY_WEAK_MATCH_RADIUS_M = max(15.0, min(OSM_IDENTITY_MATCH_RADIUS_M, float(os.environ.get("ARKAVATHI_OSM_IDENTITY_WEAK_MATCH_RADIUS_M", "50"))))
OSM_IDENTITY_BUSINESS_MATCH_RADIUS_M = max(20.0, min(OSM_IDENTITY_MATCH_RADIUS_M, float(os.environ.get("ARKAVATHI_OSM_IDENTITY_BUSINESS_MATCH_RADIUS_M", "70"))))
OSM_IDENTITY_SEARCH_PAD_M = max(0.0, min(500.0, float(os.environ.get("ARKAVATHI_OSM_IDENTITY_SEARCH_PAD_M", "180"))))
GOOGLE_PLACES_API_KEY = (
    os.environ.get("ARKAVATHI_GOOGLE_PLACES_API_KEY", "").strip()
    or os.environ.get("GOOGLE_MAPS_API_KEY", "").strip()
    or os.environ.get("VITE_GOOGLE_MAPS_API_KEY", "").strip()
)
GOOGLE_PLACES_ENABLED = (
    bool(GOOGLE_PLACES_API_KEY)
    and os.environ.get("ARKAVATHI_GOOGLE_PLACES_ENABLED", "1").strip().lower() not in {"0", "false", "no", "off"}
)
GOOGLE_PLACES_NEARBY_URL = os.environ.get(
    "ARKAVATHI_GOOGLE_PLACES_NEARBY_URL", "https://places.googleapis.com/v1/places:searchNearby"
).strip()
GOOGLE_PLACES_MATCH_RADIUS_M = max(30.0, min(500.0, float(os.environ.get("ARKAVATHI_GOOGLE_PLACES_MATCH_RADIUS_M", "180"))))
GOOGLE_PLACES_WEAK_MATCH_RADIUS_M = max(20.0, min(GOOGLE_PLACES_MATCH_RADIUS_M, float(os.environ.get("ARKAVATHI_GOOGLE_PLACES_WEAK_MATCH_RADIUS_M", "75"))))
GOOGLE_PLACES_SEARCH_PAD_M = max(0.0, min(1000.0, float(os.environ.get("ARKAVATHI_GOOGLE_PLACES_SEARCH_PAD_M", "250"))))
GOOGLE_PLACES_POINT_RADIUS_M = max(80.0, min(500.0, float(os.environ.get("ARKAVATHI_GOOGLE_PLACES_POINT_RADIUS_M", "250"))))
GOOGLE_PLACES_BROAD_RADIUS_M = max(50.0, min(GOOGLE_PLACES_POINT_RADIUS_M, float(os.environ.get("ARKAVATHI_GOOGLE_PLACES_BROAD_RADIUS_M", "140"))))
GOOGLE_PLACES_MAX_POINT_QUERIES = max(1, min(20, int(os.environ.get("ARKAVATHI_GOOGLE_PLACES_MAX_POINT_QUERIES", "12"))))
_GOOGLE_PLACES_POINT_CACHE: dict[str, list[dict[str, Any]]] = {}
USER_AGENT = "Arkavathi-River-Survey-V29.6.11/1.0 (+Nakshatech GIS integration)"
MAX_RIVER_FEATURES = int(os.environ.get("ARKAVATHI_MAX_RIVER_FEATURES", "400"))
MAX_RIVER_POINTS_PER_LINE = int(os.environ.get("ARKAVATHI_MAX_RIVER_POINTS_PER_LINE", "1200"))
KIADB_ARCGIS_QUERY_URL = os.environ.get(
    "ARKAVATHI_KIADB_ARCGIS_QUERY_URL",
    "https://kgis.ksrsac.in/kgismaps2/rest/services/KIADB/KIADB/MapServer/1/query",
).strip()
KIADB_PLOT_DETAILS_URL = os.environ.get(
    "ARKAVATHI_KIADB_PLOT_DETAILS_URL",
    "https://kiadb.karnataka.gov.in/kiadbgisportal/sulb.asmx/getdeatilsforidentifier",
).strip()
KIADB_PLOT_DETAILS_BODY_TEMPLATE = os.environ.get(
    "ARKAVATHI_KIADB_PLOT_DETAILS_BODY_TEMPLATE",
    '{"plcd":"{{plot_code}}"}',
).strip()
MAX_KIADB_DETAIL_REQUESTS = int(os.environ.get("ARKAVATHI_KIADB_DETAILS_MAX_REQUESTS", "50"))
_KIADB_DETAILS_CACHE: dict[str, dict[str, Any]] = {}
KIADB_PORTAL_URL = os.environ.get(
    "ARKAVATHI_KIADB_PORTAL_URL",
    "https://kiadb.karnataka.gov.in/kiadbgisportal/",
).strip()
_KIADB_COOKIE_JAR = CookieJar()
_KIADB_SESSION_LOCK = threading.Lock()
_KIADB_SESSION_READY = False
KIADB_CANDIDATE_LOOKUP_ENABLED = os.environ.get("ARKAVATHI_KIADB_CANDIDATE_LOOKUP_ENABLED", "1").strip().lower() not in {"0", "false", "no", "off"}
KIADB_CANDIDATE_MATCH_RADIUS_M = max(25.0, min(500.0, float(os.environ.get("ARKAVATHI_KIADB_CANDIDATE_MATCH_RADIUS_M", "250"))))
KIADB_CANDIDATE_MAX_QUERIES = max(1, min(40, int(os.environ.get("ARKAVATHI_KIADB_CANDIDATE_MAX_QUERIES", "24"))))
_KIADB_CANDIDATE_CACHE: dict[str, dict[str, Any]] = {}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _public(prefix: str) -> str:
    return f"{prefix}-{secrets.token_hex(6).upper()}"


def _table_columns(db: Any, table: str) -> set[str]:
    return {str(row["name"]) for row in db.execute(f"PRAGMA table_info({table})").fetchall()}


def _ensure_column(db: Any, table: str, column: str, declaration: str) -> None:
    if column not in _table_columns(db, table):
        db.execute(f"ALTER TABLE {table} ADD COLUMN {column} {declaration}")


def ensure_industry_schema() -> None:
    """Create V29 discovery tables and migrate older V29.2/V29.3 tables in place."""
    with connect() as db:
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS industry_discovery_runs(
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                public_id TEXT NOT NULL UNIQUE,
                user_id INTEGER NOT NULL,
                video_name TEXT NOT NULL DEFAULT '',
                srt_name TEXT NOT NULL DEFAULT '',
                radius_m REAL NOT NULL,
                river_radius_m REAL NOT NULL DEFAULT 250,
                sample_count INTEGER NOT NULL,
                route_bbox_json TEXT NOT NULL DEFAULT '[]',
                river_context_json TEXT NOT NULL DEFAULT '{}',
                source_status_json TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id)
            );
            CREATE INDEX IF NOT EXISTS idx_industry_runs_user_created
                ON industry_discovery_runs(user_id, created_at DESC);

            CREATE TABLE IF NOT EXISTS industry_candidates(
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                run_id INTEGER NOT NULL,
                candidate_key TEXT NOT NULL,
                name TEXT NOT NULL,
                source TEXT NOT NULL,
                source_id TEXT NOT NULL DEFAULT '',
                category TEXT NOT NULL DEFAULT '',
                lat REAL NOT NULL,
                lng REAL NOT NULL,
                address TEXT NOT NULL DEFAULT '',
                route_distance_m REAL NOT NULL,
                river_distance_m REAL,
                nearest_river_name TEXT NOT NULL DEFAULT '',
                river_source TEXT NOT NULL DEFAULT '',
                river_relevance TEXT NOT NULL DEFAULT '',
                nearest_video_time_s REAL NOT NULL,
                nearest_track_index INTEGER NOT NULL,
                nearest_track_lat REAL NOT NULL,
                nearest_track_lng REAL NOT NULL,
                metadata_json TEXT NOT NULL DEFAULT '{}',
                verification_status TEXT NOT NULL DEFAULT 'PENDING',
                created_at TEXT NOT NULL,
                FOREIGN KEY(run_id) REFERENCES industry_discovery_runs(id) ON DELETE CASCADE,
                UNIQUE(run_id, candidate_key)
            );
            CREATE INDEX IF NOT EXISTS idx_industry_candidates_run
                ON industry_candidates(run_id, route_distance_m);
            CREATE INDEX IF NOT EXISTS idx_industry_candidates_source
                ON industry_candidates(source);
            """
        )
        # Safe in-place migration from V29.2/V29.3. Existing rows receive harmless defaults.
        _ensure_column(db, "industry_discovery_runs", "river_radius_m", "REAL NOT NULL DEFAULT 250")
        _ensure_column(db, "industry_discovery_runs", "river_context_json", "TEXT NOT NULL DEFAULT '{}'")
        _ensure_column(db, "industry_candidates", "river_distance_m", "REAL")
        _ensure_column(db, "industry_candidates", "nearest_river_name", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(db, "industry_candidates", "river_source", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(db, "industry_candidates", "river_relevance", "TEXT NOT NULL DEFAULT ''")
        db.commit()


def _fetch_json(
    url: str,
    *,
    method: str = "GET",
    data: bytes | None = None,
    headers: dict[str, str] | None = None,
    timeout: float = NETWORK_TIMEOUT,
) -> Any:
    merged = {"Accept": "application/json, application/geo+json", "User-Agent": USER_AGENT}
    if headers:
        merged.update(headers)
    request = Request(url, data=data, method=method, headers=merged)
    context = ssl.create_default_context()
    with urlopen(request, timeout=timeout, context=context) as response:
        raw = response.read()
    return json.loads(raw.decode("utf-8"))


def _fetch_bytes(
    url: str,
    *,
    method: str = "GET",
    data: bytes | None = None,
    headers: dict[str, str] | None = None,
    timeout: float = NETWORK_TIMEOUT,
) -> bytes:
    merged = {"Accept": "application/xml,text/xml,*/*", "User-Agent": USER_AGENT}
    if headers:
        merged.update(headers)
    request = Request(url, data=data, method=method, headers=merged)
    context = ssl.create_default_context()
    with urlopen(request, timeout=timeout, context=context) as response:
        return response.read()


def _finite(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def _normalize_route(payload: dict[str, Any]) -> list[dict[str, float]]:
    raw = payload.get("route")
    if not isinstance(raw, list):
        raise ValueError("route must be an array of SRT GPS samples")
    if len(raw) > 20000:
        raise ValueError("route contains too many GPS samples (maximum 20,000)")
    route: list[dict[str, float]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        lat = _finite(item.get("lat"))
        lng = _finite(item.get("lng"))
        time_s = _finite(item.get("time"))
        if lat is None or lng is None or time_s is None:
            continue
        if not (-90 <= lat <= 90 and -180 <= lng <= 180):
            continue
        route.append({"lat": lat, "lng": lng, "time": max(0.0, time_s)})
    route.sort(key=lambda row: row["time"])
    if len(route) < 2:
        raise ValueError("At least two valid SRT GPS samples are required")
    return route


def _route_bbox(route: list[dict[str, float]], radius_m: float) -> tuple[float, float, float, float]:
    south = min(row["lat"] for row in route)
    north = max(row["lat"] for row in route)
    west = min(row["lng"] for row in route)
    east = max(row["lng"] for row in route)
    mid_lat = (south + north) / 2
    lat_pad = radius_m / 111_320.0
    lng_scale = max(1.0, 111_320.0 * math.cos(math.radians(mid_lat)))
    lng_pad = radius_m / lng_scale
    return (
        max(-90.0, south - lat_pad),
        max(-180.0, west - lng_pad),
        min(90.0, north + lat_pad),
        min(180.0, east + lng_pad),
    )


def _expand_bbox(bbox: tuple[float, float, float, float], pad_m: float) -> tuple[float, float, float, float]:
    if pad_m <= 0:
        return bbox
    south, west, north, east = bbox
    mid_lat = (south + north) / 2
    lat_pad = pad_m / 111_320.0
    lng_scale = max(1.0, 111_320.0 * math.cos(math.radians(mid_lat)))
    lng_pad = pad_m / lng_scale
    return (
        max(-90.0, south - lat_pad),
        max(-180.0, west - lng_pad),
        min(90.0, north + lat_pad),
        min(180.0, east + lng_pad),
    )


def _distance_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    radius = 6_371_000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    h = math.sin(dlat / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlng / 2) ** 2
    return 2 * radius * math.atan2(math.sqrt(h), math.sqrt(max(0.0, 1 - h)))


def _nearest_route(candidate: dict[str, Any], route: list[dict[str, float]]) -> tuple[float, int, dict[str, float]]:
    best_distance = float("inf")
    best_index = 0
    for index, sample in enumerate(route):
        distance = _distance_m(candidate["lat"], candidate["lng"], sample["lat"], sample["lng"])
        if distance < best_distance:
            best_distance = distance
            best_index = index
    return best_distance, best_index, route[best_index]


def _time_label(seconds: float) -> str:
    total = max(0, int(round(seconds)))
    hours = total // 3600
    minutes = (total % 3600) // 60
    secs = total % 60
    if hours:
        return f"{hours:02d}:{minutes:02d}:{secs:02d}"
    return f"{minutes:02d}:{secs:02d}"


def _address_from_tags(tags: dict[str, Any]) -> str:
    full = str(tags.get("addr:full") or "").strip()
    if full:
        return full
    parts = [
        tags.get("addr:housename") or tags.get("addr:housenumber"),
        tags.get("addr:street"),
        tags.get("addr:suburb"),
        tags.get("addr:city"),
        tags.get("addr:district"),
        tags.get("addr:state"),
        tags.get("addr:postcode"),
    ]
    return ", ".join(str(part).strip() for part in parts if str(part or "").strip())


def _osm_category(tags: dict[str, Any]) -> str:
    if tags.get("man_made") == "works":
        return "Factory / works"
    if tags.get("industrial"):
        return f"Industrial: {tags['industrial']}"
    if tags.get("building") in {"industrial", "warehouse", "factory"}:
        return str(tags.get("building")).replace("_", " ").title()
    return "Industrial feature"


def _resolve_osm_identity(tags: dict[str, Any]) -> tuple[str, str]:
    """Return the best available OSM industry identity and the tag that supplied it."""
    for key in ("name", "name:en", "official_name", "operator", "brand", "short_name"):
        value = _clean_text(tags.get(key))
        if value:
            return value, f"OSM_{key.upper().replace(':', '_')}"
    return "", ""


def _osm_candidate_from_tags(
    *, source_id: str, lat: float, lng: float, tags: dict[str, Any]
) -> dict[str, Any] | None:
    reject_name_terms = {
        "lorry stand", "truck stand", "bus stand", "bus station", "parking",
        "market yard", "apmc market", "school", "college", "hospital",
    }
    explicit_industry = bool(
        tags.get("man_made") == "works"
        or tags.get("industrial")
        or tags.get("building") in {"industrial", "warehouse", "factory"}
    )
    industrial_land = tags.get("landuse") == "industrial"
    if not explicit_industry and not industrial_land:
        return None
    raw_name, identity_source = _resolve_osm_identity(tags)
    context_only = industrial_land and not explicit_industry
    if context_only and raw_name and any(term in raw_name.lower() for term in reject_name_terms):
        return None
    if raw_name and explicit_industry:
        name = raw_name
        confidence = "NAMED_MAP_FEATURE"
        identity_status = "NAMED_OSM_INDUSTRY"
    elif context_only:
        name = f"{raw_name} - industrial area" if raw_name else "Industrial area (OSM context)"
        confidence = "INDUSTRIAL_CONTEXT_ONLY"
        identity_status = "INDUSTRIAL_CONTEXT_ONLY"
        identity_source = identity_source or "OSM_LANDUSE"
    else:
        building = str(tags.get("building") or "").strip().lower()
        if building in {"industrial", "warehouse", "factory"}:
            name = f"{building.title()} (OSM context)"
        elif tags.get("man_made") == "works":
            name = "Factory / works (OSM context)"
        else:
            industrial = str(tags.get("industrial") or "").replace("_", " ").strip()
            name = f"Industrial {industrial} (OSM context)" if industrial else "Industrial site (OSM context)"
        confidence = "INDUSTRIAL_CONTEXT_ONLY"
        identity_status = "INDUSTRIAL_CONTEXT_ONLY"
        identity_source = identity_source or "OSM_INDUSTRIAL_TAG"
    return {
        "source": "OPENSTREETMAP",
        "source_id": source_id,
        "name": name,
        "category": _osm_category(tags) if confidence == "NAMED_MAP_FEATURE" else "Industrial map context - identity unverified",
        "lat": lat,
        "lng": lng,
        "address": _address_from_tags(tags),
        "metadata": {
            "osm_type": source_id.split("/", 1)[0] if "/" in source_id else "feature",
            "osm_id": source_id.split("/", 1)[1] if "/" in source_id else source_id,
            "tags": tags,
            "website": tags.get("website") or tags.get("contact:website"),
            "phone": tags.get("phone") or tags.get("contact:phone"),
            "identity_confidence": confidence,
            "identity_status": identity_status,
            "identity_source": identity_source,
            "resolved_industry_name": raw_name if confidence == "NAMED_MAP_FEATURE" else "",
            "identity_note": (
                "Mapped industrial context only; company identity requires KIADB or field verification."
                if confidence == "INDUSTRIAL_CONTEXT_ONLY"
                else "Named industrial map feature; verify against KIADB/field evidence."
            ),
        },
    }


def _bbox_tiles(
    bbox: tuple[float, float, float, float], max_span_deg: float = OSM_MAP_TILE_SPAN_DEG
) -> list[tuple[float, float, float, float]]:
    south, west, north, east = bbox
    lat_parts = max(1, math.ceil(max(0.0, north - south) / max_span_deg))
    lng_parts = max(1, math.ceil(max(0.0, east - west) / max_span_deg))
    while lat_parts * lng_parts > OSM_MAP_MAX_TILES:
        if lat_parts >= lng_parts and lat_parts > 1:
            lat_parts -= 1
        elif lng_parts > 1:
            lng_parts -= 1
        else:
            break
    lat_step = (north - south) / lat_parts if lat_parts else 0.0
    lng_step = (east - west) / lng_parts if lng_parts else 0.0
    tiles: list[tuple[float, float, float, float]] = []
    for yi in range(lat_parts):
        tile_s = south + yi * lat_step
        tile_n = north if yi == lat_parts - 1 else south + (yi + 1) * lat_step
        for xi in range(lng_parts):
            tile_w = west + xi * lng_step
            tile_e = east if xi == lng_parts - 1 else west + (xi + 1) * lng_step
            tiles.append((tile_s, tile_w, tile_n, tile_e))
    return tiles[:OSM_MAP_MAX_TILES]


def _parse_osm_map_xml(raw: bytes) -> list[dict[str, Any]]:
    root = ET.fromstring(raw)
    nodes: dict[str, tuple[float, float]] = {}
    node_tags: dict[str, dict[str, str]] = {}
    for node in root.findall("node"):
        node_id = str(node.attrib.get("id") or "")
        lat = _finite(node.attrib.get("lat"))
        lng = _finite(node.attrib.get("lon"))
        if node_id and lat is not None and lng is not None:
            nodes[node_id] = (lat, lng)
            tags = {str(tag.attrib.get("k") or ""): str(tag.attrib.get("v") or "") for tag in node.findall("tag")}
            if tags:
                node_tags[node_id] = tags
    items: list[dict[str, Any]] = []
    for node_id, tags in node_tags.items():
        lat, lng = nodes[node_id]
        item = _osm_candidate_from_tags(source_id=f"node/{node_id}", lat=lat, lng=lng, tags=tags)
        if item:
            item["metadata"]["retrieval_mode"] = "OSM_MAP_API"
            items.append(item)
    for way in root.findall("way"):
        way_id = str(way.attrib.get("id") or "")
        tags = {str(tag.attrib.get("k") or ""): str(tag.attrib.get("v") or "") for tag in way.findall("tag")}
        if not tags:
            continue
        refs = [str(nd.attrib.get("ref") or "") for nd in way.findall("nd")]
        coords = [nodes[ref] for ref in refs if ref in nodes]
        if not coords:
            continue
        lat = sum(value[0] for value in coords) / len(coords)
        lng = sum(value[1] for value in coords) / len(coords)
        item = _osm_candidate_from_tags(source_id=f"way/{way_id}", lat=lat, lng=lng, tags=tags)
        if item:
            item["metadata"]["retrieval_mode"] = "OSM_MAP_API"
            items.append(item)
    return _dedupe(items)


def _discover_osm_map_api(bbox: tuple[float, float, float, float]) -> list[dict[str, Any]]:
    if not OSM_MAP_API_ENABLED or not OSM_MAP_API_URL:
        return []
    items: list[dict[str, Any]] = []
    failures: list[str] = []
    for south, west, north, east in _bbox_tiles(bbox):
        url = _with_query(OSM_MAP_API_URL, {"bbox": f"{west:.7f},{south:.7f},{east:.7f},{north:.7f}"})
        try:
            raw = _fetch_bytes(url, timeout=max(3.0, min(NETWORK_TIMEOUT, SOURCE_HTTP_TIMEOUT)))
            items.extend(_parse_osm_map_xml(raw))
        except Exception as exc:
            failures.append(str(exc))
    rows = _dedupe(items)
    if rows:
        return rows
    if failures:
        raise RuntimeError("OSM map API fallback failed: " + " | ".join(failures[-3:]))
    return []



def _humanize_osm_tag(value: Any) -> str:
    return _clean_text(value).replace("_", " ").strip().title()


def _osm_identity_nature(tags: dict[str, Any]) -> str:
    product = _clean_text(tags.get("product")) or _clean_text(tags.get("products"))
    if product:
        return f"Product: {product}"
    industrial = _clean_text(tags.get("industrial"))
    if industrial:
        return f"Industrial: {_humanize_osm_tag(industrial)}"
    craft = _clean_text(tags.get("craft"))
    if craft:
        return f"Craft / workshop: {_humanize_osm_tag(craft)}"
    if _clean_text(tags.get("man_made")) == "works":
        return "Factory / works"
    building = _clean_text(tags.get("building"))
    if building in {"industrial", "warehouse", "factory"}:
        return _humanize_osm_tag(building)
    office = _clean_text(tags.get("office"))
    if office:
        return f"Company / office: {_humanize_osm_tag(office)}"
    return "Named industrial facility"


def _industry_name_signal(value: Any) -> bool:
    text = _clean_text(value).lower()
    if not text:
        return False
    signals = (
        "industries", "industry", "industrial", "manufacturing", "manufacturer", "factory",
        "engineering", "engineers", "enterprises", "fabrication", "fabricators", "works",
        "metals", "metal", "steel", "plastics", "plastic", "polymer", "chemicals", "chemical",
        "pharma", "pharmaceutical", "textiles", "textile", "packaging", "packers", "machinery",
        "machine tools", "tools", "solar", "battery", "batteries", "electricals", "electronics",
        "automation", "motors", "pumps", "castings", "foundry", "rubber", "paint", "coatings",
        "pvt ltd", "private limited", "limited", " ltd",
    )
    return any(signal in text for signal in signals)


def _osm_identity_anchor_from_tags(
    *, source_id: str, lat: float, lng: float, tags: dict[str, Any]
) -> dict[str, Any] | None:
    """Build a named OSM identity anchor for enriching an already-detected industrial context.

    This does NOT independently prove that the named business occupies the context polygon. Strong
    industrial tags may be matched within the configured identity radius; weaker company/workshop
    tags are accepted only within a much tighter radius and remain explicitly marked as a nearby
    OSM identity match, never an official KIADB allottee.
    """
    raw_name, identity_source = _resolve_osm_identity(tags)
    if not raw_name:
        return None

    reject_name_terms = {
        "lorry stand", "truck stand", "bus stand", "bus station", "parking",
        "market yard", "apmc market", "school", "college", "hospital",
        "apartment", "residency", "residence", "temple", "mosque", "church",
    }
    if any(term in raw_name.lower() for term in reject_name_terms):
        return None

    strong = bool(
        tags.get("man_made") == "works"
        or tags.get("industrial")
        or tags.get("building") in {"industrial", "warehouse", "factory"}
        or tags.get("landuse") == "industrial"
    )
    industrial_crafts = {
        "blacksmith", "carpenter", "cabinet_maker", "electrician", "electronics_repair",
        "hvac", "locksmith", "metal_construction", "plumber", "sawmill", "welder",
        "builder", "machinery", "industrial_equipment", "sheet_metal", "toolmaker",
    }
    craft_value = _clean_text(tags.get("craft")).lower()
    weak = bool(
        craft_value in industrial_crafts
        or tags.get("manufacturer")
        or tags.get("product")
        or tags.get("products")
    )
    office_value = _clean_text(tags.get("office")).lower()
    shop_value = _clean_text(tags.get("shop")).lower()
    business = bool(
        office_value in {"company", "engineering", "logistics", "construction", "consulting", "research", "it"}
        or shop_value in {"trade", "hardware", "electrical", "electronics", "car_parts", "wholesale", "industrial_supplies", "machine_tools"}
        or tags.get("company")
        or tags.get("wholesale")
        or _industry_name_signal(raw_name)
    )
    if not strong and not weak and not business:
        return None

    category = _osm_category(tags) if strong else _osm_identity_nature(tags)
    anchor_strength = "STRONG" if strong else ("WEAK" if weak else "BUSINESS")
    return {
        "source": "OPENSTREETMAP",
        "source_id": source_id,
        "name": raw_name,
        "category": category,
        "lat": lat,
        "lng": lng,
        "address": _address_from_tags(tags),
        "metadata": {
            "identity_source": identity_source,
            "identity_status": "NAMED_OSM_INDUSTRY",
            "identity_confidence": "NAMED_MAP_FEATURE",
            "identity_anchor_strength": anchor_strength,
            "resolved_industry_name": raw_name,
            "nature_of_industry": _osm_identity_nature(tags),
            "operator": _clean_text(tags.get("operator")),
            "brand": _clean_text(tags.get("brand")),
            "website": _clean_text(tags.get("website") or tags.get("contact:website")),
            "phone": _clean_text(tags.get("phone") or tags.get("contact:phone")),
            "tags": tags,
        },
    }


def _parse_osm_identity_anchors(raw: bytes) -> list[dict[str, Any]]:
    """Parse named industrial/company features from a direct OSM map-API response."""
    root = ET.fromstring(raw)
    nodes: dict[str, tuple[float, float]] = {}
    node_tags: dict[str, dict[str, str]] = {}
    for node in root.findall("node"):
        node_id = str(node.attrib.get("id") or "")
        lat = _finite(node.attrib.get("lat"))
        lng = _finite(node.attrib.get("lon"))
        if node_id and lat is not None and lng is not None:
            nodes[node_id] = (lat, lng)
            tags = {str(tag.attrib.get("k") or ""): str(tag.attrib.get("v") or "") for tag in node.findall("tag")}
            if tags:
                node_tags[node_id] = tags

    anchors: list[dict[str, Any]] = []
    for node_id, tags in node_tags.items():
        lat, lng = nodes[node_id]
        anchor = _osm_identity_anchor_from_tags(source_id=f"node/{node_id}", lat=lat, lng=lng, tags=tags)
        if anchor:
            anchor["metadata"]["retrieval_mode"] = "OSM_MAP_API_IDENTITY"
            anchors.append(anchor)

    way_centres: dict[str, tuple[float, float]] = {}
    way_tags: dict[str, dict[str, str]] = {}
    for way in root.findall("way"):
        way_id = str(way.attrib.get("id") or "")
        tags = {str(tag.attrib.get("k") or ""): str(tag.attrib.get("v") or "") for tag in way.findall("tag")}
        refs = [str(nd.attrib.get("ref") or "") for nd in way.findall("nd")]
        coords = [nodes[ref] for ref in refs if ref in nodes]
        if not way_id or not coords:
            continue
        lat = sum(value[0] for value in coords) / len(coords)
        lng = sum(value[1] for value in coords) / len(coords)
        way_centres[way_id] = (lat, lng)
        if tags:
            way_tags[way_id] = tags
            anchor = _osm_identity_anchor_from_tags(source_id=f"way/{way_id}", lat=lat, lng=lng, tags=tags)
            if anchor:
                anchor["metadata"]["retrieval_mode"] = "OSM_MAP_API_IDENTITY"
                anchors.append(anchor)

    for relation in root.findall("relation"):
        rel_id = str(relation.attrib.get("id") or "")
        tags = {str(tag.attrib.get("k") or ""): str(tag.attrib.get("v") or "") for tag in relation.findall("tag")}
        if not rel_id or not tags:
            continue
        coords: list[tuple[float, float]] = []
        for member in relation.findall("member"):
            ref = str(member.attrib.get("ref") or "")
            member_type = str(member.attrib.get("type") or "")
            if member_type == "node" and ref in nodes:
                coords.append(nodes[ref])
            elif member_type == "way" and ref in way_centres:
                coords.append(way_centres[ref])
        if not coords:
            continue
        lat = sum(value[0] for value in coords) / len(coords)
        lng = sum(value[1] for value in coords) / len(coords)
        anchor = _osm_identity_anchor_from_tags(source_id=f"relation/{rel_id}", lat=lat, lng=lng, tags=tags)
        if anchor:
            anchor["metadata"]["retrieval_mode"] = "OSM_MAP_API_IDENTITY"
            anchors.append(anchor)

    return _dedupe(anchors)


def _discover_osm_identity_anchors(bbox: tuple[float, float, float, float]) -> list[dict[str, Any]]:
    if not OSM_IDENTITY_ENRICH_ENABLED or not OSM_MAP_API_ENABLED or not OSM_MAP_API_URL:
        return []
    anchors: list[dict[str, Any]] = []
    failures: list[str] = []
    for south, west, north, east in _bbox_tiles(bbox):
        url = _with_query(OSM_MAP_API_URL, {"bbox": f"{west:.7f},{south:.7f},{east:.7f},{north:.7f}"})
        try:
            raw = _fetch_bytes(url, timeout=max(3.0, min(NETWORK_TIMEOUT, SOURCE_HTTP_TIMEOUT)))
            anchors.extend(_parse_osm_identity_anchors(raw))
        except Exception as exc:
            failures.append(str(exc))
    rows = _dedupe(anchors)
    if rows:
        return rows
    if failures:
        raise RuntimeError("OSM identity enrichment failed: " + " | ".join(failures[-3:]))
    return []


def _osm_item_has_named_identity(item: dict[str, Any]) -> bool:
    metadata = item.get("metadata") if isinstance(item.get("metadata"), dict) else {}
    if _clean_text(metadata.get("resolved_industry_name")):
        return True
    return _clean_text(metadata.get("identity_status")) in {"NAMED_OSM_INDUSTRY", "OFFICIAL_KIADB_ALLOTTEE", "OFFICIAL_KIADB_COMPANY", "NEARBY_KIADB_PLOT_MATCH"}


def _apply_osm_identity_anchor(
    item: dict[str, Any], anchor: dict[str, Any], *, match_method: str, match_distance_m: float
) -> dict[str, Any]:
    updated = dict(item)
    metadata = dict(item.get("metadata") if isinstance(item.get("metadata"), dict) else {})
    anchor_metadata = anchor.get("metadata") if isinstance(anchor.get("metadata"), dict) else {}
    name = _clean_text(anchor.get("name"))
    if not name:
        return updated

    updated["name"] = name
    updated["category"] = _clean_text(anchor.get("category")) or _clean_text(item.get("category"))
    if _clean_text(anchor.get("address")):
        updated["address"] = _clean_text(anchor.get("address"))

    metadata["resolved_industry_name"] = name
    metadata["identity_status"] = "NAMED_OSM_INDUSTRY"
    metadata["identity_confidence"] = "NAMED_MAP_FEATURE"
    metadata["identity_source"] = _clean_text(anchor_metadata.get("identity_source")) or "OSM_NAME"
    metadata["identity_match_method"] = match_method
    metadata["identity_match_distance_m"] = round(float(match_distance_m), 2)
    metadata["identity_osm_source_id"] = _clean_text(anchor.get("source_id"))
    metadata["identity_osm_source_url"] = (
        f"https://www.openstreetmap.org/{_clean_text(anchor.get('source_id'))}"
        if "/" in _clean_text(anchor.get("source_id")) else "https://www.openstreetmap.org/"
    )
    metadata["identity_anchor_strength"] = _clean_text(anchor_metadata.get("identity_anchor_strength"))
    metadata["nature_of_industry"] = _clean_text(anchor_metadata.get("nature_of_industry"))
    metadata["operator"] = _clean_text(anchor_metadata.get("operator"))
    metadata["brand"] = _clean_text(anchor_metadata.get("brand"))
    metadata["website"] = _clean_text(anchor_metadata.get("website"))
    metadata["phone"] = _clean_text(anchor_metadata.get("phone"))
    old_note = _clean_text(metadata.get("identity_note"))
    method_note = (
        "Current OSM object now carries a named industrial identity."
        if match_method == "EXACT_OSM_OBJECT"
        else f"Matched to the nearest named OSM industrial/company feature within {match_distance_m:.0f} m; this is not an official KIADB allottee record."
    )
    metadata["identity_note"] = f"{method_note} {old_note}".strip()
    updated["metadata"] = metadata
    return updated


def _enrich_osm_context_identities(
    items: list[dict[str, Any]], anchors: list[dict[str, Any]]
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Promote context-only OSM candidates to names when a defensible named OSM feature exists."""
    if not items or not anchors:
        return items, {"anchors": len(anchors), "enriched": 0, "exact": 0, "nearby": 0}

    exact_by_source = {
        _clean_text(anchor.get("source_id")): anchor
        for anchor in anchors
        if _clean_text(anchor.get("source_id"))
    }
    used_anchor_ids: set[str] = set()
    enriched_items: list[dict[str, Any]] = []
    enriched = exact_count = nearby_count = 0

    for item in items:
        if _osm_item_has_named_identity(item):
            enriched_items.append(item)
            continue

        source_id = _clean_text(item.get("source_id"))
        anchor = exact_by_source.get(source_id)
        method = ""
        match_distance = 0.0
        if anchor:
            method = "EXACT_OSM_OBJECT"
            used_anchor_ids.add(_clean_text(anchor.get("source_id")))
        else:
            lat = _finite(item.get("lat"))
            lng = _finite(item.get("lng"))
            best: tuple[float, dict[str, Any]] | None = None
            if lat is not None and lng is not None:
                for candidate_anchor in anchors:
                    anchor_id = _clean_text(candidate_anchor.get("source_id"))
                    if not anchor_id or anchor_id in used_anchor_ids:
                        continue
                    a_lat = _finite(candidate_anchor.get("lat"))
                    a_lng = _finite(candidate_anchor.get("lng"))
                    if a_lat is None or a_lng is None:
                        continue
                    strength = _clean_text((candidate_anchor.get("metadata") or {}).get("identity_anchor_strength"))
                    if strength == "STRONG":
                        limit = OSM_IDENTITY_MATCH_RADIUS_M
                    elif strength == "BUSINESS":
                        limit = OSM_IDENTITY_BUSINESS_MATCH_RADIUS_M
                    else:
                        limit = OSM_IDENTITY_WEAK_MATCH_RADIUS_M
                    distance = _distance_m(lat, lng, a_lat, a_lng)
                    if distance <= limit and (best is None or distance < best[0]):
                        best = (distance, candidate_anchor)
            if best is not None:
                match_distance, anchor = best
                method = "NEARBY_OSM_NAMED_FACILITY"
                used_anchor_ids.add(_clean_text(anchor.get("source_id")))

        if anchor and method:
            updated = _apply_osm_identity_anchor(item, anchor, match_method=method, match_distance_m=match_distance)
            enriched_items.append(updated)
            enriched += 1
            if method == "EXACT_OSM_OBJECT":
                exact_count += 1
            else:
                nearby_count += 1
        else:
            enriched_items.append(item)

    return enriched_items, {
        "anchors": len(anchors),
        "enriched": enriched,
        "exact": exact_count,
        "nearby": nearby_count,
    }


def _try_enrich_osm_context_identities(
    items: list[dict[str, Any]], bbox: tuple[float, float, float, float]
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    unresolved = [item for item in items if not _osm_item_has_named_identity(item)]
    if not OSM_IDENTITY_ENRICH_ENABLED or not unresolved:
        return items, {
            "attempted": False,
            "ok": True,
            "anchors": 0,
            "enriched": 0,
            "exact": 0,
            "nearby": 0,
            "message": "No OSM identity enrichment required." if not unresolved else "OSM identity enrichment disabled.",
        }
    try:
        anchors = _discover_osm_identity_anchors(_expand_bbox(bbox, OSM_IDENTITY_SEARCH_PAD_M))
        enriched_items, stats = _enrich_osm_context_identities(items, anchors)
        return enriched_items, {
            "attempted": True,
            "ok": True,
            **stats,
            "message": (
                f"OSM identity enrichment inspected {stats['anchors']} named industrial/company feature(s) and resolved {stats['enriched']} context candidate(s)."
            ),
        }
    except Exception as exc:
        return items, {
            "attempted": True,
            "ok": False,
            "anchors": 0,
            "enriched": 0,
            "exact": 0,
            "nearby": 0,
            "message": f"OSM identity enrichment unavailable; context candidates kept: {exc}",
        }

def _google_places_anchor_strength(types: list[str], primary_type: str) -> str:
    normalized = {str(value or "").strip().lower() for value in types}
    primary = str(primary_type or "").strip().lower()
    if primary in {"manufacturer", "supplier"} or normalized.intersection({"manufacturer", "supplier"}):
        return "STRONG"
    return "BUSINESS"


def _discover_google_places_identity_anchors(
    bbox: tuple[float, float, float, float]
) -> list[dict[str, Any]]:
    """Fetch nearby named businesses for identity only; never changes the detected OSM geometry.

    This provider is optional and is used only when ARKAVATHI_GOOGLE_PLACES_API_KEY (or a compatible
    process-level Google Maps key) is configured. Results are labelled as nearby business matches,
    not official KIADB allottee records.
    """
    if not GOOGLE_PLACES_ENABLED or not GOOGLE_PLACES_API_KEY or not GOOGLE_PLACES_NEARBY_URL:
        return []
    south, west, north, east = _expand_bbox(bbox, GOOGLE_PLACES_SEARCH_PAD_M)
    center_lat = (south + north) / 2
    center_lng = (west + east) / 2
    radius = max(
        _distance_m(center_lat, center_lng, south, west),
        _distance_m(center_lat, center_lng, south, east),
        _distance_m(center_lat, center_lng, north, west),
        _distance_m(center_lat, center_lng, north, east),
    )
    radius = max(100.0, min(5000.0, radius))
    body = {
        "includedTypes": ["manufacturer", "supplier", "corporate_office"],
        "maxResultCount": 20,
        "rankPreference": "DISTANCE",
        "locationRestriction": {
            "circle": {
                "center": {"latitude": center_lat, "longitude": center_lng},
                "radius": radius,
            }
        },
    }
    payload = _fetch_json(
        GOOGLE_PLACES_NEARBY_URL,
        method="POST",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Content-Type": "application/json; charset=UTF-8",
            "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY,
            "X-Goog-FieldMask": (
                "places.id,places.displayName,places.formattedAddress,places.location,"
                "places.primaryType,places.types,places.businessStatus,places.googleMapsUri,places.websiteUri"
            ),
        },
        timeout=max(3.0, min(NETWORK_TIMEOUT, SOURCE_HTTP_TIMEOUT)),
    )
    places = payload.get("places") if isinstance(payload, dict) else []
    if not isinstance(places, list):
        return []
    reject_terms = {
        "school", "college", "hospital", "temple", "mosque", "church", "restaurant", "hotel",
        "apartment", "residency", "residence", "parking", "bus stand", "lorry stand", "market",
    }
    anchors: list[dict[str, Any]] = []
    for place in places:
        if not isinstance(place, dict):
            continue
        display = place.get("displayName") if isinstance(place.get("displayName"), dict) else {}
        name = _clean_text(display.get("text"))
        if not name or any(term in name.lower() for term in reject_terms):
            continue
        location = place.get("location") if isinstance(place.get("location"), dict) else {}
        lat = _finite(location.get("latitude"))
        lng = _finite(location.get("longitude"))
        if lat is None or lng is None:
            continue
        types = place.get("types") if isinstance(place.get("types"), list) else []
        primary_type = _clean_text(place.get("primaryType"))
        strength = _google_places_anchor_strength([str(value) for value in types], primary_type)
        anchors.append(
            {
                "source": "GOOGLE_PLACES",
                "source_id": _clean_text(place.get("id")),
                "name": name,
                "category": _humanize_osm_tag(primary_type) or "Nearby business",
                "lat": lat,
                "lng": lng,
                "address": _clean_text(place.get("formattedAddress")),
                "metadata": {
                    "identity_source": "GOOGLE_PLACES",
                    "identity_status": "NEARBY_GOOGLE_PLACES_MATCH",
                    "identity_confidence": "NEARBY_BUSINESS_MATCH",
                    "identity_anchor_strength": strength,
                    "resolved_industry_name": name,
                    "nature_of_industry": _humanize_osm_tag(primary_type) or "Nearby business",
                    "google_place_id": _clean_text(place.get("id")),
                    "google_maps_uri": _clean_text(place.get("googleMapsUri")),
                    "website": _clean_text(place.get("websiteUri")),
                    "business_status": _clean_text(place.get("businessStatus")),
                    "primary_type": primary_type,
                    "types": [str(value) for value in types],
                },
            }
        )
    return anchors


def _parse_google_places_rows(payload: dict[str, Any], *, broad: bool = False) -> list[dict[str, Any]]:
    places = payload.get("places") if isinstance(payload, dict) else []
    if not isinstance(places, list):
        return []
    reject_terms = {
        "school", "college", "hospital", "temple", "mosque", "church", "restaurant", "hotel",
        "apartment", "residency", "residence", "parking", "bus stand", "lorry stand", "market",
    }
    reject_types = {
        "school", "primary_school", "secondary_school", "university", "hospital", "doctor",
        "restaurant", "cafe", "bar", "hotel", "lodging", "place_of_worship", "parking",
        "apartment_complex", "housing_complex", "supermarket", "grocery_store",
    }
    anchors: list[dict[str, Any]] = []
    for place in places:
        if not isinstance(place, dict):
            continue
        display = place.get("displayName") if isinstance(place.get("displayName"), dict) else {}
        name = _clean_text(display.get("text"))
        if not name or any(term in name.lower() for term in reject_terms):
            continue
        location = place.get("location") if isinstance(place.get("location"), dict) else {}
        lat = _finite(location.get("latitude"))
        lng = _finite(location.get("longitude"))
        if lat is None or lng is None:
            continue
        types = [str(value).strip().lower() for value in (place.get("types") if isinstance(place.get("types"), list) else [])]
        primary_type = _clean_text(place.get("primaryType")).lower()
        if primary_type in reject_types or set(types).intersection(reject_types):
            continue
        strong_type = primary_type in {"manufacturer", "supplier"} or bool(set(types).intersection({"manufacturer", "supplier"}))
        business_type = primary_type in {"corporate_office", "business_center"} or bool(set(types).intersection({"corporate_office", "business_center"}))
        if broad and not (strong_type or business_type or _industry_name_signal(name)):
            continue
        strength = "STRONG" if strong_type else "BUSINESS"
        anchors.append(
            {
                "source": "GOOGLE_PLACES",
                "source_id": _clean_text(place.get("id")),
                "name": name,
                "category": _humanize_osm_tag(primary_type) or "Nearby business",
                "lat": lat,
                "lng": lng,
                "address": _clean_text(place.get("formattedAddress")),
                "metadata": {
                    "identity_source": "GOOGLE_PLACES",
                    "identity_status": "NEARBY_GOOGLE_PLACES_MATCH",
                    "identity_confidence": "NEARBY_BUSINESS_MATCH",
                    "identity_anchor_strength": strength,
                    "resolved_industry_name": name,
                    "nature_of_industry": _humanize_osm_tag(primary_type) or "Nearby business",
                    "google_place_id": _clean_text(place.get("id")),
                    "google_maps_uri": _clean_text(place.get("googleMapsUri")),
                    "website": _clean_text(place.get("websiteUri")),
                    "business_status": _clean_text(place.get("businessStatus")),
                    "primary_type": primary_type,
                    "types": types,
                    "candidate_centered_lookup": True,
                    "broad_lookup": bool(broad),
                },
            }
        )
    return anchors


def _discover_google_places_point_anchors(lat: float, lng: float, *, broad: bool = False) -> list[dict[str, Any]]:
    """Search around one already-detected industrial candidate, not around the whole route bbox."""
    if not GOOGLE_PLACES_ENABLED or not GOOGLE_PLACES_API_KEY or not GOOGLE_PLACES_NEARBY_URL:
        return []
    radius = GOOGLE_PLACES_BROAD_RADIUS_M if broad else GOOGLE_PLACES_POINT_RADIUS_M
    cache_key = f"{lat:.5f}:{lng:.5f}:{radius:.0f}:{1 if broad else 0}"
    if cache_key in _GOOGLE_PLACES_POINT_CACHE:
        return [dict(row) for row in _GOOGLE_PLACES_POINT_CACHE[cache_key]]
    body: dict[str, Any] = {
        "maxResultCount": 20,
        "rankPreference": "DISTANCE",
        "locationRestriction": {
            "circle": {"center": {"latitude": lat, "longitude": lng}, "radius": radius}
        },
    }
    if not broad:
        body["includedTypes"] = ["manufacturer", "supplier", "corporate_office", "business_center"]
    payload = _fetch_json(
        GOOGLE_PLACES_NEARBY_URL,
        method="POST",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Content-Type": "application/json; charset=UTF-8",
            "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY,
            "X-Goog-FieldMask": (
                "places.id,places.displayName,places.formattedAddress,places.location,"
                "places.primaryType,places.types,places.businessStatus,places.googleMapsUri,places.websiteUri"
            ),
        },
        timeout=max(3.0, min(NETWORK_TIMEOUT, SOURCE_HTTP_TIMEOUT)),
    )
    anchors = _parse_google_places_rows(payload, broad=broad)
    _GOOGLE_PLACES_POINT_CACHE[cache_key] = [dict(row) for row in anchors]
    return anchors


def _candidate_centered_google_enrichment(
    items: list[dict[str, Any]]
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Resolve each remaining context candidate from its own coordinate.

    V29.6.7 searched once around the route bbox. In dense Bengaluru corridors that can return 20
    businesses near the route centre while missing a manufacturer beside a candidate near either end.
    V29.6.8 makes a bounded per-candidate search and then, only if necessary, a tighter unfiltered
    search whose results must still look industrial by type/name. Geometry detection is unchanged.
    """
    if not GOOGLE_PLACES_ENABLED or not GOOGLE_PLACES_API_KEY:
        return items, {"queries": 0, "broad_queries": 0, "anchors": 0, "enriched": 0, "strong": 0, "business": 0}
    out: list[dict[str, Any]] = []
    queries = broad_queries = anchors_seen = enriched = strong = business = 0
    for item in items:
        if _osm_item_has_named_identity(item) or _clean_text((item.get("metadata") or {}).get("identity_status")) == "NEARBY_GOOGLE_PLACES_MATCH":
            out.append(item)
            continue
        if queries >= GOOGLE_PLACES_MAX_POINT_QUERIES:
            out.append(item)
            continue
        lat = _finite(item.get("lat"))
        lng = _finite(item.get("lng"))
        if lat is None or lng is None:
            out.append(item)
            continue
        queries += 1
        try:
            point_anchors = _discover_google_places_point_anchors(lat, lng, broad=False)
        except Exception:
            point_anchors = []
        anchors_seen += len(point_anchors)
        one, stats = _enrich_google_places_context_identities([item], point_anchors)
        resolved = bool(stats.get("enriched"))
        if not resolved:
            broad_queries += 1
            try:
                broad_anchors = _discover_google_places_point_anchors(lat, lng, broad=True)
            except Exception:
                broad_anchors = []
            anchors_seen += len(broad_anchors)
            one, stats = _enrich_google_places_context_identities([item], broad_anchors)
        out.append(one[0] if one else item)
        if stats.get("enriched"):
            enriched += int(stats.get("enriched", 0))
            strong += int(stats.get("strong", 0))
            business += int(stats.get("business", 0))
    return out, {
        "queries": queries,
        "broad_queries": broad_queries,
        "anchors": anchors_seen,
        "enriched": enriched,
        "strong": strong,
        "business": business,
    }


def _apply_google_places_identity_anchor(
    item: dict[str, Any], anchor: dict[str, Any], *, match_distance_m: float
) -> dict[str, Any]:
    updated = dict(item)
    metadata = dict(item.get("metadata") if isinstance(item.get("metadata"), dict) else {})
    anchor_metadata = anchor.get("metadata") if isinstance(anchor.get("metadata"), dict) else {}
    name = _clean_text(anchor.get("name"))
    if not name:
        return updated
    updated["name"] = name
    if _clean_text(anchor.get("address")):
        updated["address"] = _clean_text(anchor.get("address"))
    metadata["resolved_industry_name"] = name
    metadata["identity_status"] = "NEARBY_GOOGLE_PLACES_MATCH"
    metadata["identity_confidence"] = "NEARBY_BUSINESS_MATCH"
    metadata["identity_source"] = "GOOGLE_PLACES"
    metadata["identity_match_method"] = "NEARBY_GOOGLE_PLACES"
    metadata["identity_match_distance_m"] = round(float(match_distance_m), 2)
    metadata["google_place_id"] = _clean_text(anchor_metadata.get("google_place_id"))
    metadata["google_maps_uri"] = _clean_text(anchor_metadata.get("google_maps_uri"))
    metadata["website"] = _clean_text(anchor_metadata.get("website"))
    metadata["business_status"] = _clean_text(anchor_metadata.get("business_status"))
    metadata["primary_type"] = _clean_text(anchor_metadata.get("primary_type"))
    metadata["nature_of_industry"] = _clean_text(anchor_metadata.get("nature_of_industry"))
    metadata["identity_note"] = (
        f"Nearby Google Places business match within {match_distance_m:.0f} m of the detected industrial context. "
        "This is a proximity identity aid, not an official KIADB allottee/ownership record."
    )
    updated["metadata"] = metadata
    return updated


def _enrich_google_places_context_identities(
    items: list[dict[str, Any]], anchors: list[dict[str, Any]]
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    if not items or not anchors:
        return items, {"anchors": len(anchors), "enriched": 0, "strong": 0, "business": 0}
    used: set[str] = set()
    out: list[dict[str, Any]] = []
    enriched = strong_count = business_count = 0
    for item in items:
        if _osm_item_has_named_identity(item):
            out.append(item)
            continue
        metadata = item.get("metadata") if isinstance(item.get("metadata"), dict) else {}
        if _clean_text(metadata.get("identity_status")) == "NEARBY_GOOGLE_PLACES_MATCH":
            out.append(item)
            continue
        lat = _finite(item.get("lat"))
        lng = _finite(item.get("lng"))
        best: tuple[float, dict[str, Any]] | None = None
        if lat is not None and lng is not None:
            for anchor in anchors:
                anchor_id = _clean_text(anchor.get("source_id"))
                if not anchor_id or anchor_id in used:
                    continue
                a_lat = _finite(anchor.get("lat"))
                a_lng = _finite(anchor.get("lng"))
                if a_lat is None or a_lng is None:
                    continue
                strength = _clean_text((anchor.get("metadata") or {}).get("identity_anchor_strength"))
                limit = GOOGLE_PLACES_MATCH_RADIUS_M if strength == "STRONG" else GOOGLE_PLACES_WEAK_MATCH_RADIUS_M
                distance = _distance_m(lat, lng, a_lat, a_lng)
                if distance <= limit and (best is None or distance < best[0]):
                    best = (distance, anchor)
        if best is None:
            out.append(item)
            continue
        distance, anchor = best
        used.add(_clean_text(anchor.get("source_id")))
        strength = _clean_text((anchor.get("metadata") or {}).get("identity_anchor_strength"))
        out.append(_apply_google_places_identity_anchor(item, anchor, match_distance_m=distance))
        enriched += 1
        if strength == "STRONG":
            strong_count += 1
        else:
            business_count += 1
    return out, {"anchors": len(anchors), "enriched": enriched, "strong": strong_count, "business": business_count}


def _try_enrich_google_places_context_identities(
    items: list[dict[str, Any]], bbox: tuple[float, float, float, float]
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    unresolved = [item for item in items if not _osm_item_has_named_identity(item)]
    if not unresolved:
        return items, {"configured": GOOGLE_PLACES_ENABLED, "attempted": False, "ok": True, "anchors": 0, "enriched": 0, "strong": 0, "business": 0, "point_queries": 0, "broad_queries": 0, "message": "No Google Places identity enrichment required."}
    if not GOOGLE_PLACES_ENABLED or not GOOGLE_PLACES_API_KEY:
        return items, {"configured": False, "attempted": False, "ok": True, "anchors": 0, "enriched": 0, "strong": 0, "business": 0, "point_queries": 0, "broad_queries": 0, "message": "Google Places identity lookup is not configured. Set ARKAVATHI_GOOGLE_PLACES_API_KEY to enable candidate-centered name resolution."}
    try:
        anchors = _discover_google_places_identity_anchors(bbox)
        enriched_items, bbox_stats = _enrich_google_places_context_identities(items, anchors)
        enriched_items, point_stats = _candidate_centered_google_enrichment(enriched_items)
        stats = {
            "anchors": int(bbox_stats.get("anchors", 0)) + int(point_stats.get("anchors", 0)),
            "enriched": int(bbox_stats.get("enriched", 0)) + int(point_stats.get("enriched", 0)),
            "strong": int(bbox_stats.get("strong", 0)) + int(point_stats.get("strong", 0)),
            "business": int(bbox_stats.get("business", 0)) + int(point_stats.get("business", 0)),
            "point_queries": int(point_stats.get("queries", 0)),
            "broad_queries": int(point_stats.get("broad_queries", 0)),
        }
        return enriched_items, {
            "configured": True,
            "attempted": True,
            "ok": True,
            **stats,
            "message": (
                f"Google Places resolved {stats['enriched']} candidate name(s): route-bbox anchors plus "
                f"{stats['point_queries']} candidate-centered search(es), including {stats['broad_queries']} tighter broad fallback search(es)."
            ),
        }
    except Exception as exc:
        return items, {"configured": True, "attempted": True, "ok": False, "anchors": 0, "enriched": 0, "strong": 0, "business": 0, "point_queries": 0, "broad_queries": 0, "message": f"Google Places identity lookup failed; existing detection kept: {exc}"}


def _discover_osm(bbox: tuple[float, float, float, float]) -> list[dict[str, Any]]:
    """Return OSM industrial companies when named, plus clearly labelled industrial context.

    V29.4 only requested named features. That was scientifically conservative but often produced
    an empty operator map because industrial polygons/buildings frequently have no company name
    in OSM. V29.6 keeps named features as identity candidates and adds unnamed industrial
    areas/buildings as CONTEXT ONLY. Context records never claim a company or pollution source.
    """
    south, west, north, east = bbox
    query = f"""[out:json][timeout:25];
(
  nwr[\"man_made\"=\"works\"]({south:.7f},{west:.7f},{north:.7f},{east:.7f});
  nwr[\"industrial\"]({south:.7f},{west:.7f},{north:.7f},{east:.7f});
  nwr[\"building\"~\"^(industrial|warehouse|factory)$\"]({south:.7f},{west:.7f},{north:.7f},{east:.7f});
  nwr[\"landuse\"=\"industrial\"]({south:.7f},{west:.7f},{north:.7f},{east:.7f});
);
out center tags;"""
    body = urlencode({"data": query}).encode("utf-8")
    endpoints: list[str] = []
    for endpoint in (DEFAULT_OVERPASS_URL, *OVERPASS_FALLBACK_URLS):
        endpoint = str(endpoint or "").strip()
        if endpoint and endpoint not in endpoints:
            endpoints.append(endpoint)
    payload: Any = None
    failures: list[str] = []
    for endpoint in endpoints:
        try:
            payload = _fetch_json(
                endpoint,
                method="POST",
                data=body,
                headers={"Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"},
                timeout=max(3.0, min(NETWORK_TIMEOUT, SOURCE_HTTP_TIMEOUT)),
            )
            if isinstance(payload, dict):
                break
            failures.append(f"{endpoint}: non-object response")
        except Exception as exc:
            failures.append(f"{endpoint}: {exc}")
            payload = None
    if not isinstance(payload, dict):
        raise RuntimeError("All Overpass endpoints failed: " + " | ".join(failures[-3:]))
    items: list[dict[str, Any]] = []
    for element in payload.get("elements", []) if isinstance(payload, dict) else []:
        if not isinstance(element, dict):
            continue
        lat = _finite(element.get("lat") or (element.get("center") or {}).get("lat"))
        lng = _finite(element.get("lon") or (element.get("center") or {}).get("lon"))
        if lat is None or lng is None:
            continue
        tags = element.get("tags") if isinstance(element.get("tags"), dict) else {}
        source_id = f"{element.get('type', 'feature')}/{element.get('id', '')}"
        item = _osm_candidate_from_tags(source_id=source_id, lat=lat, lng=lng, tags=tags)
        if item:
            item["metadata"]["retrieval_mode"] = "OVERPASS"
            items.append(item)
    return items


def _iter_geometry_points(value: Any) -> Iterable[tuple[float, float]]:
    if isinstance(value, (list, tuple)):
        if len(value) >= 2 and _finite(value[0]) is not None and _finite(value[1]) is not None:
            yield float(value[0]), float(value[1])
            return
        for child in value:
            yield from _iter_geometry_points(child)


def _clean_text(value: Any) -> str:
    if value is None:
        return ""
    return " ".join(str(value).replace("\r", " ").replace("\n", " ").split()).strip()


def _unwrap_aspnet_payload(payload: Any) -> Any:
    """Unwrap common ASP.NET WebMethod envelopes such as {"d": "[...]"}."""
    value = payload
    for _ in range(4):
        if isinstance(value, dict) and "d" in value and len(value) <= 3:
            value = value.get("d")
            continue
        if isinstance(value, str):
            raw = value.strip()
            if raw[:1] in {"{", "["}:
                try:
                    value = json.loads(raw)
                    continue
                except (TypeError, ValueError, json.JSONDecodeError):
                    pass
        break
    return value


def _payload_feature_rows(payload: Any) -> list[dict[str, Any]]:
    value = _unwrap_aspnet_payload(payload)
    if isinstance(value, list):
        return [row for row in value if isinstance(row, dict)]
    if not isinstance(value, dict):
        return []
    if isinstance(value.get("features"), list):
        return [row for row in value["features"] if isinstance(row, dict)]
    # KSRSAC / ASP.NET services often serialize DataSet tables under Table/Table1.
    for key in ("Table", "table", "data", "rows", "results", "result", "PlotDetails", "plotDetails"):
        rows = value.get(key)
        if isinstance(rows, list):
            return [row for row in rows if isinstance(row, dict)]
        if isinstance(rows, dict):
            return [rows]
        if isinstance(rows, str):
            decoded = _unwrap_aspnet_payload(rows)
            if isinstance(decoded, list):
                return [row for row in decoded if isinstance(row, dict)]
    return [value]


def _feature_center(feature: dict[str, Any]) -> tuple[float, float] | None:
    geometry = feature.get("geometry") if isinstance(feature.get("geometry"), dict) else {}
    points = list(_iter_geometry_points(geometry.get("coordinates")))
    if points:
        lng = sum(point[0] for point in points) / len(points)
        lat = sum(point[1] for point in points) / len(points)
        return lat, lng

    if isinstance(feature.get("properties"), dict):
        properties = feature["properties"]
    elif isinstance(feature.get("attributes"), dict):
        properties = feature["attributes"]
    else:
        properties = feature
    normalized = {str(key).lower().replace(" ", "_").replace("-", "_"): value for key, value in properties.items()}
    lat = None
    lng = None
    for key in ("lat", "latitude", "center_lat", "centroid_lat", "y"):
        if key in normalized:
            lat = _finite(normalized[key])
            if lat is not None:
                break
    for key in ("lng", "lon", "longitude", "long", "center_lng", "center_lon", "centroid_lng", "x"):
        if key in normalized:
            lng = _finite(normalized[key])
            if lng is not None:
                break
    if lat is None or lng is None or not (-90 <= lat <= 90 and -180 <= lng <= 180):
        return None
    return lat, lng


def _prop(properties: dict[str, Any], *names: str) -> Any:
    normalized = {str(key).lower().replace(" ", "_").replace("-", "_"): value for key, value in properties.items()}
    for name in names:
        key = name.lower().replace(" ", "_").replace("-", "_")
        if key in normalized and normalized[key] not in (None, ""):
            return normalized[key]
    return None


def _parse_kiadb_features(payload: Any) -> list[dict[str, Any]]:
    """Normalize KIADB GeoJSON and ASP.NET/DataSet-style plot records into one identity model."""
    features = _payload_feature_rows(payload)
    items: list[dict[str, Any]] = []
    for index, feature in enumerate(features):
        center = _feature_center(feature)
        if center is None:
            continue
        lat, lng = center
        if isinstance(feature.get("properties"), dict):
            properties = feature["properties"]
        elif isinstance(feature.get("attributes"), dict):
            properties = feature["attributes"]
        else:
            properties = feature

        allottee = _prop(
            properties,
            "allottee_name", "allotee_name", "allottee", "allotee", "allotteename", "alloteename",
            "name_of_allottee", "name_of_allotee", "allottee_nm", "allotee_nm",
            "company_name", "companyname", "company", "firm_name", "firmname",
            "industry_name", "industryname", "unit_name", "unitname", "entrepreneur_name", "name", "nmalt",
        )
        plot_no = _prop(
            properties,
            "plot_no", "plot_number", "plotno", "plotnumber", "plot", "site_no", "site_number",
            "plot_id", "plotid", "pl_no", "plno",
        )
        industrial_area = _prop(
            properties,
            "industrial_area", "industrial_area_name", "industrialarea", "industrialareaname",
            "ia_name", "ianame", "layout_name", "estate_name", "industrial_estate", "industrialname", "nmindar",
        )
        plot_status = _prop(properties, "plot_status", "plotstatus", "status", "allotment_status", "allotmentstatus", "indx", "plst")
        project_status = _prop(
            properties,
            "project_implementation_status", "projectimplementationstatus", "project_status",
            "implementation_status", "implementationstatus", "implst",
        )
        nature = _prop(
            properties,
            "nature_of_industry", "natureofindustry", "industry_type", "industrytype",
            "sector", "nature", "activity", "product", "product_name", "ntrind",
        )
        category = _prop(properties, "category", "reservation", "plot_category", "plotcategory", "env_category", "environment_category") or nature
        extent = _prop(properties, "extent", "plot_extent", "plotextent", "area", "area_sq_m", "area_in_acres", "extent_acres", "pltar", "plotsize_sqm")
        plot_code = _prop(properties, "plotcode", "plot_code", "plcd")
        industry_code = _prop(properties, "industrycode", "industry_code")
        ulpin = _prop(properties, "ulpin")

        allottee_text = _clean_text(allottee)
        plot_text = _clean_text(plot_no)
        area_text = _clean_text(industrial_area)
        display_name = allottee_text or (f"KIADB Plot {plot_text}" if plot_text else "KIADB industrial plot")
        plot_code_text = _clean_text(plot_code)
        source_id = plot_code_text or _clean_text(feature.get("id")) or plot_text or str(index)
        identity_status = "OFFICIAL_KIADB_ALLOTTEE" if allottee_text else "KIADB_PLOT_WITHOUT_ALLOTTEE"
        items.append(
            {
                "source": "KIADB",
                "source_id": source_id,
                "name": display_name,
                "category": _clean_text(category) or "KIADB industrial plot",
                "lat": lat,
                "lng": lng,
                "address": area_text,
                "metadata": {
                    "kiadb_plot_no": plot_text,
                    "kiadb_plot_code": plot_code_text,
                    "kiadb_industry_code": _clean_text(industry_code),
                    "ulpin": _clean_text(ulpin),
                    "allottee": allottee_text,
                    "resolved_industry_name": allottee_text,
                    "identity_source": "KIADB_ALLOTTEE" if allottee_text else "KIADB_PLOT",
                    "identity_status": identity_status,
                    "industrial_area": area_text,
                    "plot_status": _clean_text(plot_status),
                    "project_status": _clean_text(project_status),
                    "nature_of_industry": _clean_text(nature),
                    "extent": _clean_text(extent),
                    "properties": properties,
                    "identity_confidence": "GOVERNMENT_PLOT_RECORD",
                },
            }
        )
    return items


def _format_template_url(template: str, bbox: tuple[float, float, float, float]) -> str:
    south, west, north, east = bbox
    return template.format(south=south, west=west, north=north, east=east, bbox=f"{west},{south},{east},{north}")


def _with_query(url: str, params: dict[str, Any]) -> str:
    parts = urlsplit(url)
    query = dict(parse_qsl(parts.query, keep_blank_values=True))
    query.update({key: str(value) for key, value in params.items() if value is not None and value != ""})
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))


def _web_mercator_xy(lat: float, lng: float) -> tuple[float, float]:
    """Convert WGS84 lon/lat to EPSG:3857 / ArcGIS wkid 102100."""
    safe_lat = max(-85.05112878, min(85.05112878, float(lat)))
    x = 6378137.0 * math.radians(float(lng))
    y = 6378137.0 * math.log(math.tan(math.pi / 4.0 + math.radians(safe_lat) / 2.0))
    return x, y


def _arcgis_envelope_query_url(url: str, bbox: tuple[float, float, float, float]) -> str:
    south, west, north, east = bbox
    xmin, ymin = _web_mercator_xy(south, west)
    xmax, ymax = _web_mercator_xy(north, east)
    geometry = json.dumps(
        {
            "xmin": min(xmin, xmax),
            "ymin": min(ymin, ymax),
            "xmax": max(xmin, xmax),
            "ymax": max(ymin, ymax),
            "spatialReference": {"wkid": 102100},
        },
        separators=(",", ":"),
    )
    return _with_query(
        url,
        {
            "f": "json",
            # The route envelope can intersect many plots. Geometry rings are large and are
            # unnecessary because this KIADB layer already returns latitude/longitude fields.
            # Keeping the ArcGIS payload attribute-only avoids the 25 s timeout seen at runtime.
            "returnGeometry": "false",
            "spatialRel": "esriSpatialRelIntersects",
            "geometry": geometry,
            "geometryType": "esriGeometryEnvelope",
            "inSR": "102100",
            "outFields": "*",
            "outSR": "102100",
            "resultRecordCount": "2000",
        },
    )


def _arcgis_point_query_url(url: str, lat: float, lng: float) -> str:
    """Build the captured K-GIS/KIADB point-intersection query for one detected industry."""
    x, y = _web_mercator_xy(lat, lng)
    geometry = json.dumps(
        {"x": x, "y": y, "spatialReference": {"wkid": 102100}},
        separators=(",", ":"),
    )
    return _with_query(
        url,
        {
            "f": "json",
            "returnGeometry": "false",
            "spatialRel": "esriSpatialRelIntersects",
            "geometry": geometry,
            "geometryType": "esriGeometryPoint",
            "inSR": "102100",
            "outFields": "*",
            "outSR": "102100",
            "resultRecordCount": "50",
        },
    )


def _arcgis_candidate_envelope_query_url(url: str, lat: float, lng: float, radius_m: float) -> str:
    """Search a small Web-Mercator envelope around one unresolved detected industry."""
    x, y = _web_mercator_xy(lat, lng)
    radius = max(1.0, float(radius_m))
    geometry = json.dumps(
        {
            "xmin": x - radius,
            "ymin": y - radius,
            "xmax": x + radius,
            "ymax": y + radius,
            "spatialReference": {"wkid": 102100},
        },
        separators=(",", ":"),
    )
    return _with_query(
        url,
        {
            "f": "json",
            "returnGeometry": "false",
            "spatialRel": "esriSpatialRelIntersects",
            "geometry": geometry,
            "geometryType": "esriGeometryEnvelope",
            "inSR": "102100",
            "outFields": "*",
            "outSR": "102100",
            "resultRecordCount": "100",
        },
    )


def _wfs_feature_url(url: str, layer: str, bbox: tuple[float, float, float, float], version: str) -> str:
    south, west, north, east = bbox
    params: dict[str, Any] = {
        "service": "WFS",
        "request": "GetFeature",
        "version": version,
        "srsName": "EPSG:4326",
        "outputFormat": "application/json",
        "bbox": f"{west},{south},{east},{north},EPSG:4326",
    }
    params["typeNames" if version.startswith("2") else "typeName"] = layer
    return _with_query(url, params)


def _discover_kiadb(bbox: tuple[float, float, float, float]) -> tuple[list[dict[str, Any]], str]:
    geojson_url = os.environ.get("ARKAVATHI_KIADB_GEOJSON_URL", "").strip()
    wfs_url = os.environ.get("ARKAVATHI_KIADB_WFS_URL", "").strip()
    layer = os.environ.get("ARKAVATHI_KIADB_WFS_LAYER", "").strip()
    if geojson_url:
        url = _format_template_url(geojson_url, bbox)
        return _parse_kiadb_features(_fetch_json(url)), "Configured KIADB industrial-plot GeoJSON/API connector"
    if wfs_url and layer:
        version = os.environ.get("ARKAVATHI_KIADB_WFS_VERSION", "2.0.0").strip() or "2.0.0"
        url = _wfs_feature_url(wfs_url, layer, bbox, version)
        return _parse_kiadb_features(_fetch_json(url)), f"Configured KIADB industrial-plot WFS layer: {layer}"
    if KIADB_ARCGIS_QUERY_URL:
        url = _arcgis_envelope_query_url(KIADB_ARCGIS_QUERY_URL, bbox)
        payload = _fetch_json(
            url,
            headers={
                "Referer": "https://kiadb.karnataka.gov.in/",
                "Origin": "https://kiadb.karnataka.gov.in",
            },
            timeout=max(3.0, min(NETWORK_TIMEOUT, SOURCE_HTTP_TIMEOUT)),
        )
        return _parse_kiadb_features(payload), "Live K-GIS/KIADB ArcGIS industrial-plot layer (MapServer/1)"
    return [], "KIADB ArcGIS industrial-plot connector is disabled"


def _fetch_kiadb_identifier_json(
    url: str,
    *,
    data: bytes,
    timeout: float = NETWORK_TIMEOUT,
) -> Any:
    """Call KIADB's ASMX identifier endpoint with a real ASP.NET portal session.

    The public KIADB portal creates an ASP.NET_SessionId on the portal GET. The captured,
    working browser/Python contract then POSTs JSON to the intentionally misspelled
    getdeatilsforidentifier endpoint. Keep this flow backend-only; never expose cookies
    or portal session state to the React client.
    """
    global _KIADB_SESSION_READY
    context = ssl.create_default_context()
    with _KIADB_SESSION_LOCK:
        opener = build_opener(
            HTTPCookieProcessor(_KIADB_COOKIE_JAR),
            HTTPSHandler(context=context),
        )
        if not _KIADB_SESSION_READY:
            portal_request = Request(
                KIADB_PORTAL_URL,
                method="GET",
                headers={
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    "User-Agent": USER_AGENT,
                },
            )
            with opener.open(portal_request, timeout=timeout) as response:
                response.read(1)
            _KIADB_SESSION_READY = True

        request = Request(
            url,
            data=data,
            method="POST",
            headers={
                "Accept": "application/json, text/javascript, */*; q=0.01",
                "Accept-Language": "en-US,en;q=0.9",
                "Content-Type": "application/json; charset=UTF-8",
                "Origin": "https://kiadb.karnataka.gov.in",
                "Referer": KIADB_PORTAL_URL,
                "X-Requested-With": "XMLHttpRequest",
                "User-Agent": USER_AGENT,
            },
        )
        with opener.open(request, timeout=timeout) as response:
            raw = response.read()
    return json.loads(raw.decode("utf-8"))


def _looks_like_company_name(value: Any) -> bool:
    text = _clean_text(value)
    if not text:
        return False
    lower = f" {text.lower()} "
    markers = (
        " pvt", " private", " ltd", " limited", " llp", " pte", " inc", " corporation",
        " industries", " industry", " engineering", " chemicals", " chemical", " manufacturing",
        " manufacturer", " enterprises", " works", " company", " factory", " mills", " steel",
        " pharma", " laboratories", " labs", " motors", " foods", " plastics", " textiles",
        " automotive", " systems", " solutions", " cement", " energy", " power", " agro",
    )
    return any(marker in lower for marker in markers)


def _extract_kiadb_company_name(nmalt: Any, addalt: Any) -> tuple[str, str]:
    """Return a company/industry name without mislabelling a director/person as the company.

    KIADB records are inconsistent: some records put the company directly in nmalt (for example
    MAKINO ASIA PTE LTD), while others put a director/person in nmalt and begin addalt with the
    company name (for example Foxconn ... Pvt.Ltd, Devanahalli ...).
    """
    allottee = _clean_text(nmalt)
    address = _clean_text(addalt)
    if _looks_like_company_name(allottee):
        return allottee, "NMALT"
    if address:
        parts = [part.strip() for part in address.split(",") if part.strip()]
        if parts and not parts[0][:1].isdigit():
            for count in range(1, min(3, len(parts)) + 1):
                candidate = ", ".join(parts[:count]).strip()
                if len(candidate) <= 180 and _looks_like_company_name(candidate):
                    return candidate, "ADDALT_PREFIX"
    return "", ""


def _kiadb_details_body(item: dict[str, Any]) -> bytes | None:
    template = KIADB_PLOT_DETAILS_BODY_TEMPLATE
    if not template:
        return None
    metadata = item.get("metadata") if isinstance(item.get("metadata"), dict) else {}
    replacements = {
        "{{plot_code}}": _clean_text(metadata.get("kiadb_plot_code")) or _clean_text(item.get("source_id")),
        "{{plot_no}}": _clean_text(metadata.get("kiadb_plot_no")),
        "{{source_id}}": _clean_text(item.get("source_id")),
        "{{lat}}": str(item.get("lat", "")),
        "{{lng}}": str(item.get("lng", "")),
    }
    rendered = template
    for token, value in replacements.items():
        rendered = rendered.replace(token, value)
    # Validate before sending so a malformed .env value never produces an opaque portal request.
    parsed = json.loads(rendered)
    return json.dumps(parsed, ensure_ascii=False).encode("utf-8")


def _enrich_kiadb_item_details(item: dict[str, Any]) -> dict[str, Any]:
    """Enrich one spatial KIADB plot using the proven PLCD -> identifier workflow."""
    body = _kiadb_details_body(item)
    if body is None or not KIADB_PLOT_DETAILS_URL:
        return item

    metadata0 = item.get("metadata") if isinstance(item.get("metadata"), dict) else {}
    plot_code = _clean_text(metadata0.get("kiadb_plot_code")) or _clean_text(item.get("source_id"))
    cached = _KIADB_DETAILS_CACHE.get(plot_code) if plot_code else None
    if isinstance(cached, dict):
        payload = cached
    else:
        payload = _fetch_kiadb_identifier_json(
            KIADB_PLOT_DETAILS_URL,
            data=body,
            timeout=max(3.0, min(NETWORK_TIMEOUT, SOURCE_HTTP_TIMEOUT)),
        )
        if plot_code:
            _KIADB_DETAILS_CACHE[plot_code] = payload

    rows = _payload_feature_rows(payload)
    if not rows:
        return item
    row = rows[0]
    properties = row.get("properties") if isinstance(row.get("properties"), dict) else row

    nmalt = _clean_text(_prop(
        properties, "allottee_name", "allotee_name", "allottee", "allotee", "allotteename", "alloteename",
        "name_of_allottee", "name_of_allotee", "nmalt",
    ))
    addalt = _clean_text(_prop(properties, "allottee_address", "address", "addalt"))
    company_name, company_name_source = _extract_kiadb_company_name(nmalt, addalt)
    plot_no = _clean_text(_prop(properties, "plot_no", "plot_number", "plotno", "plotnumber", "plot", "plot_id", "plotid", "plno"))
    area = _clean_text(_prop(properties, "industrial_area", "industrial_area_name", "industrialarea", "industrialareaname", "ia_name", "ianame", "layout_name", "estate_name", "nmindar"))
    nature = _clean_text(_prop(properties, "nature_of_industry", "natureofindustry", "industry_type", "industrytype", "sector", "nature", "activity", "ntrind"))
    plot_status = _clean_text(_prop(properties, "plot_status", "plotstatus", "status", "allotment_status", "allotmentstatus", "plst"))
    project_status = _clean_text(_prop(properties, "project_implementation_status", "projectimplementationstatus", "project_status", "implementation_status", "implementationstatus", "implst"))
    extent = _clean_text(_prop(properties, "extent", "plot_extent", "plotextent", "area", "area_in_acres", "extent_acres", "pltar", "plotsize_sqm"))

    enriched = dict(item)
    metadata = dict(metadata0)
    if nmalt:
        metadata["allottee"] = nmalt
    if company_name:
        enriched["name"] = company_name
        metadata["company_name"] = company_name
        metadata["resolved_industry_name"] = company_name
        metadata["company_name_source"] = company_name_source
        metadata["identity_source"] = "KIADB_IDENTIFIER"
        metadata["identity_status"] = "OFFICIAL_KIADB_COMPANY"
    else:
        metadata["identity_source"] = "KIADB_IDENTIFIER"
        metadata["identity_status"] = "KIADB_PLOT_IDENTITY_NO_COMPANY_NAME"
    if plot_no:
        metadata["kiadb_plot_no"] = plot_no
    if area:
        enriched["address"] = area
        metadata["industrial_area"] = area
    if nature:
        metadata["nature_of_industry"] = nature
    if plot_status:
        metadata["plot_status"] = plot_status
    if project_status:
        metadata["project_status"] = project_status
    if extent:
        metadata["extent"] = extent
    captured_fields = {
        "district": _clean_text(_prop(properties, "district", "district_name", "dstr")),
        "allotment_date": _clean_text(_prop(properties, "allotment_date", "date_of_allotment", "dtaltm")),
        "allottee_address": addalt,
        "village_name": _clean_text(_prop(properties, "village_name")),
        "survey_no": _clean_text(_prop(properties, "survey_no")),
        "zone_office_name": _clean_text(_prop(properties, "zone_office_name")),
        "plot_category": _clean_text(_prop(properties, "plot_category")),
        "etp": _clean_text(_prop(properties, "etp")),
        "stp": _clean_text(_prop(properties, "stp")),
        "water_availability": _clean_text(_prop(properties, "water_availability")),
        "electricpoweravailability": _clean_text(_prop(properties, "electricpoweravailability")),
    }
    metadata.update({key: value for key, value in captured_fields.items() if value})
    metadata["kiadb_details_loaded"] = True
    metadata["kiadb_details_endpoint"] = "getdeatilsforidentifier"
    metadata["kiadb_details_properties"] = properties
    enriched["metadata"] = metadata
    return enriched


def _kiadb_candidate_query_headers() -> dict[str, str]:
    return {
        "Accept": "application/json, text/plain, */*",
        "Referer": "https://kiadb.karnataka.gov.in/kiadbgisportal/",
        "Origin": "https://kiadb.karnataka.gov.in",
    }


def _discover_kiadb_candidate_plot(lat: float, lng: float) -> tuple[dict[str, Any] | None, dict[str, Any]]:
    """Find the KIADB plot intersecting, or conservatively nearest to, one detected industry point."""
    if not KIADB_CANDIDATE_LOOKUP_ENABLED or not KIADB_ARCGIS_QUERY_URL:
        return None, {"queries": 0, "method": "DISABLED", "distance_m": None, "cached": False}

    key = f"{float(lat):.6f},{float(lng):.6f},{KIADB_CANDIDATE_MATCH_RADIUS_M:.0f}"
    cached = _KIADB_CANDIDATE_CACHE.get(key)
    if isinstance(cached, dict):
        item = cached.get("item") if isinstance(cached.get("item"), dict) else None
        return item, {
            "queries": 0,
            "method": str(cached.get("method") or "CACHE"),
            "distance_m": cached.get("distance_m"),
            "cached": True,
        }

    headers = _kiadb_candidate_query_headers()
    timeout = max(3.0, min(NETWORK_TIMEOUT, SOURCE_HTTP_TIMEOUT))
    queries = 0

    # 1) Strongest evidence: the detected industry point itself intersects a KIADB plot.
    point_url = _arcgis_point_query_url(KIADB_ARCGIS_QUERY_URL, lat, lng)
    point_payload = _fetch_json(point_url, headers=headers, timeout=timeout)
    queries += 1
    exact_rows = _parse_kiadb_features(point_payload)
    if exact_rows:
        exact_rows.sort(key=lambda row: _distance_m(float(lat), float(lng), float(row["lat"]), float(row["lng"])))
        item = exact_rows[0]
        distance = _distance_m(float(lat), float(lng), float(item["lat"]), float(item["lng"]))
        _KIADB_CANDIDATE_CACHE[key] = {"item": item, "method": "EXACT_POINT_INTERSECT", "distance_m": distance}
        return item, {"queries": queries, "method": "EXACT_POINT_INTERSECT", "distance_m": distance, "cached": False}

    # 2) Fallback: a small nearby plot search. This is intentionally labelled as nearby,
    # not proof that the OSM industrial polygon and KIADB allotment are the same parcel.
    nearby_url = _arcgis_candidate_envelope_query_url(
        KIADB_ARCGIS_QUERY_URL, lat, lng, KIADB_CANDIDATE_MATCH_RADIUS_M
    )
    nearby_payload = _fetch_json(nearby_url, headers=headers, timeout=timeout)
    queries += 1
    nearby_rows = _parse_kiadb_features(nearby_payload)
    ranked: list[tuple[float, dict[str, Any]]] = []
    for row in nearby_rows:
        try:
            distance = _distance_m(float(lat), float(lng), float(row["lat"]), float(row["lng"]))
        except (TypeError, ValueError, KeyError):
            continue
        if distance <= KIADB_CANDIDATE_MATCH_RADIUS_M:
            ranked.append((distance, row))
    ranked.sort(key=lambda pair: pair[0])
    if ranked:
        distance, item = ranked[0]
        _KIADB_CANDIDATE_CACHE[key] = {"item": item, "method": "NEARBY_PLOT", "distance_m": distance}
        return item, {"queries": queries, "method": "NEARBY_PLOT", "distance_m": distance, "cached": False}

    _KIADB_CANDIDATE_CACHE[key] = {"item": None, "method": "NO_MATCH", "distance_m": None}
    return None, {"queries": queries, "method": "NO_MATCH", "distance_m": None, "cached": False}


def _apply_kiadb_identity_to_context(
    item: dict[str, Any], plot: dict[str, Any], *, match_method: str, match_distance_m: float | None
) -> dict[str, Any]:
    """Copy official KIADB allottee identity onto an already-detected OSM industrial context."""
    updated = dict(item)
    item_meta = dict(item.get("metadata") if isinstance(item.get("metadata"), dict) else {})
    plot_meta = plot.get("metadata") if isinstance(plot.get("metadata"), dict) else {}
    resolved_name = _clean_text(plot_meta.get("resolved_industry_name")) or _clean_text(plot_meta.get("company_name"))
    if not resolved_name:
        return updated

    updated["name"] = resolved_name
    if _clean_text(plot_meta.get("nature_of_industry")):
        updated["category"] = _clean_text(plot_meta.get("nature_of_industry"))
    if _clean_text(plot.get("address")):
        updated["address"] = _clean_text(plot.get("address"))

    copied_keys = (
        "kiadb_plot_no", "kiadb_plot_code", "kiadb_industry_code", "ulpin", "allottee",
        "industrial_area", "plot_status", "project_status", "nature_of_industry", "extent",
        "district", "allotment_date", "allottee_address", "village_name", "survey_no",
        "zone_office_name", "plot_category",
    )
    for key in copied_keys:
        value = plot_meta.get(key)
        if value not in (None, ""):
            item_meta[key] = value

    item_meta["resolved_industry_name"] = resolved_name
    item_meta["identity_source"] = "KIADB_IDENTIFIER"
    item_meta["identity_confidence"] = "GOVERNMENT_PLOT_RECORD"
    item_meta["identity_kiadb_source_id"] = _clean_text(plot.get("source_id"))
    item_meta["identity_match_method"] = match_method
    if match_distance_m is not None:
        item_meta["identity_match_distance_m"] = round(float(match_distance_m), 2)

    if match_method == "EXACT_POINT_INTERSECT":
        item_meta["identity_status"] = "OFFICIAL_KIADB_COMPANY"
        note = "Detected industry point intersects the KIADB plot; company identity loaded from KIADB getdeatilsforidentifier."
    else:
        item_meta["identity_status"] = "NEARBY_KIADB_PLOT_MATCH"
        note = (
            f"KIADB company identity found on the nearest KIADB plot within {float(match_distance_m or 0):.0f} m. "
            "This is a nearby plot identity match and must not be treated as parcel ownership proof for the OSM polygon."
        )
    existing_note = _clean_text(item_meta.get("identity_note"))
    item_meta["identity_note"] = f"{note} {existing_note}".strip()
    updated["metadata"] = item_meta
    return updated


def _try_enrich_kiadb_context_identities(items: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Resolve unresolved detected industries against KIADB plot + official allottee endpoints."""
    if not items or not KIADB_CANDIDATE_LOOKUP_ENABLED or not KIADB_ARCGIS_QUERY_URL:
        return items, {
            "configured": bool(KIADB_CANDIDATE_LOOKUP_ENABLED and KIADB_ARCGIS_QUERY_URL),
            "attempted": False, "ok": True, "queries": 0, "matches": 0, "enriched": 0,
            "exact": 0, "nearby": 0, "message": "KIADB candidate-centered identity lookup not needed or disabled.",
        }

    out: list[dict[str, Any]] = []
    queries = matches = enriched = exact = nearby = 0
    failures: list[str] = []

    for item in items:
        if _osm_item_has_named_identity(item) or queries >= KIADB_CANDIDATE_MAX_QUERIES:
            out.append(item)
            continue
        try:
            plot, probe = _discover_kiadb_candidate_plot(float(item["lat"]), float(item["lng"]))
            queries += int(probe.get("queries") or 0)
            if not plot:
                out.append(item)
                continue
            matches += 1
            method = str(probe.get("method") or "NEARBY_PLOT")
            distance = _finite(probe.get("distance_m"))
            try:
                plot = _enrich_kiadb_item_details(plot)
            except Exception as exc:
                failures.append(f"details {plot.get('source_id','')}: {exc}")
            plot_meta = plot.get("metadata") if isinstance(plot.get("metadata"), dict) else {}
            if _clean_text(plot_meta.get("resolved_industry_name")) or _clean_text(plot_meta.get("company_name")):
                item = _apply_kiadb_identity_to_context(
                    item, plot, match_method=method, match_distance_m=distance
                )
                enriched += 1
                if method == "EXACT_POINT_INTERSECT":
                    exact += 1
                else:
                    nearby += 1
            out.append(item)
        except Exception as exc:
            failures.append(str(exc))
            out.append(item)

    ok = not failures
    message = (
        f"Candidate-centered KIADB lookup queried {queries} endpoint request(s), matched {matches} plot(s), "
        f"and resolved {enriched} KIADB company/industry name(s) ({exact} exact point-intersection, {nearby} nearby plot)."
    )
    if failures:
        message += " Last error: " + failures[-1]
    return out, {
        "configured": True, "attempted": True, "ok": ok, "queries": queries,
        "matches": matches, "enriched": enriched, "exact": exact, "nearby": nearby,
        "message": message,
    }


def _apply_kiadb_candidate_status(source_status: dict[str, Any], refresh: dict[str, Any]) -> None:
    target = source_status.get("kiadb") if isinstance(source_status.get("kiadb"), dict) else {}
    target.update(
        {
            "candidate_lookup_configured": bool(refresh.get("configured", KIADB_CANDIDATE_LOOKUP_ENABLED)),
            "candidate_lookup_attempted": bool(refresh.get("attempted", False)),
            "candidate_lookup_ok": bool(refresh.get("ok", True)),
            "candidate_query_count": int(refresh.get("queries", 0) or 0),
            "candidate_match_count": int(refresh.get("matches", 0) or 0),
            "candidate_enriched_count": int(refresh.get("enriched", 0) or 0),
            "candidate_exact_count": int(refresh.get("exact", 0) or 0),
            "candidate_nearby_count": int(refresh.get("nearby", 0) or 0),
            "candidate_message": str(refresh.get("message") or ""),
        }
    )
    base_message = str(target.get("message") or "")
    candidate_message = str(refresh.get("message") or "")
    if candidate_message:
        target["message"] = (base_message + " " + candidate_message).strip()
    source_status["kiadb"] = target


# ---------------------------- River context ---------------------------------

def _valid_lng_lat(coord: Any) -> tuple[float, float] | None:
    if not isinstance(coord, (list, tuple)) or len(coord) < 2:
        return None
    lng = _finite(coord[0])
    lat = _finite(coord[1])
    if lng is None or lat is None or not (-180 <= lng <= 180 and -90 <= lat <= 90):
        return None
    return float(lng), float(lat)


def _normalize_line(coords: Any) -> list[list[float]]:
    if not isinstance(coords, list):
        return []
    points: list[list[float]] = []
    for coord in coords:
        value = _valid_lng_lat(coord)
        if value is not None:
            points.append([value[0], value[1]])
    if len(points) < 2:
        return []
    if len(points) > MAX_RIVER_POINTS_PER_LINE:
        step = max(1, math.ceil(len(points) / MAX_RIVER_POINTS_PER_LINE))
        sampled = points[::step]
        if sampled[-1] != points[-1]:
            sampled.append(points[-1])
        points = sampled
    return points


def _geometry_lines(geometry: Any) -> list[list[list[float]]]:
    if not isinstance(geometry, dict):
        return []
    geometry_type = str(geometry.get("type") or "")
    coordinates = geometry.get("coordinates")
    if geometry_type == "LineString":
        line = _normalize_line(coordinates)
        return [line] if line else []
    if geometry_type == "MultiLineString":
        return [line for part in coordinates or [] if (line := _normalize_line(part))]
    if geometry_type == "Polygon":
        return [line for ring in coordinates or [] if (line := _normalize_line(ring))]
    if geometry_type == "MultiPolygon":
        lines: list[list[list[float]]] = []
        for polygon in coordinates or []:
            lines.extend(line for ring in polygon or [] if (line := _normalize_line(ring)))
        return lines
    if geometry_type == "GeometryCollection":
        lines: list[list[list[float]]] = []
        for child in geometry.get("geometries") or []:
            lines.extend(_geometry_lines(child))
        return lines
    return []


def _parse_river_geojson(payload: Any, source: str) -> list[dict[str, Any]]:
    if isinstance(payload, dict) and isinstance(payload.get("features"), list):
        features = payload["features"]
    elif isinstance(payload, list):
        features = payload
    else:
        features = []
    lines: list[dict[str, Any]] = []
    for index, feature in enumerate(features):
        if not isinstance(feature, dict):
            continue
        properties = feature.get("properties") if isinstance(feature.get("properties"), dict) else {}
        name = str(_prop(properties, "name", "river_name", "stream_name", "waterway_name", "drain_name") or "River / stream")
        waterway = str(_prop(properties, "waterway", "type", "feature_type", "category") or "river")
        source_id = str(feature.get("id") or _prop(properties, "id", "objectid", "gid") or index)
        for line_index, coordinates in enumerate(_geometry_lines(feature.get("geometry"))):
            lines.append(
                {
                    "source": source,
                    "source_id": f"{source_id}:{line_index}",
                    "name": name,
                    "waterway": waterway,
                    "coordinates": coordinates,
                }
            )
            if len(lines) >= MAX_RIVER_FEATURES:
                return lines
    return lines


def _discover_kiadb_rivers(bbox: tuple[float, float, float, float]) -> tuple[list[dict[str, Any]], str]:
    geojson_url = os.environ.get("ARKAVATHI_KIADB_RIVER_GEOJSON_URL", "").strip()
    wfs_url = os.environ.get("ARKAVATHI_KIADB_RIVER_WFS_URL", "").strip()
    layer = os.environ.get("ARKAVATHI_KIADB_RIVER_WFS_LAYER", "").strip()
    if geojson_url:
        url = _format_template_url(geojson_url, bbox)
        return _parse_river_geojson(_fetch_json(url), "KIADB"), "Configured KIADB river GeoJSON/API connector"
    if wfs_url and layer:
        version = os.environ.get("ARKAVATHI_KIADB_RIVER_WFS_VERSION", "2.0.0").strip() or "2.0.0"
        url = _wfs_feature_url(wfs_url, layer, bbox, version)
        return _parse_river_geojson(_fetch_json(url), "KIADB"), f"Configured KIADB river WFS layer: {layer}"
    return [], "KIADB river connector ready but river service URL/layer is not configured yet"


def _overpass_geometry_lines(element: dict[str, Any]) -> list[list[list[float]]]:
    lines: list[list[list[float]]] = []
    geometry = element.get("geometry")
    if isinstance(geometry, list):
        line = _normalize_line([[point.get("lon"), point.get("lat")] for point in geometry if isinstance(point, dict)])
        if line:
            lines.append(line)
    for member in element.get("members") or []:
        if not isinstance(member, dict):
            continue
        member_geometry = member.get("geometry")
        if isinstance(member_geometry, list):
            line = _normalize_line([[point.get("lon"), point.get("lat")] for point in member_geometry if isinstance(point, dict)])
            if line:
                lines.append(line)
    return lines


def _discover_rivers_osm(bbox: tuple[float, float, float, float]) -> list[dict[str, Any]]:
    south, west, north, east = bbox
    query = f"""[out:json][timeout:25];
(
  way[\"waterway\"~\"^(river|stream|canal)$\"]({south:.7f},{west:.7f},{north:.7f},{east:.7f});
  relation[\"waterway\"~\"^(river|stream|canal)$\"]({south:.7f},{west:.7f},{north:.7f},{east:.7f});
  way[\"natural\"=\"water\"][\"water\"=\"river\"]({south:.7f},{west:.7f},{north:.7f},{east:.7f});
  relation[\"natural\"=\"water\"][\"water\"=\"river\"]({south:.7f},{west:.7f},{north:.7f},{east:.7f});
);
out geom tags;"""
    body = urlencode({"data": query}).encode("utf-8")
    payload = _fetch_json(
        DEFAULT_OVERPASS_URL,
        method="POST",
        data=body,
        headers={"Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"},
    )
    lines: list[dict[str, Any]] = []
    for element in payload.get("elements", []) if isinstance(payload, dict) else []:
        if not isinstance(element, dict):
            continue
        tags = element.get("tags") if isinstance(element.get("tags"), dict) else {}
        name = str(tags.get("name") or tags.get("waterway") or tags.get("water") or "River / stream").strip()
        waterway = str(tags.get("waterway") or tags.get("water") or "river")
        source_id = f"{element.get('type', 'feature')}/{element.get('id', '')}"
        for line_index, coordinates in enumerate(_overpass_geometry_lines(element)):
            lines.append(
                {
                    "source": "OPENSTREETMAP",
                    "source_id": f"{source_id}:{line_index}",
                    "name": name,
                    "waterway": waterway,
                    "coordinates": coordinates,
                }
            )
            if len(lines) >= MAX_RIVER_FEATURES:
                return lines
    return lines


def _river_geojson(lines: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "id": line.get("source_id"),
                "properties": {
                    "name": line.get("name") or "River / stream",
                    "waterway": line.get("waterway") or "river",
                    "source": line.get("source") or "UNKNOWN",
                },
                "geometry": {"type": "LineString", "coordinates": line.get("coordinates") or []},
            }
            for line in lines
            if len(line.get("coordinates") or []) >= 2
        ],
    }


def _distance_point_to_segment_m(
    lat: float, lng: float, a_lng: float, a_lat: float, b_lng: float, b_lat: float
) -> tuple[float, float, float]:
    lat_scale = 111_320.0
    lng_scale = max(1.0, 111_320.0 * math.cos(math.radians(lat)))
    ax = (a_lng - lng) * lng_scale
    ay = (a_lat - lat) * lat_scale
    bx = (b_lng - lng) * lng_scale
    by = (b_lat - lat) * lat_scale
    dx = bx - ax
    dy = by - ay
    denom = dx * dx + dy * dy
    t = 0.0 if denom <= 1e-12 else max(0.0, min(1.0, -(ax * dx + ay * dy) / denom))
    px = ax + t * dx
    py = ay + t * dy
    nearest_lng = lng + px / lng_scale
    nearest_lat = lat + py / lat_scale
    return math.hypot(px, py), nearest_lat, nearest_lng


def _distance_to_rivers(lat: float, lng: float, lines: list[dict[str, Any]]) -> tuple[float | None, str, str, float | None, float | None]:
    best_distance = float("inf")
    best_name = ""
    best_source = ""
    best_lat: float | None = None
    best_lng: float | None = None
    for line in lines:
        coordinates = line.get("coordinates") or []
        for index in range(len(coordinates) - 1):
            a, b = coordinates[index], coordinates[index + 1]
            if len(a) < 2 or len(b) < 2:
                continue
            distance, nearest_lat, nearest_lng = _distance_point_to_segment_m(
                lat, lng, float(a[0]), float(a[1]), float(b[0]), float(b[1])
            )
            if distance < best_distance:
                best_distance = distance
                best_name = str(line.get("name") or "River / stream")
                best_source = str(line.get("source") or "")
                best_lat = nearest_lat
                best_lng = nearest_lng
    if not math.isfinite(best_distance):
        return None, "", "", None, None
    return best_distance, best_name, best_source, best_lat, best_lng


def _discover_river_context(
    bbox: tuple[float, float, float, float], *, include_osm: bool, river_radius_m: float
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    kiadb_configured = bool(
        os.environ.get("ARKAVATHI_KIADB_RIVER_GEOJSON_URL", "").strip()
        or (
            os.environ.get("ARKAVATHI_KIADB_RIVER_WFS_URL", "").strip()
            and os.environ.get("ARKAVATHI_KIADB_RIVER_WFS_LAYER", "").strip()
        )
    )
    status: dict[str, Any] = {
        "available": False,
        "source": "NONE",
        "feature_count": 0,
        "filter_distance_m": river_radius_m,
        "message": "River GIS layer unavailable; candidates are shown by flight-path proximity only.",
        "kiadb_configured": kiadb_configured,
        "portal": "https://kiadb.karnataka.gov.in/kiadbgisportal/",
        "geojson": {"type": "FeatureCollection", "features": []},
    }

    try:
        lines, message = _discover_kiadb_rivers(bbox)
        if lines:
            status.update(
                {
                    "available": True,
                    "source": "KIADB",
                    "feature_count": len(lines),
                    "message": message,
                    "geojson": _river_geojson(lines),
                }
            )
            return lines, status
        if kiadb_configured:
            status["message"] = f"{message}; no river features intersected this SRT corridor."
    except Exception as exc:
        status["message"] = f"KIADB river query failed: {exc}"

    if include_osm:
        try:
            lines = _discover_rivers_osm(bbox)
            if lines:
                status.update(
                    {
                        "available": True,
                        "source": "OPENSTREETMAP",
                        "feature_count": len(lines),
                        "message": "OpenStreetMap river/stream fallback loaded for this SRT corridor.",
                        "geojson": _river_geojson(lines),
                    }
                )
                return lines, status
            status["message"] = "No KIADB river connector is active and no OSM river/stream feature was found in this SRT corridor."
        except Exception as exc:
            status["message"] = f"River fallback query failed: {exc}"

    return [], status


# ------------------------ Candidate scoring / storage ------------------------

def _candidate_key(item: dict[str, Any]) -> str:
    source = str(item.get("source") or "UNKNOWN").upper()
    source_id = str(item.get("source_id") or "").strip()
    if source_id:
        return f"{source}:{source_id}"
    return f"{source}:{str(item.get('name') or '').lower()}:{float(item['lat']):.6f}:{float(item['lng']):.6f}"


def _dedupe(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    unique: dict[str, dict[str, Any]] = {}
    for item in items:
        key = _candidate_key(item)
        if key not in unique:
            unique[key] = item
    return list(unique.values())


def _load_cached_osm_items(
    user: AuthUser,
    route: list[dict[str, float]],
    radius_m: float,
    *,
    video_name: str = "",
    srt_name: str = "",
) -> list[dict[str, Any]]:
    """Recover previously successful OSM candidates from the local SQLite discovery history.

    This is deliberately spatially revalidated against the CURRENT SRT route, so a stale wide
    corridor cannot leak unrelated industries into the live view. It is a resilience fallback
    for external OSM/Overpass outages, not a new source of truth.
    """
    if not LOCAL_OSM_CACHE_ENABLED:
        return []
    try:
        with connect() as db:
            rows = db.execute(
                """SELECT c.*, r.created_at AS run_created_at, r.video_name AS run_video_name,
                          r.srt_name AS run_srt_name, r.id AS run_db_id
                   FROM industry_candidates c
                   JOIN industry_discovery_runs r ON r.id=c.run_id
                   WHERE r.user_id=? AND c.source='OPENSTREETMAP'
                   ORDER BY
                     CASE WHEN r.srt_name=? AND ?<>'' THEN 0
                          WHEN r.video_name=? AND ?<>'' THEN 1 ELSE 2 END,
                     r.id DESC, c.route_distance_m ASC
                   LIMIT 5000""",
                (user.id, srt_name, srt_name, video_name, video_name),
            ).fetchall()
    except Exception:
        return []
    items: list[dict[str, Any]] = []
    seen: set[str] = set()
    for row in rows:
        try:
            lat = float(row["lat"])
            lng = float(row["lng"])
        except (TypeError, ValueError, KeyError):
            continue
        probe = {"lat": lat, "lng": lng}
        distance, _, _ = _nearest_route(probe, route)
        if distance > radius_m:
            continue
        source_id = _clean_text(row["source_id"])
        key = source_id or f"{lat:.7f},{lng:.7f}"
        if key in seen:
            continue
        seen.add(key)
        try:
            metadata = json.loads(row["metadata_json"] or "{}")
            if not isinstance(metadata, dict):
                metadata = {}
        except Exception:
            metadata = {}
        metadata = dict(metadata)
        metadata["cache_reused"] = True
        metadata["cache_original_run_created_at"] = _clean_text(row["run_created_at"])
        metadata["cache_original_srt_name"] = _clean_text(row["run_srt_name"])
        metadata["cache_original_video_name"] = _clean_text(row["run_video_name"])
        metadata["retrieval_mode"] = "LOCAL_DISCOVERY_CACHE"
        note = _clean_text(metadata.get("identity_note"))
        cache_note = "Reused from a previous successful local OSM discovery because the live OSM service was unavailable."
        metadata["identity_note"] = f"{note} {cache_note}".strip()
        items.append(
            {
                "source": "OPENSTREETMAP",
                "source_id": source_id,
                "name": _clean_text(row["name"]) or "Industrial site (OSM context)",
                "category": _clean_text(row["category"]) or "Industrial map context - identity unverified",
                "lat": lat,
                "lng": lng,
                "address": _clean_text(row["address"]),
                "metadata": metadata,
            }
        )
        if len(items) >= 1000:
            break
    return items


def _source_status_base() -> dict[str, Any]:
    kiadb_configured = bool(
        KIADB_ARCGIS_QUERY_URL
        or os.environ.get("ARKAVATHI_KIADB_GEOJSON_URL", "").strip()
        or (
            os.environ.get("ARKAVATHI_KIADB_WFS_URL", "").strip()
            and os.environ.get("ARKAVATHI_KIADB_WFS_LAYER", "").strip()
        )
    )
    kiadb_river_configured = bool(
        os.environ.get("ARKAVATHI_KIADB_RIVER_GEOJSON_URL", "").strip()
        or (
            os.environ.get("ARKAVATHI_KIADB_RIVER_WFS_URL", "").strip()
            and os.environ.get("ARKAVATHI_KIADB_RIVER_WFS_LAYER", "").strip()
        )
    )
    return {
        "kiadb": {
            "configured": kiadb_configured,
            "primary": True,
            "mode": (
                "geojson"
                if os.environ.get("ARKAVATHI_KIADB_GEOJSON_URL", "").strip()
                else ("wfs" if os.environ.get("ARKAVATHI_KIADB_WFS_URL", "").strip() else "kgis-arcgis")
            ),
            "portal": "https://kiadb.karnataka.gov.in/kiadbgisportal/",
            "arcgis_query_endpoint": KIADB_ARCGIS_QUERY_URL,
            "plot_details_endpoint": KIADB_PLOT_DETAILS_URL,
            "plot_details_body_configured": bool(KIADB_PLOT_DETAILS_BODY_TEMPLATE),
            "plot_details_contract": "candidate coordinate -> MapServer plotcode -> portal session -> getdeatilsforidentifier -> company identity",
            "candidate_lookup_enabled": KIADB_CANDIDATE_LOOKUP_ENABLED,
            "candidate_match_radius_m": KIADB_CANDIDATE_MATCH_RADIUS_M,
            "candidate_max_queries": KIADB_CANDIDATE_MAX_QUERIES,
        },
        "openstreetmap": {
            "configured": True,
            "primary": False,
            "mode": "overpass+osm-map-api+local-cache+kiadb-candidate-identity+expanded-identity-enrichment+candidate-centered-places",
            "endpoint": DEFAULT_OVERPASS_URL,
            "map_api_endpoint": OSM_MAP_API_URL,
            "local_cache_enabled": LOCAL_OSM_CACHE_ENABLED,
            "identity_enrichment_enabled": OSM_IDENTITY_ENRICH_ENABLED,
            "identity_match_radius_m": OSM_IDENTITY_MATCH_RADIUS_M,
            "identity_weak_match_radius_m": OSM_IDENTITY_WEAK_MATCH_RADIUS_M,
            "identity_business_match_radius_m": OSM_IDENTITY_BUSINESS_MATCH_RADIUS_M,
            "identity_search_pad_m": OSM_IDENTITY_SEARCH_PAD_M,
        },
        "google_places": {
            "configured": GOOGLE_PLACES_ENABLED,
            "primary": False,
            "mode": "identity-only-candidate-centered-business-match",
            "endpoint": GOOGLE_PLACES_NEARBY_URL,
            "match_radius_m": GOOGLE_PLACES_MATCH_RADIUS_M,
            "weak_match_radius_m": GOOGLE_PLACES_WEAK_MATCH_RADIUS_M,
            "point_radius_m": GOOGLE_PLACES_POINT_RADIUS_M,
            "broad_radius_m": GOOGLE_PLACES_BROAD_RADIUS_M,
            "max_point_queries": GOOGLE_PLACES_MAX_POINT_QUERIES,
            "note": "Used only to name otherwise-unresolved industrial context; each unresolved candidate is searched from its own coordinate and proximity match is not KIADB ownership proof.",
        },
        "river": {
            "configured": kiadb_river_configured,
            "primary": True,
            "mode": "kiadb-preferred/osm-fallback",
            "portal": "https://kiadb.karnataka.gov.in/kiadbgisportal/",
        },
    }


def industry_source_status(user: AuthUser) -> dict[str, Any]:
    del user
    status = _source_status_base()
    status["version"] = "V29.6.11"
    status["note"] = (
        "V29.6.11 preserves V29.6.9 detection/movement and fixes the proven KIADB identity chain: candidate coordinate -> MapServer plotcode -> ASP.NET portal session -> getdeatilsforidentifier -> company/industry name. "
        "Exact KIADB point-intersection matches use the KIADB company identity when present; nearby KIADB plot matches remain explicitly labelled as proximity matches."
    )
    return status


def _river_relevance(distance: float | None, river_radius_m: float) -> str:
    if distance is None:
        return "RIVER_DATA_UNAVAILABLE"
    if distance <= min(100.0, river_radius_m):
        return "HIGH"
    if distance <= min(250.0, river_radius_m):
        return "MEDIUM"
    return "LOW"


def _serialize_candidate(
    item: dict[str, Any],
    route: list[dict[str, float]],
    radius_m: float,
    river_lines: list[dict[str, Any]],
    river_radius_m: float,
) -> dict[str, Any] | None:
    distance, index, sample = _nearest_route(item, route)
    if distance > radius_m:
        return None

    river_distance, river_name, river_source, river_lat, river_lng = _distance_to_rivers(
        float(item["lat"]), float(item["lng"]), river_lines
    )
    # When river geometry exists, only retain industries spatially related to the river corridor.
    if river_lines and river_distance is not None and river_distance > river_radius_m:
        return None

    if distance <= 100:
        proximity = "WITHIN_100M"
    elif distance <= 250:
        proximity = "WITHIN_250M"
    elif distance <= 500:
        proximity = "WITHIN_500M"
    else:
        proximity = "WITHIN_1KM" if radius_m <= 1000 else "OUTER_CORRIDOR"

    metadata = item.get("metadata") if isinstance(item.get("metadata"), dict) else {}
    display_name = _clean_text(metadata.get("resolved_industry_name")) or _clean_text(item.get("name")) or "Industrial site"
    return {
        "id": _candidate_key(item),
        "name": display_name,
        "display_name": display_name,
        "identity_source": _clean_text(metadata.get("identity_source")),
        "identity_status": _clean_text(metadata.get("identity_status")),
        "company_name": _clean_text(metadata.get("company_name")) or _clean_text(metadata.get("resolved_industry_name")),
        "allottee": _clean_text(metadata.get("allottee")),
        "company_name_source": _clean_text(metadata.get("company_name_source")),
        "identity_match_method": _clean_text(metadata.get("identity_match_method")),
        "identity_match_distance_m": _finite(metadata.get("identity_match_distance_m")),
        "kiadb_plot_no": _clean_text(metadata.get("kiadb_plot_no")),
        "industrial_area": _clean_text(metadata.get("industrial_area")),
        "nature_of_industry": _clean_text(metadata.get("nature_of_industry")),
        "plot_status": _clean_text(metadata.get("plot_status")),
        "source": str(item.get("source") or "UNKNOWN"),
        "source_id": str(item.get("source_id") or ""),
        "category": str(item.get("category") or ""),
        "lat": float(item["lat"]),
        "lng": float(item["lng"]),
        "address": str(item.get("address") or ""),
        "distance_from_route_m": round(distance, 2),
        "river_distance_m": round(river_distance, 2) if river_distance is not None else None,
        "nearest_river_name": river_name,
        "river_source": river_source,
        "river_relevance": _river_relevance(river_distance, river_radius_m),
        "nearest_river_lat": round(river_lat, 7) if river_lat is not None else None,
        "nearest_river_lng": round(river_lng, 7) if river_lng is not None else None,
        "nearest_video_time_s": round(sample["time"], 3),
        "nearest_video_time": _time_label(sample["time"]),
        "nearest_track_index": index,
        "nearest_track_lat": sample["lat"],
        "nearest_track_lng": sample["lng"],
        "proximity_band": proximity,
        "verification_status": "PENDING",
        "metadata": metadata,
    }


def _save_run(user: AuthUser, result: dict[str, Any]) -> None:
    with connect() as db:
        cursor = db.execute(
            """INSERT INTO industry_discovery_runs(
                public_id,user_id,video_name,srt_name,radius_m,river_radius_m,sample_count,
                route_bbox_json,river_context_json,source_status_json,created_at
            ) VALUES(?,?,?,?,?,?,?,?,?,?,?)""",
            (
                result["run_id"],
                user.id,
                result["video_name"],
                result["srt_name"],
                result["radius_m"],
                result["river_radius_m"],
                result["sample_count"],
                json.dumps(result["route_bbox"]),
                json.dumps(result["river_context"], ensure_ascii=False),
                json.dumps(result["sources"], ensure_ascii=False),
                result["generated_at"],
            ),
        )
        run_db_id = int(cursor.lastrowid)
        for candidate in result["candidates"]:
            db.execute(
                """INSERT OR IGNORE INTO industry_candidates(
                    run_id,candidate_key,name,source,source_id,category,lat,lng,address,route_distance_m,
                    river_distance_m,nearest_river_name,river_source,river_relevance,
                    nearest_video_time_s,nearest_track_index,nearest_track_lat,nearest_track_lng,metadata_json,
                    verification_status,created_at
                ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    run_db_id,
                    candidate["id"],
                    candidate["name"],
                    candidate["source"],
                    candidate["source_id"],
                    candidate["category"],
                    candidate["lat"],
                    candidate["lng"],
                    candidate["address"],
                    candidate["distance_from_route_m"],
                    candidate["river_distance_m"],
                    candidate["nearest_river_name"],
                    candidate["river_source"],
                    candidate["river_relevance"],
                    candidate["nearest_video_time_s"],
                    candidate["nearest_track_index"],
                    candidate["nearest_track_lat"],
                    candidate["nearest_track_lng"],
                    json.dumps(candidate["metadata"], ensure_ascii=False),
                    candidate["verification_status"],
                    result["generated_at"],
                ),
            )
        db.commit()


def _apply_places_status(source_status: dict[str, Any], refresh: dict[str, Any]) -> None:
    target = source_status.get("google_places") if isinstance(source_status.get("google_places"), dict) else {}
    target.update(
        {
            "configured": bool(refresh.get("configured", GOOGLE_PLACES_ENABLED)),
            "attempted": bool(refresh.get("attempted", False)),
            "ok": bool(refresh.get("ok", True)),
            "count": int(refresh.get("anchors", 0) or 0),
            "identity_enriched_count": int(refresh.get("enriched", 0) or 0),
            "strong_match_count": int(refresh.get("strong", 0) or 0),
            "business_match_count": int(refresh.get("business", 0) or 0),
            "point_query_count": int(refresh.get("point_queries", 0) or 0),
            "broad_query_count": int(refresh.get("broad_queries", 0) or 0),
            "message": str(refresh.get("message") or ""),
        }
    )
    source_status["google_places"] = target


def discover_industries(user: AuthUser, payload: dict[str, Any]) -> dict[str, Any]:
    route = _normalize_route(payload)
    radius = _finite(payload.get("radius_m"))
    radius_m = min(3000.0, max(50.0, radius if radius is not None else 250.0))
    river_radius = _finite(payload.get("river_radius_m"))
    river_radius_m = min(1500.0, max(25.0, river_radius if river_radius is not None else 250.0))
    industry_bbox = _route_bbox(route, radius_m)
    # River geometry must extend far enough to measure candidate-to-river distance at the search edge.
    river_bbox = _route_bbox(route, radius_m + river_radius_m)
    include_osm = bool(payload.get("include_osm", True))

    source_status = _source_status_base()
    discovered: list[dict[str, Any]] = []
    kiadb_items: list[dict[str, Any]] = []

    try:
        kiadb_items, kiadb_message = _discover_kiadb(industry_bbox)
        discovered.extend(kiadb_items)
        source_status["kiadb"].update(
            {"attempted": True, "ok": True, "count": len(kiadb_items), "message": kiadb_message}
        )
    except Exception as exc:
        source_status["kiadb"].update(
            {"attempted": True, "ok": False, "count": 0, "message": f"KIADB query failed: {exc}"}
        )

    if include_osm:
        video_name = str(payload.get("video_name") or "")
        srt_name = str(payload.get("srt_name") or "")
        cached_osm_items = _load_cached_osm_items(
            user, route, radius_m, video_name=video_name, srt_name=srt_name
        )
        if cached_osm_items:
            if not kiadb_items:
                cached_osm_items, kiadb_candidate_refresh = _try_enrich_kiadb_context_identities(cached_osm_items)
                _apply_kiadb_candidate_status(source_status, kiadb_candidate_refresh)
            cached_osm_items, identity_refresh = _try_enrich_osm_context_identities(cached_osm_items, industry_bbox)
            cached_osm_items, places_refresh = _try_enrich_google_places_context_identities(cached_osm_items, industry_bbox)
            _apply_places_status(source_status, places_refresh)
            discovered.extend(cached_osm_items)
            source_status["openstreetmap"].update(
                {
                    "attempted": True,
                    "ok": True,
                    "count": len(cached_osm_items),
                    "cache_used": True,
                    "cache_count": len(cached_osm_items),
                    "retrieval_mode": "LOCAL_DISCOVERY_CACHE",
                    "identity_refresh_attempted": identity_refresh.get("attempted", False),
                    "identity_refresh_ok": identity_refresh.get("ok", False),
                    "identity_anchor_count": identity_refresh.get("anchors", 0),
                    "identity_enriched_count": identity_refresh.get("enriched", 0),
                    "identity_exact_count": identity_refresh.get("exact", 0),
                    "identity_nearby_count": identity_refresh.get("nearby", 0),
                    "identity_refresh_message": identity_refresh.get("message", ""),
                    "message": (
                        f"Recovered {len(cached_osm_items)} spatially revalidated OSM candidate(s) from local discovery history. "
                        f"OSM identity refresh resolved {identity_refresh.get('enriched', 0)} name(s) from {identity_refresh.get('anchors', 0)} mapped feature(s); "
                        f"Google Places resolved {places_refresh.get('enriched', 0)} additional name(s)."
                    ),
                }
            )
        else:
            overpass_error = ""
            try:
                osm_items = _discover_osm(industry_bbox)
                if not kiadb_items:
                    osm_items, kiadb_candidate_refresh = _try_enrich_kiadb_context_identities(osm_items)
                    _apply_kiadb_candidate_status(source_status, kiadb_candidate_refresh)
                osm_items, identity_refresh = _try_enrich_osm_context_identities(osm_items, industry_bbox)
                osm_items, places_refresh = _try_enrich_google_places_context_identities(osm_items, industry_bbox)
                _apply_places_status(source_status, places_refresh)
                discovered.extend(osm_items)
                source_status["openstreetmap"].update(
                    {
                        "attempted": True,
                        "ok": True,
                        "count": len(osm_items),
                        "cache_used": False,
                        "cache_count": 0,
                        "retrieval_mode": "OVERPASS",
                        "identity_refresh_attempted": identity_refresh.get("attempted", False),
                        "identity_refresh_ok": identity_refresh.get("ok", False),
                        "identity_anchor_count": identity_refresh.get("anchors", 0),
                        "identity_enriched_count": identity_refresh.get("enriched", 0),
                        "identity_exact_count": identity_refresh.get("exact", 0),
                        "identity_nearby_count": identity_refresh.get("nearby", 0),
                        "identity_refresh_message": identity_refresh.get("message", ""),
                        "message": (
                            "Industrial-feature Overpass query completed; "
                            f"OSM identity refresh resolved {identity_refresh.get('enriched', 0)} context candidate name(s); "
                            f"Google Places resolved {places_refresh.get('enriched', 0)} additional name(s)."
                        ),
                    }
                )
            except Exception as exc:
                overpass_error = str(exc)
                osm_items = []
            if not osm_items and OSM_MAP_API_ENABLED:
                try:
                    map_items = _discover_osm_map_api(industry_bbox)
                    if map_items:
                        if not kiadb_items:
                            map_items, kiadb_candidate_refresh = _try_enrich_kiadb_context_identities(map_items)
                            _apply_kiadb_candidate_status(source_status, kiadb_candidate_refresh)
                        map_items, identity_refresh = _try_enrich_osm_context_identities(map_items, industry_bbox)
                        map_items, places_refresh = _try_enrich_google_places_context_identities(map_items, industry_bbox)
                        _apply_places_status(source_status, places_refresh)
                        discovered.extend(map_items)
                        source_status["openstreetmap"].update(
                            {
                                "attempted": True,
                                "ok": True,
                                "count": len(map_items),
                                "cache_used": False,
                                "cache_count": 0,
                                "retrieval_mode": "OSM_MAP_API",
                                "identity_refresh_attempted": identity_refresh.get("attempted", False),
                                "identity_refresh_ok": identity_refresh.get("ok", False),
                                "identity_anchor_count": identity_refresh.get("anchors", 0),
                                "identity_enriched_count": identity_refresh.get("enriched", 0),
                                "identity_exact_count": identity_refresh.get("exact", 0),
                                "identity_nearby_count": identity_refresh.get("nearby", 0),
                                "identity_refresh_message": identity_refresh.get("message", ""),
                                "message": (
                                    f"Direct OpenStreetMap map API fallback loaded {len(map_items)} industrial feature(s); "
                                    f"OSM identity refresh resolved {identity_refresh.get('enriched', 0)} name(s); "
                                    f"Google Places resolved {places_refresh.get('enriched', 0)} additional name(s)"
                                    + (f" after Overpass failed: {overpass_error}" if overpass_error else ".")
                                ),
                            }
                        )
                    elif overpass_error:
                        source_status["openstreetmap"].update(
                            {
                                "attempted": True,
                                "ok": False,
                                "count": 0,
                                "cache_used": False,
                                "cache_count": 0,
                                "retrieval_mode": "NONE",
                                "message": f"Overpass failed and direct OSM map API returned no industry: {overpass_error}",
                            }
                        )
                except Exception as map_exc:
                    source_status["openstreetmap"].update(
                        {
                            "attempted": True,
                            "ok": False,
                            "count": 0,
                            "cache_used": False,
                            "cache_count": 0,
                            "retrieval_mode": "NONE",
                            "message": (
                                f"Overpass failed: {overpass_error or 'no candidates'}; "
                                f"direct OSM map API fallback failed: {map_exc}"
                            ),
                        }
                    )
    else:
        source_status["openstreetmap"].update(
            {"attempted": False, "ok": False, "count": 0, "message": "Disabled for this request"}
        )

    river_lines, river_context = _discover_river_context(
        river_bbox, include_osm=include_osm, river_radius_m=river_radius_m
    )
    source_status["river"].update(
        {
            "attempted": True,
            "ok": bool(river_context.get("available")),
            "count": int(river_context.get("feature_count") or 0),
            "message": str(river_context.get("message") or ""),
            "source": str(river_context.get("source") or "NONE"),
        }
    )

    candidates: list[dict[str, Any]] = []
    raw_route_candidates = 0
    details_attempted = 0
    details_enriched = 0
    ordered_discovered = sorted(
        _dedupe(discovered),
        key=lambda item: (
            0 if item.get("source") == "KIADB" else 1,
            _nearest_route(item, route)[0],
        ),
    )
    for item in ordered_discovered:
        route_distance, _, _ = _nearest_route(item, route)
        if route_distance <= radius_m:
            raw_route_candidates += 1
            metadata = item.get("metadata") if isinstance(item.get("metadata"), dict) else {}
            if (
                item.get("source") == "KIADB"
                and not _clean_text(metadata.get("allottee"))
                and (_clean_text(metadata.get("kiadb_plot_code")) or _clean_text(item.get("source_id")))
                and KIADB_PLOT_DETAILS_URL
                and KIADB_PLOT_DETAILS_BODY_TEMPLATE
                and details_attempted < max(0, MAX_KIADB_DETAIL_REQUESTS)
            ):
                details_attempted += 1
                try:
                    enriched = _enrich_kiadb_item_details(item)
                    if _clean_text((enriched.get("metadata") or {}).get("allottee")):
                        details_enriched += 1
                    item = enriched
                except Exception as exc:
                    source_status["kiadb"]["details_last_error"] = str(exc)
        serialized = _serialize_candidate(item, route, radius_m, river_lines, river_radius_m)
        if serialized:
            candidates.append(serialized)
    source_status["kiadb"]["details_attempted"] = details_attempted
    source_status["kiadb"]["details_enriched"] = details_enriched

    candidates.sort(
        key=lambda item: (
            0 if item["source"] == "KIADB" else 1,
            0 if item["river_relevance"] == "HIGH" else (1 if item["river_relevance"] == "MEDIUM" else 2),
            item["river_distance_m"] if item["river_distance_m"] is not None else 1e12,
            item["distance_from_route_m"],
            item["name"].lower(),
        )
    )

    run_id = _public("INDRUN")
    result = {
        "run_id": run_id,
        "version": "V29.6.11",
        "generated_at": _now(),
        "video_name": str(payload.get("video_name") or ""),
        "srt_name": str(payload.get("srt_name") or ""),
        "radius_m": radius_m,
        "river_radius_m": river_radius_m,
        "sample_count": len(route),
        "route_bbox": {
            "south": industry_bbox[0],
            "west": industry_bbox[1],
            "north": industry_bbox[2],
            "east": industry_bbox[3],
        },
        "river_bbox": {
            "south": river_bbox[0],
            "west": river_bbox[1],
            "north": river_bbox[2],
            "east": river_bbox[3],
        },
        "river_context": river_context,
        "sources": source_status,
        "counts": {
            "route_candidates_before_river_filter": raw_route_candidates,
            "total": len(candidates),
            "kiadb": sum(1 for item in candidates if item["source"] == "KIADB"),
            "openstreetmap": sum(1 for item in candidates if item["source"] == "OPENSTREETMAP"),
            "kiadb_identity_resolved": sum(1 for item in candidates if item.get("identity_status") in {"OFFICIAL_KIADB_ALLOTTEE", "OFFICIAL_KIADB_COMPANY", "NEARBY_KIADB_PLOT_MATCH"}),
            "river_high": sum(1 for item in candidates if item["river_relevance"] == "HIGH"),
            "river_medium": sum(1 for item in candidates if item["river_relevance"] == "MEDIUM"),
            "within_100m": sum(1 for item in candidates if item["distance_from_route_m"] <= 100),
            "within_250m": sum(1 for item in candidates if item["distance_from_route_m"] <= 250),
            "within_500m": sum(1 for item in candidates if item["distance_from_route_m"] <= 500),
            "within_1km": sum(1 for item in candidates if item["distance_from_route_m"] <= 1000),
        },
        "candidates": candidates[:1000],
        "disclaimer": (
            "A river-side industry is a spatial candidate for review, not a confirmed pollution source. "
            "Discharge attribution requires video/field/laboratory evidence."
        ),
    }
    _save_run(user, result)
    return result


def _safe_json(raw: Any, fallback: Any) -> Any:
    try:
        return json.loads(raw or "")
    except (TypeError, ValueError, json.JSONDecodeError):
        return fallback


def latest_industry_discovery(user: AuthUser) -> dict[str, Any] | None:
    with connect() as db:
        run = db.execute(
            "SELECT * FROM industry_discovery_runs WHERE user_id=? ORDER BY id DESC LIMIT 1",
            (user.id,),
        ).fetchone()
        if not run:
            return None
        rows = db.execute(
            "SELECT * FROM industry_candidates WHERE run_id=? ORDER BY route_distance_m,name LIMIT 1000",
            (run["id"],),
        ).fetchall()

    candidates = []
    row_keys = set(rows[0].keys()) if rows else set()
    for row in rows:
        metadata = _safe_json(row["metadata_json"], {})
        river_distance = row["river_distance_m"] if "river_distance_m" in row_keys else None
        candidates.append(
            {
                "id": row["candidate_key"],
                "name": _clean_text(metadata.get("resolved_industry_name")) or row["name"],
                "display_name": _clean_text(metadata.get("resolved_industry_name")) or row["name"],
                "identity_source": _clean_text(metadata.get("identity_source")),
                "identity_status": _clean_text(metadata.get("identity_status")),
                "kiadb_plot_no": _clean_text(metadata.get("kiadb_plot_no")),
                "industrial_area": _clean_text(metadata.get("industrial_area")),
                "nature_of_industry": _clean_text(metadata.get("nature_of_industry")),
                "plot_status": _clean_text(metadata.get("plot_status")),
                "source": row["source"],
                "source_id": row["source_id"],
                "category": row["category"],
                "lat": row["lat"],
                "lng": row["lng"],
                "address": row["address"],
                "distance_from_route_m": row["route_distance_m"],
                "river_distance_m": river_distance,
                "nearest_river_name": row["nearest_river_name"] if "nearest_river_name" in row_keys else "",
                "river_source": row["river_source"] if "river_source" in row_keys else "",
                "river_relevance": row["river_relevance"] if "river_relevance" in row_keys else "RIVER_DATA_UNAVAILABLE",
                "nearest_video_time_s": row["nearest_video_time_s"],
                "nearest_video_time": _time_label(row["nearest_video_time_s"]),
                "nearest_track_index": row["nearest_track_index"],
                "nearest_track_lat": row["nearest_track_lat"],
                "nearest_track_lng": row["nearest_track_lng"],
                "verification_status": row["verification_status"],
                "metadata": metadata,
            }
        )

    run_keys = set(run.keys())
    sources = _safe_json(run["source_status_json"], {})
    bbox = _safe_json(run["route_bbox_json"], {})
    river_context = _safe_json(run["river_context_json"], {}) if "river_context_json" in run_keys else {}
    if not isinstance(river_context, dict) or not river_context:
        river_context = {
            "available": False,
            "source": "NONE",
            "feature_count": 0,
            "filter_distance_m": float(run["river_radius_m"] if "river_radius_m" in run_keys else 250.0),
            "message": "This saved discovery run predates the V29.4 river-context layer. Refresh discovery.",
            "geojson": {"type": "FeatureCollection", "features": []},
        }
    river_radius_m = float(run["river_radius_m"] if "river_radius_m" in run_keys else 250.0)
    return {
        "run_id": run["public_id"],
        "version": "V29.6.8",
        "generated_at": run["created_at"],
        "video_name": run["video_name"],
        "srt_name": run["srt_name"],
        "radius_m": run["radius_m"],
        "river_radius_m": river_radius_m,
        "sample_count": run["sample_count"],
        "route_bbox": bbox,
        "river_context": river_context,
        "sources": sources,
        "counts": {
            "total": len(candidates),
            "kiadb": sum(1 for item in candidates if item["source"] == "KIADB"),
            "openstreetmap": sum(1 for item in candidates if item["source"] == "OPENSTREETMAP"),
            "river_high": sum(1 for item in candidates if item.get("river_relevance") == "HIGH"),
            "river_medium": sum(1 for item in candidates if item.get("river_relevance") == "MEDIUM"),
            "within_100m": sum(1 for item in candidates if item["distance_from_route_m"] <= 100),
            "within_250m": sum(1 for item in candidates if item["distance_from_route_m"] <= 250),
            "within_500m": sum(1 for item in candidates if item["distance_from_route_m"] <= 500),
            "within_1km": sum(1 for item in candidates if item["distance_from_route_m"] <= 1000),
        },
        "candidates": candidates,
        "disclaimer": (
            "A river-side industry is a spatial candidate for review, not a confirmed pollution source. "
            "Discharge attribution requires video/field/laboratory evidence."
        ),
    }

# === ARKAVATHI V29.6.13 DYNAMIC ROUTE + NO-KEY OSM IDENTITY ===
# Installed as a late-bound wrapper so existing V29.6.11 detection, KIADB,
# database, frontend contracts and tests stay intact.
try:
    from app.route_identity import route_signature as _v29613_route_signature
    from app.osm_industry_name_resolver import resolve_unresolved_osm_items as _v29613_resolve_osm_names
except Exception as _v29613_import_error:
    _v29613_route_signature = None
    _v29613_resolve_osm_names = None
else:
    _v29613_base_osm_enrich = _try_enrich_osm_context_identities

    def _try_enrich_osm_context_identities(items, bbox):
        base_items, base_stats = _v29613_base_osm_enrich(items, bbox)
        if _v29613_resolve_osm_names is None:
            return base_items, base_stats
        resolved_items, extra = _v29613_resolve_osm_names(base_items)
        merged = dict(base_stats or {})
        for key in ("anchors", "enriched", "exact", "nearby"):
            merged[key] = int(merged.get(key, 0) or 0) + int(extra.get(key, 0) or 0)
        merged["geometry_queries"] = int(extra.get("queries", 0) or 0)
        merged["geometry_failures"] = int(extra.get("failures", 0) or 0)
        base_message = str(merged.get("message") or "").strip()
        extra_message = str(extra.get("message") or "").strip()
        merged["message"] = " ".join(x for x in (base_message, extra_message) if x)
        if extra.get("attempted"):
            merged["attempted"] = True
        if extra.get("failures"):
            # Preserve results even if one public OSM request failed.
            merged["ok"] = bool(merged.get("ok", True))
        return resolved_items, merged

    _v29613_base_discover_industries = discover_industries

    def discover_industries(user, payload):
        working_payload = dict(payload or {})
        signature = None
        try:
            signature = _v29613_route_signature(_normalize_route(working_payload)) if _v29613_route_signature else None
            if signature:
                working_payload["route_id"] = signature.get("route_id")
        except Exception:
            signature = None
        result = _v29613_base_discover_industries(user, working_payload)
        if isinstance(result, dict) and signature:
            result["route_id"] = signature.get("route_id")
            result["route_signature"] = signature
            for candidate in result.get("candidates") or []:
                if not isinstance(candidate, dict):
                    continue
                meta = candidate.get("metadata") if isinstance(candidate.get("metadata"), dict) else {}
                meta = dict(meta)
                meta["route_id"] = signature.get("route_id")
                candidate["metadata"] = meta
        return result
# === ARKAVATHI V29.6.16 KSRSAC INDUSTRY REGISTRY FALLBACK ===
# OSM remains the industrial-geometry detector. This late-bound wrapper adds
# public KSRSAC/OpenCity industry-name matching only for still-unresolved items.
try:
    from app.ksrsac_industry_registry import resolve_unresolved_industries as _v29616_resolve_registry
except Exception as _v29616_registry_import_error:
    _v29616_resolve_registry = None
else:
    _v29616_base_osm_enrich = _try_enrich_osm_context_identities

    def _try_enrich_osm_context_identities(items, bbox):
        base_items, base_stats = _v29616_base_osm_enrich(items, bbox)
        if _v29616_resolve_registry is None:
            return base_items, base_stats
        resolved_items, registry_stats = _v29616_resolve_registry(base_items)
        merged = dict(base_stats or {})
        enriched = int(registry_stats.get("enriched", 0) or 0)
        merged["enriched"] = int(merged.get("enriched", 0) or 0) + enriched
        merged["nearby"] = int(merged.get("nearby", 0) or 0) + int(registry_stats.get("nearby", 0) or 0)
        merged["ksrsac_registry_records"] = int(registry_stats.get("records", 0) or 0)
        merged["ksrsac_registry_enriched"] = enriched
        merged["ksrsac_registry_ambiguous"] = int(registry_stats.get("ambiguous", 0) or 0)
        base_message = str(merged.get("message") or "").strip()
        registry_message = str(registry_stats.get("message") or "").strip()
        merged["message"] = " ".join(x for x in (base_message, registry_message) if x)
        if registry_stats.get("attempted"):
            merged["attempted"] = True
        return resolved_items, merged

