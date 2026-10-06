"""Arkavathi V29.6.16 KSRSAC industry-name registry fallback.

Purpose
-------
OSM can correctly map a feature as building=industrial / landuse=industrial
without storing the occupant/company name. This resolver keeps OSM as the
geometry detector, but names still-unresolved candidates from the public
KSRSAC-sourced "Karnataka Industries Locations Map" KML published through
OpenCity.

No API key is required. The public KML is cached locally under backend/runtime.
A name is applied only when a registry point is spatially close and the match is
not ambiguous. Existing KIADB/OSM verified identities are never overwritten.
"""
from __future__ import annotations

import html
import json
import math
import os
import re
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path
from threading import Lock
from typing import Any

USER_AGENT = "ArkavathiIndustryResolver/29.6.16 (Nakshatech river survey)"
HTTP_TIMEOUT = float(os.environ.get("ARKAVATHI_KSRSAC_HTTP_TIMEOUT", "8"))
MATCH_RADIUS_M = float(os.environ.get("ARKAVATHI_KSRSAC_MATCH_RADIUS_M", "125"))
VERY_CLOSE_M = float(os.environ.get("ARKAVATHI_KSRSAC_VERY_CLOSE_M", "45"))
AMBIGUITY_GAP_M = float(os.environ.get("ARKAVATHI_KSRSAC_AMBIGUITY_GAP_M", "45"))
CACHE_MAX_AGE_S = float(os.environ.get("ARKAVATHI_KSRSAC_CACHE_MAX_AGE_S", str(30 * 24 * 3600)))
ENABLED = str(os.environ.get("ARKAVATHI_KSRSAC_REGISTRY_ENABLED", "1")).strip().lower() not in {"0", "false", "no", "off"}

PACKAGE_SLUG = "karnataka-and-bengaluru-urban-seiaa-maps"
PACKAGE_APIS = (
    f"https://www.data.opencity.in/api/3/action/package_show?id={PACKAGE_SLUG}",
    f"https://data.opencity.in/api/3/action/package_show?id={PACKAGE_SLUG}",
)
# Fallback URLs are retained for compatibility with older OpenCity resource snapshots.
FALLBACK_KML_URLS = (
    "https://data.opencity.in/dataset/18686a41-bf2f-43cb-b6ff-66c087a15407/resource/80fba1db-49d3-48ae-9c32-ceb28f11da56/download/karnataka_industries.kml",
)

BACKEND_DIR = Path(__file__).resolve().parent.parent
RUNTIME_DIR = BACKEND_DIR / "runtime"
CACHE_KML = RUNTIME_DIR / "ksrsac_karnataka_industries.kml"
CACHE_META = RUNTIME_DIR / "ksrsac_karnataka_industries.meta.json"

_LOCK = Lock()
_REGISTRY_CACHE: list[dict[str, Any]] | None = None
_REGISTRY_MESSAGE = ""


def _clean(value: Any) -> str:
    return str(value or "").strip()


def _finite(value: Any) -> float | None:
    try:
        v = float(value)
    except (TypeError, ValueError):
        return None
    return v if math.isfinite(v) else None


def _norm_key(value: Any) -> str:
    return re.sub(r"[^a-z0-9]+", "", _clean(value).lower())


def _generic_name(value: str) -> bool:
    key = _norm_key(value)
    return key in {
        "", "industry", "industries", "industrial", "industrialarea", "industrialestate",
        "factory", "plant", "unit", "company", "project", "industrylocation", "industrylocations",
    }


def _is_existing_identity(item: dict[str, Any]) -> bool:
    meta = item.get("metadata") if isinstance(item.get("metadata"), dict) else {}
    resolved = _clean(meta.get("resolved_industry_name"))
    status = _clean(meta.get("identity_status")).upper()
    if resolved:
        return True
    return status in {
        "NAMED_OSM_INDUSTRY",
        "OFFICIAL_KIADB_ALLOTTEE",
        "OFFICIAL_KIADB_COMPANY",
        "NEARBY_KIADB_PLOT_MATCH",
        "KSRSAC_INDUSTRY_REGISTRY_MATCH",
    }


def _http_get(url: str, *, accept: str = "*/*") -> bytes:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": USER_AGENT, "Accept": accept},
        method="GET",
    )
    with urllib.request.urlopen(req, timeout=max(2.0, HTTP_TIMEOUT)) as resp:
        return resp.read()


def _resource_url_from_ckan() -> tuple[str | None, str]:
    errors: list[str] = []
    for api in PACKAGE_APIS:
        try:
            raw = _http_get(api, accept="application/json")
            payload = json.loads(raw.decode("utf-8", errors="replace"))
            result = payload.get("result") if isinstance(payload, dict) else None
            resources = result.get("resources") if isinstance(result, dict) else None
            if not isinstance(resources, list):
                raise ValueError("CKAN result has no resources list")
            choices: list[tuple[int, str, str]] = []
            for resource in resources:
                if not isinstance(resource, dict):
                    continue
                name = _clean(resource.get("name") or resource.get("title"))
                fmt = _clean(resource.get("format")).upper()
                mime = _clean(resource.get("mimetype")).lower()
                url = _clean(resource.get("url"))
                if not url:
                    continue
                score = 0
                low = name.lower()
                if "karnataka industries" in low and "mining" not in low:
                    score += 100
                if "industries locations map" in low:
                    score += 60
                if fmt == "KML" or "kml" in mime or url.lower().endswith(".kml"):
                    score += 40
                if "mining" in low or "construction" in low:
                    score -= 80
                choices.append((score, url, name))
            choices.sort(reverse=True, key=lambda row: row[0])
            if choices and choices[0][0] >= 100:
                return choices[0][1], f"CKAN resource: {choices[0][2] or 'Karnataka Industries Locations Map'}"
            raise ValueError("Karnataka Industries KML resource not found")
        except Exception as exc:
            errors.append(f"{type(exc).__name__}: {exc}")
    return None, " | ".join(errors[-2:])


def _cache_is_fresh() -> bool:
    try:
        return CACHE_KML.is_file() and CACHE_KML.stat().st_size > 512 and (time.time() - CACHE_KML.stat().st_mtime) <= CACHE_MAX_AGE_S
    except OSError:
        return False


def _obtain_kml() -> tuple[bytes | None, str]:
    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
    if _cache_is_fresh():
        try:
            return CACHE_KML.read_bytes(), "local cached KSRSAC/OpenCity KML"
        except OSError:
            pass

    urls: list[tuple[str, str]] = []
    resolved_url, resolved_note = _resource_url_from_ckan()
    if resolved_url:
        urls.append((resolved_url, resolved_note))
    urls.extend((url, "OpenCity fallback KML URL") for url in FALLBACK_KML_URLS)

    errors: list[str] = []
    for url, note in urls:
        try:
            raw = _http_get(url, accept="application/vnd.google-earth.kml+xml,application/xml,text/xml,*/*")
            if len(raw) < 512 or b"<kml" not in raw[:5000].lower():
                raise ValueError("response is not a KML document")
            tmp = CACHE_KML.with_suffix(".tmp")
            tmp.write_bytes(raw)
            tmp.replace(CACHE_KML)
            try:
                CACHE_META.write_text(
                    json.dumps({"source_url": url, "downloaded_at": time.time(), "note": note}, indent=2),
                    encoding="utf-8",
                )
            except OSError:
                pass
            return raw, note
        except Exception as exc:
            errors.append(f"{url}: {type(exc).__name__}: {exc}")

    # A stale cache is better than no registry when the public portal is temporarily unavailable.
    if CACHE_KML.is_file():
        try:
            raw = CACHE_KML.read_bytes()
            if len(raw) > 512:
                return raw, "stale local KSRSAC/OpenCity KML cache"
        except OSError:
            pass
    return None, "KSRSAC/OpenCity registry unavailable: " + " | ".join(errors[-3:])


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1] if "}" in tag else tag


def _child_text(elem: ET.Element, local_name: str) -> str:
    for child in list(elem):
        if _local(child.tag) == local_name:
            return _clean(child.text)
    return ""


def _description_fields(text: str) -> dict[str, str]:
    if not text:
        return {}
    decoded = html.unescape(text)
    fields: dict[str, str] = {}
    # Common Google Earth / ArcGIS HTML table pattern.
    pairs = re.findall(
        r"<t[dh][^>]*>\s*(.*?)\s*</t[dh]>\s*<t[dh][^>]*>\s*(.*?)\s*</t[dh]>",
        decoded,
        flags=re.I | re.S,
    )
    for key, value in pairs:
        k = re.sub(r"<[^>]+>", " ", key)
        v = re.sub(r"<[^>]+>", " ", value)
        k = re.sub(r"\s+", " ", html.unescape(k)).strip()
        v = re.sub(r"\s+", " ", html.unescape(v)).strip()
        if k and v:
            fields[k] = v
    return fields


def _extended_fields(pm: ET.Element) -> dict[str, str]:
    fields: dict[str, str] = {}
    for elem in pm.iter():
        lname = _local(elem.tag)
        if lname == "Data":
            key = _clean(elem.attrib.get("name"))
            value = ""
            for child in elem.iter():
                if _local(child.tag) == "value":
                    value = _clean(child.text)
                    break
            if key and value:
                fields[key] = value
        elif lname == "SimpleData":
            key = _clean(elem.attrib.get("name"))
            value = _clean(elem.text)
            if key and value:
                fields[key] = value
    desc = ""
    for elem in pm.iter():
        if _local(elem.tag) == "description":
            desc = _clean(elem.text)
            break
    fields.update({k: v for k, v in _description_fields(desc).items() if k not in fields})
    return fields


def _pick_name(placemark_name: str, fields: dict[str, str]) -> str:
    # Prefer explicit industry/company fields over a numeric/default placemark label.
    priorities = (
        "industryname", "nameofindustry", "nameoftheindustry", "industry", "unitname",
        "companyname", "company", "establishmentname", "projectname", "project", "firmname",
        "organisationname", "organizationname", "name",
    )
    normalized = {_norm_key(k): _clean(v) for k, v in fields.items() if _clean(v)}
    for key in priorities:
        value = normalized.get(key, "")
        if value and not _generic_name(value) and not value.isdigit():
            return value
    value = _clean(placemark_name)
    if value and not _generic_name(value) and not value.isdigit():
        return value
    return ""


def _coords_from_placemark(pm: ET.Element) -> tuple[float, float] | None:
    coords_texts: list[str] = []
    point_texts: list[str] = []
    in_point = False
    # First prefer Point coordinates.
    for elem in pm.iter():
        lname = _local(elem.tag)
        if lname == "Point":
            for child in elem.iter():
                if _local(child.tag) == "coordinates" and _clean(child.text):
                    point_texts.append(_clean(child.text))
        elif lname == "coordinates" and _clean(elem.text):
            coords_texts.append(_clean(elem.text))
    texts = point_texts or coords_texts
    parsed: list[tuple[float, float]] = []
    for text in texts:
        for token in re.split(r"\s+", text.strip()):
            parts = token.split(",")
            if len(parts) < 2:
                continue
            lng, lat = _finite(parts[0]), _finite(parts[1])
            if lat is not None and lng is not None and -90 <= lat <= 90 and -180 <= lng <= 180:
                parsed.append((lat, lng))
    if not parsed:
        return None
    return sum(p[0] for p in parsed) / len(parsed), sum(p[1] for p in parsed) / len(parsed)


def _parse_registry(raw: bytes) -> list[dict[str, Any]]:
    root = ET.fromstring(raw)
    records: list[dict[str, Any]] = []
    for pm in root.iter():
        if _local(pm.tag) != "Placemark":
            continue
        fields = _extended_fields(pm)
        name = _pick_name(_child_text(pm, "name"), fields)
        coords = _coords_from_placemark(pm)
        if not name or coords is None:
            continue
        lat, lng = coords
        records.append({"name": name, "lat": lat, "lng": lng, "fields": fields})

    # Coordinate/name dedupe.
    deduped: list[dict[str, Any]] = []
    seen: set[tuple[str, int, int]] = set()
    for row in records:
        key = (_norm_key(row["name"]), round(float(row["lat"]) * 1e6), round(float(row["lng"]) * 1e6))
        if key in seen:
            continue
        seen.add(key)
        deduped.append(row)
    return deduped


def _load_registry() -> tuple[list[dict[str, Any]], str]:
    global _REGISTRY_CACHE, _REGISTRY_MESSAGE
    if _REGISTRY_CACHE is not None:
        return _REGISTRY_CACHE, _REGISTRY_MESSAGE
    with _LOCK:
        if _REGISTRY_CACHE is not None:
            return _REGISTRY_CACHE, _REGISTRY_MESSAGE
        if not ENABLED:
            _REGISTRY_CACHE = []
            _REGISTRY_MESSAGE = "KSRSAC/OpenCity registry disabled by configuration."
            return _REGISTRY_CACHE, _REGISTRY_MESSAGE
        raw, message = _obtain_kml()
        if raw is None:
            _REGISTRY_CACHE = []
            _REGISTRY_MESSAGE = message
            return _REGISTRY_CACHE, _REGISTRY_MESSAGE
        try:
            rows = _parse_registry(raw)
            _REGISTRY_CACHE = rows
            _REGISTRY_MESSAGE = f"Loaded {len(rows)} named KSRSAC/OpenCity industry record(s) from {message}."
        except Exception as exc:
            _REGISTRY_CACHE = []
            _REGISTRY_MESSAGE = f"KSRSAC/OpenCity KML parse failed: {type(exc).__name__}: {exc}"
        return _REGISTRY_CACHE, _REGISTRY_MESSAGE


def _distance_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371008.8
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.atan2(math.sqrt(a), math.sqrt(max(0.0, 1 - a)))


def _apply(item: dict[str, Any], record: dict[str, Any], distance: float) -> dict[str, Any]:
    updated = dict(item)
    meta = dict(item.get("metadata") if isinstance(item.get("metadata"), dict) else {})
    name = _clean(record.get("name"))
    meta.update({
        "resolved_industry_name": name,
        "company_name": name,
        "company_name_source": "KSRSAC_KARNATAKA_INDUSTRIES_KML",
        "identity_source": "KSRSAC_INDUSTRY_REGISTRY",
        "identity_status": "KSRSAC_INDUSTRY_REGISTRY_MATCH",
        "identity_confidence": "GOVERNMENT_OPEN_DATA_SPATIAL_MATCH",
        "identity_match_method": "NEAREST_KSRSAC_INDUSTRY_POINT",
        "identity_match_distance_m": round(float(distance), 2),
        "ksrsac_registry_fields": record.get("fields") if isinstance(record.get("fields"), dict) else {},
        "identity_note": (
            "Company/industry name resolved from the public KSRSAC-sourced Karnataka Industries "
            "Locations Map using a strict spatial match to an already-detected industrial feature."
        ),
    })
    updated["metadata"] = meta
    updated["name"] = name
    return updated


def resolve_unresolved_industries(items: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    rows, load_message = _load_registry()
    stats: dict[str, Any] = {
        "attempted": bool(ENABLED),
        "ok": bool(rows),
        "records": len(rows),
        "enriched": 0,
        "nearby": 0,
        "ambiguous": 0,
        "message": load_message,
    }
    if not rows:
        return list(items), stats

    out: list[dict[str, Any]] = []
    for item in items:
        if _is_existing_identity(item):
            out.append(item)
            continue
        lat = _finite(item.get("lat"))
        lng = _finite(item.get("lng"))
        if lat is None or lng is None:
            out.append(item)
            continue

        ranked: list[tuple[float, dict[str, Any]]] = []
        for row in rows:
            d = _distance_m(lat, lng, float(row["lat"]), float(row["lng"]))
            if d <= MATCH_RADIUS_M:
                ranked.append((d, row))
        ranked.sort(key=lambda pair: (pair[0], _clean(pair[1].get("name"))))
        if not ranked:
            out.append(item)
            continue

        first_d, first = ranked[0]
        accept = first_d <= VERY_CLOSE_M
        if not accept and len(ranked) == 1:
            accept = True
        elif not accept and len(ranked) >= 2:
            second_d, second = ranked[1]
            if _norm_key(first.get("name")) == _norm_key(second.get("name")):
                accept = True
            elif (second_d - first_d) >= AMBIGUITY_GAP_M and second_d >= first_d * 1.45:
                accept = True
            else:
                stats["ambiguous"] += 1

        if accept:
            out.append(_apply(item, first, first_d))
            stats["enriched"] += 1
            stats["nearby"] += 1
        else:
            out.append(item)

    stats["message"] = (
        f"{load_message} KSRSAC registry matched {stats['enriched']} unresolved industrial candidate(s) "
        f"within {MATCH_RADIUS_M:.0f} m; ambiguous={stats['ambiguous']}."
    )
    return out, stats


# Test/diagnostic helpers intentionally public to the installer.
def parse_kml_bytes(raw: bytes) -> list[dict[str, Any]]:
    return _parse_registry(raw)


def registry_status() -> dict[str, Any]:
    rows, message = _load_registry()
    return {"enabled": ENABLED, "records": len(rows), "message": message, "cache": str(CACHE_KML)}
