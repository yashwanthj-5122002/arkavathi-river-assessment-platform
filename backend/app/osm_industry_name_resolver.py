"""Arkavathi V29.6.15 no-key OSM industry identity resolver.

Resolves names for already-detected OSM industrial candidates using only public
OpenStreetMap data. It never changes detection and never invents names.

Resolution order:
  1. name/operator/brand/company on the same OSM way;
  2. named parent OSM relation containing the way;
  3. named industrial/company POI inside the candidate polygon;
  4. candidate polygon contained by a named industrial/company area/campus;
  5. strongly industrial named feature immediately adjacent to the polygon.

Transport routes/roads/rail/aeroway features are rejected. Generic retail POIs
are not used merely because they are nearby.
"""
from __future__ import annotations

import math
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from functools import lru_cache
from typing import Any

OSM_API = "https://api.openstreetmap.org/api/0.6"
USER_AGENT = "ArkavathiIndustryResolver/29.6.15 (Nakshatech river survey)"
HTTP_TIMEOUT = 15.0
MAX_CANDIDATE_QUERIES = 20
MAP_PAD_M = 320.0
STRONG_NEARBY_M = 90.0
AREA_NEARBY_M = 40.0
BUSINESS_INSIDE_ONLY = True


def _clean(value: Any) -> str:
    return str(value or "").strip()


def _finite(value: Any) -> float | None:
    try:
        v = float(value)
    except (TypeError, ValueError):
        return None
    return v if math.isfinite(v) else None


def _tags(elem: ET.Element) -> dict[str, str]:
    return {str(t.attrib.get("k") or ""): str(t.attrib.get("v") or "") for t in elem.findall("tag")}


def _name(tags: dict[str, str]) -> str:
    for key in ("name", "official_name", "operator", "brand", "company", "contact:name", "short_name"):
        value = _clean(tags.get(key))
        if value:
            return value
    return ""


def _reject_transport(tags: dict[str, str]) -> bool:
    route = _clean(tags.get("route")).lower()
    typ = _clean(tags.get("type")).lower()
    return bool(
        route
        or typ in {"route", "route_master"}
        or tags.get("public_transport")
        or tags.get("highway")
        or tags.get("railway")
        or tags.get("aeroway")
        or tags.get("boundary") == "administrative"
    )


def _strength(tags: dict[str, str]) -> str:
    if _reject_transport(tags):
        return "REJECT"
    building = _clean(tags.get("building")).lower()
    man_made = _clean(tags.get("man_made")).lower()
    industrial = _clean(tags.get("industrial")).lower()
    office = _clean(tags.get("office")).lower()
    landuse = _clean(tags.get("landuse")).lower()
    craft = _clean(tags.get("craft")).lower()
    power = _clean(tags.get("power")).lower()
    if man_made == "works" or industrial or building in {"industrial", "factory", "manufacture", "manufacturing", "warehouse"}:
        return "STRONG"
    if office in {"company", "manufacturer", "industrial", "factory", "logistics", "engineering"} or craft:
        return "STRONG"
    if landuse == "industrial" or power in {"plant", "generator"}:
        return "AREA"
    # Non-industrial shop/office names are only allowed if spatially inside the
    # industrial candidate polygon; never use them merely because they are near.
    if tags.get("shop") or office or tags.get("operator") or tags.get("brand") or tags.get("company"):
        return "BUSINESS"
    return "REJECT"


def _generic_name(name: str) -> bool:
    return name.lower().strip() in {
        "industrial", "industrial area", "industrial estate", "factory", "works",
        "warehouse", "industrial building", "building", "company", "plant",
    }


def _http_get(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/xml,text/xml,*/*"})
    with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT) as resp:
        return resp.read()


@lru_cache(maxsize=512)
def _get_way_full(way_id: str) -> bytes:
    return _http_get(f"{OSM_API}/way/{urllib.parse.quote(str(way_id))}/full")


@lru_cache(maxsize=512)
def _get_way_relations(way_id: str) -> bytes:
    return _http_get(f"{OSM_API}/way/{urllib.parse.quote(str(way_id))}/relations")


@lru_cache(maxsize=512)
def _get_map_bbox(west: float, south: float, east: float, north: float) -> bytes:
    query = urllib.parse.urlencode({"bbox": f"{west:.7f},{south:.7f},{east:.7f},{north:.7f}"})
    return _http_get(f"{OSM_API}/map?{query}")


def _haversine(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371008.8
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.atan2(math.sqrt(a), math.sqrt(max(0.0, 1 - a)))


def _point_in_polygon(lat: float, lng: float, polygon: list[tuple[float, float]]) -> bool:
    if len(polygon) < 3:
        return False
    inside = False
    j = len(polygon) - 1
    for i in range(len(polygon)):
        yi, xi = polygon[i]
        yj, xj = polygon[j]
        if ((yi > lat) != (yj > lat)):
            x_at_y = (xj - xi) * (lat - yi) / ((yj - yi) or 1e-15) + xi
            if lng < x_at_y:
                inside = not inside
        j = i
    return inside


def _point_segment_distance_m(lat: float, lng: float, a: tuple[float, float], b: tuple[float, float]) -> float:
    lat0 = math.radians(lat)
    kx = 111320.0 * max(0.1, math.cos(lat0))
    ky = 110540.0
    ax, ay = (a[1] - lng) * kx, (a[0] - lat) * ky
    bx, by = (b[1] - lng) * kx, (b[0] - lat) * ky
    vx, vy = bx - ax, by - ay
    denom = vx * vx + vy * vy
    if denom <= 1e-12:
        return math.hypot(ax, ay)
    t = max(0.0, min(1.0, -(ax * vx + ay * vy) / denom))
    px, py = ax + t * vx, ay + t * vy
    return math.hypot(px, py)


def _distance_to_polygon_m(lat: float, lng: float, polygon: list[tuple[float, float]]) -> float:
    if _point_in_polygon(lat, lng, polygon):
        return 0.0
    if len(polygon) < 2:
        return _haversine(lat, lng, polygon[0][0], polygon[0][1]) if polygon else float("inf")
    return min(_point_segment_distance_m(lat, lng, polygon[i], polygon[(i + 1) % len(polygon)]) for i in range(len(polygon)))


def _polygon_distance_m(a: list[tuple[float, float]], b: list[tuple[float, float]]) -> float:
    if not a or not b:
        return float("inf")
    # Containment/overlap tests first.
    if any(_point_in_polygon(lat, lng, b) for lat, lng in a[: min(len(a), 64)]):
        return 0.0
    if any(_point_in_polygon(lat, lng, a) for lat, lng in b[: min(len(b), 64)]):
        return 0.0
    best = float("inf")
    for lat, lng in a[: min(len(a), 128)]:
        best = min(best, _distance_to_polygon_m(lat, lng, b))
    for lat, lng in b[: min(len(b), 128)]:
        best = min(best, _distance_to_polygon_m(lat, lng, a))
    return best


def _polygon_centroid(poly: list[tuple[float, float]]) -> tuple[float, float]:
    if not poly:
        return 0.0, 0.0
    return sum(p[0] for p in poly) / len(poly), sum(p[1] for p in poly) / len(poly)


def _bbox_for_polygon(polygon: list[tuple[float, float]], pad_m: float = MAP_PAD_M) -> tuple[float, float, float, float]:
    lats = [p[0] for p in polygon]
    lngs = [p[1] for p in polygon]
    mid_lat = sum(lats) / len(lats)
    dlat = pad_m / 110540.0
    dlng = pad_m / (111320.0 * max(0.1, math.cos(math.radians(mid_lat))))
    return min(lngs) - dlng, min(lats) - dlat, max(lngs) + dlng, max(lats) + dlat


def _parse_way_full(raw: bytes, wanted_way_id: str) -> tuple[list[tuple[float, float]], dict[str, str]]:
    root = ET.fromstring(raw)
    nodes: dict[str, tuple[float, float]] = {}
    for node in root.findall("node"):
        node_id = _clean(node.attrib.get("id"))
        lat, lng = _finite(node.attrib.get("lat")), _finite(node.attrib.get("lon"))
        if node_id and lat is not None and lng is not None:
            nodes[node_id] = (lat, lng)
    for way in root.findall("way"):
        if _clean(way.attrib.get("id")) != str(wanted_way_id):
            continue
        refs = [_clean(nd.attrib.get("ref")) for nd in way.findall("nd")]
        return [nodes[r] for r in refs if r in nodes], _tags(way)
    return [], {}


def _parent_relation_matches(raw: bytes, source_id: str) -> list[dict[str, Any]]:
    try:
        root = ET.fromstring(raw)
    except Exception:
        return []
    out: list[dict[str, Any]] = []
    for rel in root.findall("relation"):
        tags = _tags(rel)
        name = _name(tags)
        strength = _strength(tags)
        if name and not _generic_name(name) and strength in {"STRONG", "AREA"}:
            rid = _clean(rel.attrib.get("id"))
            out.append({"source_id": f"relation/{rid}", "name": name, "tags": tags, "strength": strength, "geometry": None})
    return out


def _named_features(raw: bytes) -> list[dict[str, Any]]:
    root = ET.fromstring(raw)
    nodes: dict[str, tuple[float, float]] = {}
    node_tags: dict[str, dict[str, str]] = {}
    for node in root.findall("node"):
        node_id = _clean(node.attrib.get("id"))
        lat, lng = _finite(node.attrib.get("lat")), _finite(node.attrib.get("lon"))
        if node_id and lat is not None and lng is not None:
            nodes[node_id] = (lat, lng)
            tags = _tags(node)
            if tags:
                node_tags[node_id] = tags

    ways: dict[str, list[tuple[float, float]]] = {}
    out: list[dict[str, Any]] = []
    for node_id, tags in node_tags.items():
        name, strength = _name(tags), _strength(tags)
        if name and not _generic_name(name) and strength != "REJECT":
            lat, lng = nodes[node_id]
            out.append({"source_id": f"node/{node_id}", "name": name, "lat": lat, "lng": lng, "tags": tags, "strength": strength, "geometry": None})

    for way in root.findall("way"):
        way_id = _clean(way.attrib.get("id"))
        refs = [_clean(nd.attrib.get("ref")) for nd in way.findall("nd")]
        coords = [nodes[r] for r in refs if r in nodes]
        ways[way_id] = coords
        tags = _tags(way)
        name, strength = _name(tags), _strength(tags)
        if not name or _generic_name(name) or strength == "REJECT" or not coords:
            continue
        lat, lng = _polygon_centroid(coords)
        out.append({"source_id": f"way/{way_id}", "name": name, "lat": lat, "lng": lng, "tags": tags, "strength": strength, "geometry": coords})

    # Named industrial/company multipolygon/site relations often contain an
    # unnamed industrial building. Derive rough relation geometry from member ways
    # present in the map response so containment can still be tested.
    for rel in root.findall("relation"):
        tags = _tags(rel)
        name, strength = _name(tags), _strength(tags)
        if not name or _generic_name(name) or strength == "REJECT":
            continue
        coords: list[tuple[float, float]] = []
        for member in rel.findall("member"):
            if _clean(member.attrib.get("type")) != "way":
                continue
            coords.extend(ways.get(_clean(member.attrib.get("ref")), []))
        if not coords:
            continue
        lat, lng = _polygon_centroid(coords)
        rid = _clean(rel.attrib.get("id"))
        out.append({"source_id": f"relation/{rid}", "name": name, "lat": lat, "lng": lng, "tags": tags, "strength": strength, "geometry": coords})
    return out


def _already_named(item: dict[str, Any]) -> bool:
    meta = item.get("metadata") if isinstance(item.get("metadata"), dict) else {}
    return bool(_clean(meta.get("resolved_industry_name"))) or _clean(meta.get("identity_status")) in {
        "NAMED_OSM_INDUSTRY", "OFFICIAL_KIADB_ALLOTTEE", "OFFICIAL_KIADB_COMPANY", "NEARBY_KIADB_PLOT_MATCH"
    }


def _apply(item: dict[str, Any], match: dict[str, Any], method: str, distance_m: float) -> dict[str, Any]:
    updated = dict(item)
    meta = dict(item.get("metadata") if isinstance(item.get("metadata"), dict) else {})
    name = _clean(match.get("name"))
    strength = _clean(match.get("strength"))
    meta.update({
        "resolved_industry_name": name,
        "company_name": name,
        "company_name_source": "OPENSTREETMAP",
        "identity_source": "OSM_GEOMETRY_IDENTITY",
        "identity_status": "NAMED_OSM_INDUSTRY" if strength in {"STRONG", "AREA"} else "OSM_OCCUPANT_MATCH",
        "identity_confidence": "STRONG" if method in {"SAME_OSM_FEATURE", "PARENT_OSM_RELATION", "INSIDE_INDUSTRIAL_POLYGON", "CONTAINED_BY_NAMED_OSM_AREA"} else "PROXIMITY_VERIFIED",
        "identity_match_method": method,
        "identity_match_distance_m": round(float(distance_m), 2),
        "identity_anchor_source_id": _clean(match.get("source_id")),
        "identity_anchor_tags": match.get("tags") if isinstance(match.get("tags"), dict) else {},
        "identity_note": "Resolved from a named OSM feature spatially tied to the detected industrial geometry.",
    })
    updated["metadata"] = meta
    updated["name"] = name
    return updated


def _rank_anchor(candidate_polygon: list[tuple[float, float]], anchor: dict[str, Any]) -> tuple[float, float, str] | None:
    strength = _clean(anchor.get("strength"))
    geom = anchor.get("geometry") if isinstance(anchor.get("geometry"), list) else None
    alat, alng = _finite(anchor.get("lat")), _finite(anchor.get("lng"))

    # Named point/POI inside candidate polygon.
    if geom is None and alat is not None and alng is not None:
        inside = _point_in_polygon(alat, alng, candidate_polygon)
        distance = _distance_to_polygon_m(alat, alng, candidate_polygon)
        if inside and strength == "STRONG":
            return 1200.0, 0.0, "INSIDE_INDUSTRIAL_POLYGON"
        if inside and strength == "BUSINESS":
            return 1050.0, 0.0, "INSIDE_INDUSTRIAL_POLYGON"
        if inside and strength == "AREA":
            return 1000.0, 0.0, "INSIDE_INDUSTRIAL_POLYGON"
        if strength == "STRONG" and distance <= STRONG_NEARBY_M:
            return 700.0 - distance, distance, "ADJACENT_STRONG_OSM_IDENTITY"
        # Never assign a random shop/office merely because it is nearby.
        return None

    if geom:
        cand_lat, cand_lng = _polygon_centroid(candidate_polygon)
        anchor_contains_candidate = _point_in_polygon(cand_lat, cand_lng, geom) or any(
            _point_in_polygon(lat, lng, geom) for lat, lng in candidate_polygon[: min(32, len(candidate_polygon))]
        )
        anchor_lat, anchor_lng = _polygon_centroid(geom)
        candidate_contains_anchor = _point_in_polygon(anchor_lat, anchor_lng, candidate_polygon) or any(
            _point_in_polygon(lat, lng, candidate_polygon) for lat, lng in geom[: min(32, len(geom))]
        )
        distance = _polygon_distance_m(candidate_polygon, geom)

        if anchor_contains_candidate and strength in {"STRONG", "AREA"}:
            return 1250.0, 0.0, "CONTAINED_BY_NAMED_OSM_AREA"
        if candidate_contains_anchor and strength == "STRONG":
            return 1200.0, 0.0, "INSIDE_INDUSTRIAL_POLYGON"
        if candidate_contains_anchor and strength == "BUSINESS":
            return 1050.0, 0.0, "INSIDE_INDUSTRIAL_POLYGON"
        if strength == "STRONG" and distance <= STRONG_NEARBY_M:
            return 700.0 - distance, distance, "ADJACENT_STRONG_OSM_IDENTITY"
        if strength == "AREA" and distance <= AREA_NEARBY_M:
            return 620.0 - distance, distance, "ADJACENT_NAMED_INDUSTRIAL_AREA"
    return None


def _resolve_way_item(item: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    source_id = _clean(item.get("source_id"))
    if not source_id.startswith("way/"):
        return item, {"matched": False, "reason": "not_way", "anchors": 0}
    way_id = source_id.split("/", 1)[1]
    raw = _get_way_full(way_id)
    polygon, own_tags = _parse_way_full(raw, way_id)
    if len(polygon) < 3:
        return item, {"matched": False, "reason": "no_polygon", "anchors": 0}

    own_name, own_strength = _name(own_tags), _strength(own_tags)
    if own_name and not _generic_name(own_name) and own_strength in {"STRONG", "AREA"}:
        match = {"source_id": source_id, "name": own_name, "tags": own_tags, "strength": own_strength, "geometry": polygon}
        return _apply(item, match, "SAME_OSM_FEATURE", 0.0), {"matched": True, "method": "SAME_OSM_FEATURE", "anchors": 1}

    # Parent relation is a very strong association and was missing in V29.6.13.
    try:
        parent_matches = _parent_relation_matches(_get_way_relations(way_id), source_id)
    except Exception:
        parent_matches = []
    if len(parent_matches) == 1:
        return _apply(item, parent_matches[0], "PARENT_OSM_RELATION", 0.0), {"matched": True, "method": "PARENT_OSM_RELATION", "anchors": 1}

    west, south, east, north = _bbox_for_polygon(polygon)
    map_raw = _get_map_bbox(round(west, 7), round(south, 7), round(east, 7), round(north, 7))
    anchors = [a for a in _named_features(map_raw) if a.get("source_id") != source_id]
    ranked: list[tuple[float, float, dict[str, Any], str]] = []
    for anchor in anchors:
        ranked_result = _rank_anchor(polygon, anchor)
        if ranked_result is None:
            continue
        score, distance, method = ranked_result
        ranked.append((score, distance, anchor, method))

    if not ranked:
        return item, {"matched": False, "reason": "no_spatial_identity", "anchors": len(anchors)}
    ranked.sort(key=lambda row: (-row[0], row[1], _clean(row[2].get("name"))))
    top = ranked[0]
    if len(ranked) > 1:
        second = ranked[1]
        if _clean(top[2].get("name")) != _clean(second[2].get("name")) and abs(top[0] - second[0]) < 35.0:
            return item, {"matched": False, "reason": "ambiguous", "anchors": len(anchors)}
    return _apply(item, top[2], top[3], top[1]), {"matched": True, "method": top[3], "anchors": len(anchors)}


def resolve_unresolved_osm_items(items: list[dict[str, Any]], *, max_queries: int = MAX_CANDIDATE_QUERIES) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    out: list[dict[str, Any]] = []
    stats = {"attempted": False, "ok": True, "anchors": 0, "enriched": 0, "exact": 0, "nearby": 0, "queries": 0, "failures": 0, "message": ""}
    reasons: dict[str, int] = {}
    for item in items:
        if _already_named(item) or _clean(item.get("source")).upper() != "OPENSTREETMAP" or stats["queries"] >= max_queries:
            out.append(item)
            continue
        source_id = _clean(item.get("source_id"))
        if not source_id.startswith("way/"):
            out.append(item)
            continue
        stats["attempted"] = True
        stats["queries"] += 1
        try:
            resolved, info = _resolve_way_item(item)
            stats["anchors"] += int(info.get("anchors", 0) or 0)
            reason = _clean(info.get("reason"))
            if reason:
                reasons[reason] = reasons.get(reason, 0) + 1
            if info.get("matched"):
                stats["enriched"] += 1
                if info.get("method") in {"SAME_OSM_FEATURE", "PARENT_OSM_RELATION"}:
                    stats["exact"] += 1
                else:
                    stats["nearby"] += 1
            out.append(resolved)
            time.sleep(0.05)
        except Exception as exc:
            stats["failures"] += 1
            key = f"error:{type(exc).__name__}"
            reasons[key] = reasons.get(key, 0) + 1
            out.append(item)
    stats["ok"] = stats["failures"] == 0
    reason_text = ", ".join(f"{k}={v}" for k, v in sorted(reasons.items()))
    stats["message"] = (
        f"V29.6.15 OSM geometry resolver queried {stats['queries']} unnamed industrial way(s), "
        f"resolved {stats['enriched']} name(s), inspected {stats['anchors']} named feature(s)"
        + (f"; {reason_text}." if reason_text else ".")
    )
    return out, stats
