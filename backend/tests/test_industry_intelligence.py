import sqlite3

import pytest
from urllib.parse import parse_qs

import app.industry_intelligence as ii
from app.industry_intelligence import (
    _distance_point_to_segment_m,
    _parse_kiadb_features,
    _parse_river_geojson,
    _serialize_candidate,
)


@pytest.fixture(autouse=True)
def _disable_live_candidate_centered_kiadb(monkeypatch):
    """Keep older unit tests offline; V29.6.9-specific tests enable the resolver explicitly."""
    monkeypatch.setattr(ii, "KIADB_CANDIDATE_LOOKUP_ENABLED", False)
    ii._KIADB_CANDIDATE_CACHE.clear()


def test_kiadb_feature_parser_extracts_plot_fields():
    payload = {
        "type": "FeatureCollection",
        "features": [{
            "type": "Feature",
            "id": "plot-43",
            "properties": {
                "plot_no": "43",
                "allottee_name": "Example Industries Pvt Ltd",
                "industrial_area": "Example Industrial Area",
                "plot_status": "Allotted",
                "project_implementation_status": "Implemented",
                "nature_of_industry": "Engineering",
            },
            "geometry": {
                "type": "Polygon",
                "coordinates": [[[77.52, 13.02], [77.521, 13.02], [77.521, 13.021], [77.52, 13.021], [77.52, 13.02]]],
            },
        }],
    }
    rows = _parse_kiadb_features(payload)
    assert len(rows) == 1
    row = rows[0]
    assert row["source"] == "KIADB"
    assert row["name"] == "Example Industries Pvt Ltd"
    assert row["metadata"]["kiadb_plot_no"] == "43"
    assert row["metadata"]["industrial_area"] == "Example Industrial Area"
    assert row["metadata"]["nature_of_industry"] == "Engineering"


def test_candidate_is_linked_to_nearest_video_time_and_river():
    route = [
        {"time": 0.0, "lat": 13.0200, "lng": 77.5200},
        {"time": 5.0, "lat": 13.0205, "lng": 77.5205},
        {"time": 10.0, "lat": 13.0210, "lng": 77.5210},
    ]
    candidate = {
        "source": "KIADB",
        "source_id": "43",
        "name": "Example Industries",
        "category": "KIADB industrial plot",
        "lat": 13.02051,
        "lng": 77.52051,
        "address": "Example Industrial Area",
        "metadata": {"kiadb_plot_no": "43"},
    }
    rivers = [{
        "source": "OPENSTREETMAP",
        "source_id": "way/1:0",
        "name": "Arkavathi River",
        "waterway": "river",
        "coordinates": [[77.5204, 13.0204], [77.5208, 13.0208]],
    }]
    result = _serialize_candidate(candidate, route, 250, rivers, 250)
    assert result is not None
    assert result["nearest_video_time_s"] == 5.0
    assert result["nearest_video_time"] == "00:05"
    assert result["distance_from_route_m"] < 5
    assert result["river_distance_m"] is not None
    assert result["river_distance_m"] < 5
    assert result["nearest_river_name"] == "Arkavathi River"


def test_candidate_outside_river_corridor_is_removed():
    route = [
        {"time": 0.0, "lat": 13.0200, "lng": 77.5200},
        {"time": 5.0, "lat": 13.0205, "lng": 77.5205},
    ]
    candidate = {
        "source": "OPENSTREETMAP",
        "source_id": "node/9",
        "name": "Named Works",
        "category": "Factory / works",
        "lat": 13.0202,
        "lng": 77.5202,
        "address": "",
        "metadata": {},
    }
    far_river = [{
        "source": "OPENSTREETMAP",
        "source_id": "way/2:0",
        "name": "Far Stream",
        "waterway": "stream",
        "coordinates": [[77.5300, 13.0300], [77.5310, 13.0310]],
    }]
    assert _serialize_candidate(candidate, route, 250, far_river, 250) is None


def test_river_geojson_parser_and_segment_distance():
    payload = {
        "type": "FeatureCollection",
        "features": [{
            "type": "Feature",
            "properties": {"name": "Arkavathi River", "waterway": "river"},
            "geometry": {"type": "LineString", "coordinates": [[77.52, 13.02], [77.521, 13.021]]},
        }],
    }
    rows = _parse_river_geojson(payload, "KIADB")
    assert len(rows) == 1
    assert rows[0]["name"] == "Arkavathi River"
    assert rows[0]["source"] == "KIADB"
    distance, nearest_lat, nearest_lng = _distance_point_to_segment_m(
        13.0205, 77.5205, 77.52, 13.02, 77.521, 13.021
    )
    assert distance < 2
    assert abs(nearest_lat - 13.0205) < 0.00002
    assert abs(nearest_lng - 77.5205) < 0.00002


def test_osm_industry_query_includes_context_without_claiming_company(monkeypatch):
    captured = {}

    def fake_fetch(url, *, method="GET", data=None, headers=None, timeout=25):
        del url, method, headers, timeout
        captured["query"] = parse_qs((data or b"").decode("utf-8"))["data"][0]
        return {
            "elements": [
                {
                    "type": "way", "id": 1, "center": {"lat": 13.02, "lon": 77.52},
                    "tags": {"man_made": "works", "name": "Example Works"},
                },
                {
                    "type": "way", "id": 2, "center": {"lat": 13.021, "lon": 77.521},
                    "tags": {"landuse": "industrial"},
                },
                {
                    "type": "way", "id": 3, "center": {"lat": 13.022, "lon": 77.522},
                    "tags": {"landuse": "industrial", "name": "APMC Lorry Stand"},
                },
            ]
        }

    monkeypatch.setattr(ii, "_fetch_json", fake_fetch)
    rows = ii._discover_osm((13.0, 77.5, 13.1, 77.6))
    query = captured["query"]
    assert 'landuse"="industrial' in query
    assert 'man_made"="works' in query
    assert 'building"~"^(industrial|warehouse|factory)$' in query
    assert len(rows) == 2
    named = next(row for row in rows if row["source_id"] == "way/1")
    context = next(row for row in rows if row["source_id"] == "way/2")
    assert named["name"] == "Example Works"
    assert named["metadata"]["identity_confidence"] == "NAMED_MAP_FEATURE"
    assert context["name"] == "Industrial area (OSM context)"
    assert context["metadata"]["identity_confidence"] == "INDUSTRIAL_CONTEXT_ONLY"
    assert "identity unverified" in context["category"].lower()
    assert all("Lorry Stand" not in row["name"] for row in rows)


def test_osm_river_query_requests_waterways(monkeypatch):
    captured = {}

    def fake_fetch(url, *, method="GET", data=None, headers=None, timeout=25):
        del url, method, headers, timeout
        captured["query"] = parse_qs((data or b"").decode("utf-8"))["data"][0]
        return {"elements": []}

    monkeypatch.setattr(ii, "_fetch_json", fake_fetch)
    assert ii._discover_rivers_osm((13.0, 77.5, 13.1, 77.6)) == []
    assert 'waterway"~"^(river|stream|canal)$' in captured["query"]


def test_schema_migrates_river_columns_without_touching_user_db(monkeypatch):
    # Use a private in-memory database so the test can never alter runtime/auth.db.
    db = sqlite3.connect(":memory:")
    db.row_factory = sqlite3.Row
    monkeypatch.setattr(ii, "connect", lambda: db)
    ii.ensure_industry_schema()
    run_columns = {row["name"] for row in db.execute("PRAGMA table_info(industry_discovery_runs)")}
    candidate_columns = {row["name"] for row in db.execute("PRAGMA table_info(industry_candidates)")}
    assert {"river_radius_m", "river_context_json"}.issubset(run_columns)
    assert {"river_distance_m", "nearest_river_name", "river_source", "river_relevance"}.issubset(candidate_columns)
    db.close()


def test_kiadb_aspnet_dataset_parser_recognizes_allotee_typo_and_coordinates():
    payload = {
        "d": '{"Table":[{"PlotNo":"A-17","Allotee_Name":"Riverfront Engineering Pvt Ltd","IndustrialAreaName":"Example IA","PlotStatus":"Allotted","NatureOfIndustry":"Engineering","Latitude":"13.0205","Longitude":"77.5205"}]}'
    }
    rows = _parse_kiadb_features(payload)
    assert len(rows) == 1
    row = rows[0]
    assert row["name"] == "Riverfront Engineering Pvt Ltd"
    assert row["metadata"]["allottee"] == "Riverfront Engineering Pvt Ltd"
    assert row["metadata"]["identity_source"] == "KIADB_ALLOTTEE"
    assert row["metadata"]["identity_status"] == "OFFICIAL_KIADB_ALLOTTEE"
    assert row["metadata"]["kiadb_plot_no"] == "A-17"
    assert row["metadata"]["industrial_area"] == "Example IA"
    assert abs(row["lat"] - 13.0205) < 1e-9
    assert abs(row["lng"] - 77.5205) < 1e-9


def test_osm_operator_is_used_as_industry_name_when_name_is_absent(monkeypatch):
    def fake_fetch(url, *, method="GET", data=None, headers=None, timeout=25):
        del url, method, data, headers, timeout
        return {"elements": [{
            "type": "way", "id": 44, "center": {"lat": 13.02, "lon": 77.52},
            "tags": {"man_made": "works", "operator": "Operator Named Industries Ltd"},
        }]}

    monkeypatch.setattr(ii, "_fetch_json", fake_fetch)
    rows = ii._discover_osm((13.0, 77.5, 13.1, 77.6))
    assert len(rows) == 1
    assert rows[0]["name"] == "Operator Named Industries Ltd"
    assert rows[0]["metadata"]["identity_source"] == "OSM_OPERATOR"
    assert rows[0]["metadata"]["identity_status"] == "NAMED_OSM_INDUSTRY"


def test_serialized_candidate_exposes_identity_fields():
    route = [
        {"time": 0.0, "lat": 13.02, "lng": 77.52},
        {"time": 5.0, "lat": 13.0205, "lng": 77.5205},
    ]
    candidate = {
        "source": "KIADB", "source_id": "A-17", "name": "Riverfront Engineering Pvt Ltd",
        "category": "Engineering", "lat": 13.0201, "lng": 77.5201, "address": "Example IA",
        "metadata": {
            "resolved_industry_name": "Riverfront Engineering Pvt Ltd",
            "identity_source": "KIADB_ALLOTTEE", "identity_status": "OFFICIAL_KIADB_ALLOTTEE",
            "kiadb_plot_no": "A-17", "industrial_area": "Example IA",
            "nature_of_industry": "Engineering", "plot_status": "Allotted",
        },
    }
    result = _serialize_candidate(candidate, route, 250, [], 250)
    assert result is not None
    assert result["display_name"] == "Riverfront Engineering Pvt Ltd"
    assert result["identity_source"] == "KIADB_ALLOTTEE"
    assert result["identity_status"] == "OFFICIAL_KIADB_ALLOTTEE"
    assert result["kiadb_plot_no"] == "A-17"
    assert result["industrial_area"] == "Example IA"
    assert result["nature_of_industry"] == "Engineering"
    assert result["plot_status"] == "Allotted"


def test_kiadb_plot_details_enrichment_uses_configured_exact_body(monkeypatch):
    ii._KIADB_DETAILS_CACHE.clear()
    monkeypatch.setattr(ii, "KIADB_PLOT_DETAILS_BODY_TEMPLATE", '{"capturedKey":"{{plot_no}}"}')
    monkeypatch.setattr(ii, "KIADB_PLOT_DETAILS_URL", "https://example.invalid/getdeatilsforidentifier")
    captured = {}

    def fake_identifier(url, *, data, timeout=25):
        captured["url"] = url
        captured["data"] = data
        captured["timeout"] = timeout
        return {"d": '[{"PlotNo":"A-17","Allotee_Name":"Official KIADB Allottee Pvt Ltd","IndustrialAreaName":"Example IA"}]'}

    monkeypatch.setattr(ii, "_fetch_kiadb_identifier_json", fake_identifier)
    item = {
        "source": "KIADB", "source_id": "plot-17", "name": "KIADB Plot A-17",
        "lat": 13.02, "lng": 77.52, "address": "",
        "metadata": {"kiadb_plot_no": "A-17", "allottee": ""},
    }
    enriched = ii._enrich_kiadb_item_details(item)
    assert captured["url"].endswith("getdeatilsforidentifier")
    assert b'"capturedKey": "A-17"' in captured["data"]
    assert enriched["name"] == "Official KIADB Allottee Pvt Ltd"
    assert enriched["metadata"]["identity_source"] == "KIADB_IDENTIFIER"
    assert enriched["metadata"]["identity_status"] == "OFFICIAL_KIADB_COMPANY"
    assert enriched["metadata"]["industrial_area"] == "Example IA"

def test_captured_kiadb_arcgis_plot_response_parses_plotcode_and_location():
    payload = {
        "displayFieldName": "industrycode",
        "geometryType": "esriGeometryPolygon",
        "spatialReference": {"wkid": 102100, "latestWkid": 3857},
        "features": [{
            "attributes": {
                "objectid": 54949,
                "industrycode": "0167",
                "plotno": "11",
                "plotarea": 14.1,
                "latitude": 12.98350041,
                "longitude": 77.7269896,
                "ulpin": "BDMMUUA2UNFK",
                "indx": "Allotted",
                "plotcode": "Z0657201670084",
                "industrialname": "EPIP 1st and 2nd Phase",
            },
            "geometry": {"rings": [[[8652430.7, 1458002.5], [8652474.1, 1457977.9], [8652430.7, 1458002.5]]]},
        }],
    }
    rows = _parse_kiadb_features(payload)
    assert len(rows) == 1
    row = rows[0]
    assert row["source"] == "KIADB"
    assert row["source_id"] == "Z0657201670084"
    assert row["name"] == "KIADB Plot 11"
    assert abs(row["lat"] - 12.98350041) < 1e-10
    assert abs(row["lng"] - 77.7269896) < 1e-10
    assert row["metadata"]["kiadb_plot_code"] == "Z0657201670084"
    assert row["metadata"]["kiadb_plot_no"] == "11"
    assert row["metadata"]["kiadb_industry_code"] == "0167"
    assert row["metadata"]["industrial_area"] == "EPIP 1st and 2nd Phase"
    assert row["metadata"]["plot_status"] == "Allotted"


def test_arcgis_bbox_query_uses_captured_kiadb_layer_and_web_mercator():
    from urllib.parse import urlsplit, parse_qs
    url = ii._arcgis_envelope_query_url(
        "https://kgis.ksrsac.in/kgismaps2/rest/services/KIADB/KIADB/MapServer/1/query",
        (12.97, 77.71, 12.99, 77.74),
    )
    parts = urlsplit(url)
    params = parse_qs(parts.query)
    assert parts.path.endswith("/KIADB/KIADB/MapServer/1/query")
    assert params["f"] == ["json"]
    assert params["spatialRel"] == ["esriSpatialRelIntersects"]
    assert params["geometryType"] == ["esriGeometryEnvelope"]
    assert params["inSR"] == ["102100"]
    assert params["outFields"] == ["*"]
    assert params["returnGeometry"] == ["false"]
    assert params["resultRecordCount"] == ["2000"]
    geometry = __import__("json").loads(params["geometry"][0])
    assert geometry["spatialReference"]["wkid"] == 102100
    assert geometry["xmin"] < geometry["xmax"]
    assert geometry["ymin"] < geometry["ymax"]
    assert 8_600_000 < geometry["xmin"] < 8_700_000
    assert 1_400_000 < geometry["ymin"] < 1_500_000


def test_captured_getdeatilsforidentifier_response_resolves_official_allottee(monkeypatch):
    ii._KIADB_DETAILS_CACHE.clear()
    monkeypatch.setattr(ii, "KIADB_PLOT_DETAILS_BODY_TEMPLATE", '{"plcd":"{{plot_code}}"}')
    monkeypatch.setattr(ii, "KIADB_PLOT_DETAILS_URL", "https://kiadb.karnataka.gov.in/kiadbgisportal/sulb.asmx/getdeatilsforidentifier")
    captured = {}

    def fake_identifier(url, *, data, timeout=25):
        captured.update(url=url, data=data, timeout=timeout)
        return {
            "d": '[{"dstr":"Bengaluru Urban","nmindar":"EPIP 1st and 2nd Phase","plno":"11","plst":"Allotted","dtaltm":"23/12/1997","nmalt":"MAKINO ASIA PTE LTD","addalt":"3,Intnl.Tech Park, Whitefield Rd,B\\u0027Lore-66","ntrind":"JIGS, FIXTURES FOR MACHINE TOOLS","implst":"Implemented","pltar":14.1,"village_name":"K R Pura3","survey_no":"146 & 146 (P)","zone_office_name":"EE-2"}]'
        }

    monkeypatch.setattr(ii, "_fetch_kiadb_identifier_json", fake_identifier)
    item = {
        "source": "KIADB",
        "source_id": "Z0657201670084",
        "name": "KIADB Plot 11",
        "lat": 12.98350041,
        "lng": 77.7269896,
        "address": "EPIP 1st and 2nd Phase",
        "metadata": {"kiadb_plot_code": "Z0657201670084", "kiadb_plot_no": "11", "allottee": ""},
    }
    enriched = ii._enrich_kiadb_item_details(item)
    assert b'"plcd": "Z0657201670084"' in captured["data"]
    assert enriched["name"] == "MAKINO ASIA PTE LTD"
    assert enriched["metadata"]["company_name"] == "MAKINO ASIA PTE LTD"
    assert enriched["metadata"]["allottee"] == "MAKINO ASIA PTE LTD"
    assert enriched["metadata"]["industrial_area"] == "EPIP 1st and 2nd Phase"
    assert enriched["metadata"]["nature_of_industry"] == "JIGS, FIXTURES FOR MACHINE TOOLS"
    assert enriched["metadata"]["plot_status"] == "Allotted"
    assert enriched["metadata"]["project_status"] == "Implemented"
    assert enriched["metadata"]["district"] == "Bengaluru Urban"
    assert enriched["metadata"]["allotment_date"] == "23/12/1997"
    assert enriched["metadata"]["identity_status"] == "OFFICIAL_KIADB_COMPANY"

def test_discover_kiadb_uses_live_arcgis_layer_by_default(monkeypatch):
    captured = {}

    def fake_fetch(url, *, method="GET", data=None, headers=None, timeout=25):
        del method, data, headers, timeout
        captured["url"] = url
        return {
            "features": [{
                "attributes": {
                    "plotno": "11", "plotcode": "Z0657201670084", "industrycode": "0167",
                    "latitude": 12.98350041, "longitude": 77.7269896,
                    "industrialname": "EPIP 1st and 2nd Phase", "indx": "Allotted",
                }
            }]
        }

    monkeypatch.setattr(ii, "_fetch_json", fake_fetch)
    monkeypatch.setattr(ii, "KIADB_ARCGIS_QUERY_URL", "https://kgis.ksrsac.in/kgismaps2/rest/services/KIADB/KIADB/MapServer/1/query")
    monkeypatch.delenv("ARKAVATHI_KIADB_GEOJSON_URL", raising=False)
    monkeypatch.delenv("ARKAVATHI_KIADB_WFS_URL", raising=False)
    monkeypatch.delenv("ARKAVATHI_KIADB_WFS_LAYER", raising=False)
    rows, message = ii._discover_kiadb((12.97, 77.71, 12.99, 77.74))
    assert len(rows) == 1
    assert rows[0]["source_id"] == "Z0657201670084"
    assert "MapServer/1" in captured["url"]
    assert "Live K-GIS/KIADB ArcGIS" in message


def test_end_to_end_discovery_promotes_captured_kiadb_allottee(monkeypatch):
    from types import SimpleNamespace
    ii._KIADB_DETAILS_CACHE.clear()

    def fake_fetch(url, *, method="GET", data=None, headers=None, timeout=25):
        del method, data, headers, timeout
        if "MapServer/1/query" in url:
            return {"features": [{"attributes": {
                "objectid": 54949, "industrycode": "0167", "plotno": "11", "plotarea": 14.1,
                "latitude": 12.98350041, "longitude": 77.7269896, "ulpin": "BDMMUUA2UNFK",
                "indx": "Allotted", "plotcode": "Z0657201670084", "industrialname": "EPIP 1st and 2nd Phase",
            }}]}
        if "overpass" in url:
            return {"elements": []}
        raise AssertionError(url)

    def fake_identifier(url, *, data, timeout=25):
        del timeout
        assert "getdeatilsforidentifier" in url
        assert b'"plcd": "Z0657201670084"' in data
        return {"d": '[{"dstr":"Bengaluru Urban","nmindar":"EPIP 1st and 2nd Phase","plno":"11","plst":"Allotted","dtaltm":"23/12/1997","nmalt":"MAKINO ASIA PTE LTD","ntrind":"JIGS, FIXTURES FOR MACHINE TOOLS","implst":"Implemented"}]'}

    monkeypatch.setattr(ii, "_fetch_json", fake_fetch)
    monkeypatch.setattr(ii, "_fetch_kiadb_identifier_json", fake_identifier)
    monkeypatch.setattr(ii, "_discover_river_context", lambda *a, **k: ([], {"available": False, "source": "NONE", "feature_count": 0, "message": "test"}))
    monkeypatch.setattr(ii, "_save_run", lambda *a, **k: None)
    result = ii.discover_industries(
        SimpleNamespace(id=1),
        {
            "route": [
                {"time": 0.0, "lat": 12.98340, "lng": 77.72690},
                {"time": 5.0, "lat": 12.98355, "lng": 77.72705},
            ],
            "radius_m": 250, "river_radius_m": 250, "include_osm": False,
            "video_name": "sample.mp4", "srt_name": "sample.srt",
        },
    )
    assert result["version"] == "V29.6.11"
    assert result["counts"]["kiadb"] == 1
    assert result["sources"]["kiadb"]["details_enriched"] == 1
    candidate = result["candidates"][0]
    assert candidate["display_name"] == "MAKINO ASIA PTE LTD"
    assert candidate["source"] == "KIADB"
    assert candidate["kiadb_plot_no"] == "11"
    assert candidate["industrial_area"] == "EPIP 1st and 2nd Phase"
    assert candidate["identity_status"] == "OFFICIAL_KIADB_COMPANY"

def test_live_kiadb_query_uses_portal_headers_and_short_source_timeout(monkeypatch):
    captured = {}

    def fake_fetch(url, *, method="GET", data=None, headers=None, timeout=25):
        captured.update(url=url, method=method, data=data, headers=headers or {}, timeout=timeout)
        return {"features": []}

    monkeypatch.setattr(ii, "_fetch_json", fake_fetch)
    monkeypatch.setattr(ii, "KIADB_ARCGIS_QUERY_URL", "https://kgis.ksrsac.in/kgismaps2/rest/services/KIADB/KIADB/MapServer/1/query")
    monkeypatch.setattr(ii, "SOURCE_HTTP_TIMEOUT", 7.0)
    monkeypatch.delenv("ARKAVATHI_KIADB_GEOJSON_URL", raising=False)
    monkeypatch.delenv("ARKAVATHI_KIADB_WFS_URL", raising=False)
    monkeypatch.delenv("ARKAVATHI_KIADB_WFS_LAYER", raising=False)
    rows, _ = ii._discover_kiadb((12.95, 77.50, 12.98, 77.54))
    assert rows == []
    assert captured["headers"]["Origin"] == "https://kiadb.karnataka.gov.in"
    assert captured["headers"]["Referer"] == "https://kiadb.karnataka.gov.in/"
    assert captured["timeout"] == 7.0


def test_osm_retries_secondary_overpass_endpoint(monkeypatch):
    calls = []

    def fake_fetch(url, *, method="GET", data=None, headers=None, timeout=25):
        calls.append(url)
        if len(calls) == 1:
            raise TimeoutError("primary unavailable")
        return {
            "elements": [
                {
                    "type": "way",
                    "id": 347550249,
                    "center": {"lat": 12.96060, "lon": 77.51570},
                    "tags": {"landuse": "industrial"},
                }
            ]
        }

    monkeypatch.setattr(ii, "_fetch_json", fake_fetch)
    monkeypatch.setattr(ii, "DEFAULT_OVERPASS_URL", "https://primary.invalid/api/interpreter")
    monkeypatch.setattr(ii, "OVERPASS_FALLBACK_URLS", ("https://secondary.example/api/interpreter",))
    rows = ii._discover_osm((12.958, 77.513, 12.963, 77.518))
    assert len(calls) == 2
    assert calls[0].startswith("https://primary.invalid")
    assert calls[1].startswith("https://secondary.example")
    assert len(rows) == 1
    assert rows[0]["name"] == "Industrial area (OSM context)"


def test_osm_fallback_survives_kiadb_source_failure(monkeypatch):
    from types import SimpleNamespace

    monkeypatch.setattr(ii, "_discover_kiadb", lambda bbox: (_ for _ in ()).throw(TimeoutError("kgis timeout")))
    # Isolate this legacy fallback test from the V29.6.5 local-cache recovery path.
    # Cache behavior is covered separately by test_local_osm_cache_is_spatially_revalidated_and_reused.
    monkeypatch.setattr(ii, "_load_cached_osm_items", lambda *a, **k: [])
    monkeypatch.setattr(
        ii,
        "_discover_osm",
        lambda bbox: [{
            "source": "OPENSTREETMAP",
            "source_id": "way/347550249",
            "name": "Industrial area (OSM context)",
            "category": "Industrial map context - identity unverified",
            "lat": 12.96060,
            "lng": 77.51570,
            "address": "",
            "metadata": {
                "identity_status": "INDUSTRIAL_CONTEXT_ONLY",
                "identity_source": "OSM_LANDUSE",
                "resolved_industry_name": "",
            },
        }],
    )
    monkeypatch.setattr(ii, "_discover_osm_identity_anchors", lambda bbox: [])
    monkeypatch.setattr(ii, "_discover_river_context", lambda *a, **k: ([], {"available": False, "source": "NONE", "feature_count": 0, "message": "test"}))
    monkeypatch.setattr(ii, "_save_run", lambda *a, **k: None)
    result = ii.discover_industries(
        SimpleNamespace(id=1),
        {
            "route": [
                {"time": 0.0, "lat": 12.96048, "lng": 77.51577},
                {"time": 5.0, "lat": 12.96080, "lng": 77.51555},
            ],
            "radius_m": 250,
            "river_radius_m": 250,
            "include_osm": True,
            "video_name": "DJI_0018.MP4",
            "srt_name": "DJI_0018.SRT",
        },
    )
    assert result["sources"]["kiadb"]["ok"] is False
    assert result["sources"]["openstreetmap"]["ok"] is True
    assert result["counts"]["openstreetmap"] == 1
    assert result["counts"]["total"] == 1


def test_osm_map_api_xml_parser_recovers_industrial_landuse_way():
    raw = b'''<osm version="0.6">
      <node id="1" lat="12.96050" lon="77.51560" />
      <node id="2" lat="12.96070" lon="77.51580" />
      <node id="3" lat="12.96060" lon="77.51590" />
      <way id="347550249">
        <nd ref="1"/><nd ref="2"/><nd ref="3"/><nd ref="1"/>
        <tag k="landuse" v="industrial"/>
      </way>
    </osm>'''
    rows = ii._parse_osm_map_xml(raw)
    assert len(rows) == 1
    assert rows[0]["source_id"] == "way/347550249"
    assert rows[0]["name"] == "Industrial area (OSM context)"
    assert rows[0]["metadata"]["retrieval_mode"] == "OSM_MAP_API"


def test_local_osm_cache_is_spatially_revalidated_and_reused(monkeypatch, tmp_path):
    from types import SimpleNamespace

    db_path = tmp_path / "cache.sqlite"
    db = sqlite3.connect(db_path)
    db.executescript(
        """
        CREATE TABLE industry_discovery_runs(
            id INTEGER PRIMARY KEY,
            user_id INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            video_name TEXT NOT NULL,
            srt_name TEXT NOT NULL
        );
        CREATE TABLE industry_candidates(
            id INTEGER PRIMARY KEY,
            run_id INTEGER NOT NULL,
            source TEXT NOT NULL,
            source_id TEXT NOT NULL,
            name TEXT NOT NULL,
            category TEXT NOT NULL,
            lat REAL NOT NULL,
            lng REAL NOT NULL,
            address TEXT NOT NULL,
            route_distance_m REAL NOT NULL,
            metadata_json TEXT NOT NULL
        );
        """
    )
    db.execute(
        "INSERT INTO industry_discovery_runs VALUES(1,1,'2026-09-11T10:00:00+00:00','DJI_0018.MP4','DJI_0018.SRT')"
    )
    db.execute(
        """INSERT INTO industry_candidates
           VALUES(1,1,'OPENSTREETMAP','way/347550249','Industrial area (OSM context)',
                  'Industrial map context - identity unverified',12.96060,77.51570,'',143.0,
                  '{"identity_status":"INDUSTRIAL_CONTEXT_ONLY","identity_source":"OSM_LANDUSE"}')"""
    )
    db.execute(
        """INSERT INTO industry_candidates
           VALUES(2,1,'OPENSTREETMAP','way/far','Industrial area (OSM context)',
                  'Industrial map context - identity unverified',13.50000,78.00000,'',100.0,'{}')"""
    )
    db.commit()
    db.close()

    def fake_connect():
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        return conn

    monkeypatch.setattr(ii, "connect", fake_connect)
    monkeypatch.setattr(ii, "_discover_kiadb", lambda bbox: ([], "no KIADB plot"))
    monkeypatch.setattr(ii, "_discover_osm", lambda bbox: (_ for _ in ()).throw(TimeoutError("overpass down")))
    monkeypatch.setattr(ii, "_discover_osm_map_api", lambda bbox: (_ for _ in ()).throw(TimeoutError("map api down")))
    monkeypatch.setattr(ii, "_discover_osm_identity_anchors", lambda bbox: [])
    monkeypatch.setattr(ii, "_discover_river_context", lambda *a, **k: ([], {"available": False, "source": "NONE", "feature_count": 0, "message": "test"}))
    monkeypatch.setattr(ii, "_save_run", lambda *a, **k: None)

    result = ii.discover_industries(
        SimpleNamespace(id=1),
        {
            "route": [
                {"time": 0.0, "lat": 12.96048, "lng": 77.51577},
                {"time": 5.0, "lat": 12.96080, "lng": 77.51555},
            ],
            "radius_m": 250,
            "river_radius_m": 250,
            "include_osm": True,
            "video_name": "DJI_0018.MP4",
            "srt_name": "DJI_0018.SRT",
        },
    )
    assert result["version"] == "V29.6.11"
    assert result["counts"]["openstreetmap"] == 1
    assert result["counts"]["total"] == 1
    assert result["sources"]["openstreetmap"]["cache_used"] is True
    assert result["sources"]["openstreetmap"]["cache_count"] == 1
    assert result["sources"]["openstreetmap"]["retrieval_mode"] == "LOCAL_DISCOVERY_CACHE"
    assert result["candidates"][0]["source_id"] == "way/347550249"
    assert result["candidates"][0]["metadata"]["cache_reused"] is True


def test_direct_osm_map_api_is_used_when_cache_empty_and_overpass_fails(monkeypatch):
    from types import SimpleNamespace

    monkeypatch.setattr(ii, "_discover_kiadb", lambda bbox: ([], "no KIADB plot"))
    monkeypatch.setattr(ii, "_load_cached_osm_items", lambda *a, **k: [])
    monkeypatch.setattr(ii, "_discover_osm", lambda bbox: (_ for _ in ()).throw(TimeoutError("overpass down")))
    monkeypatch.setattr(
        ii,
        "_discover_osm_map_api",
        lambda bbox: [{
            "source": "OPENSTREETMAP",
            "source_id": "way/347550249",
            "name": "Industrial area (OSM context)",
            "category": "Industrial map context - identity unverified",
            "lat": 12.96060,
            "lng": 77.51570,
            "address": "",
            "metadata": {
                "identity_status": "INDUSTRIAL_CONTEXT_ONLY",
                "identity_source": "OSM_LANDUSE",
                "retrieval_mode": "OSM_MAP_API",
            },
        }],
    )
    monkeypatch.setattr(ii, "_discover_osm_identity_anchors", lambda bbox: [])
    monkeypatch.setattr(ii, "_discover_river_context", lambda *a, **k: ([], {"available": False, "source": "NONE", "feature_count": 0, "message": "test"}))
    monkeypatch.setattr(ii, "_save_run", lambda *a, **k: None)
    result = ii.discover_industries(
        SimpleNamespace(id=1),
        {
            "route": [
                {"time": 0.0, "lat": 12.96048, "lng": 77.51577},
                {"time": 5.0, "lat": 12.96080, "lng": 77.51555},
            ],
            "radius_m": 250,
            "river_radius_m": 250,
            "include_osm": True,
            "video_name": "DJI_0018.MP4",
            "srt_name": "DJI_0018.SRT",
        },
    )
    assert result["counts"]["openstreetmap"] == 1
    assert result["sources"]["openstreetmap"]["ok"] is True
    assert result["sources"]["openstreetmap"]["retrieval_mode"] == "OSM_MAP_API"
    assert "Overpass failed" in result["sources"]["openstreetmap"]["message"]


def test_osm_identity_anchor_parser_extracts_named_company_and_details():
    raw = b'''<osm version="0.6">
      <node id="10" lat="12.96061" lon="77.51571">
        <tag k="name" v="Example Engineering Pvt Ltd"/>
        <tag k="office" v="company"/>
        <tag k="product" v="industrial pumps"/>
        <tag k="addr:street" v="Factory Road"/>
      </node>
      <node id="1" lat="12.96050" lon="77.51560" />
      <node id="2" lat="12.96070" lon="77.51580" />
      <way id="20">
        <nd ref="1"/><nd ref="2"/><nd ref="1"/>
        <tag k="name" v="Named Factory Works"/>
        <tag k="man_made" v="works"/>
        <tag k="operator" v="Named Factory Operator"/>
      </way>
    </osm>'''
    rows = ii._parse_osm_identity_anchors(raw)
    names = {row["name"] for row in rows}
    assert "Example Engineering Pvt Ltd" in names
    assert "Named Factory Works" in names
    company = next(row for row in rows if row["name"] == "Example Engineering Pvt Ltd")
    assert company["metadata"]["identity_anchor_strength"] == "WEAK"
    assert company["metadata"]["nature_of_industry"] == "Product: industrial pumps"
    assert company["address"] == "Factory Road"
    works = next(row for row in rows if row["name"] == "Named Factory Works")
    assert works["metadata"]["identity_anchor_strength"] == "STRONG"
    assert works["metadata"]["identity_source"] == "OSM_NAME"


def test_context_candidate_is_promoted_to_nearby_named_osm_industry():
    context = [{
        "source": "OPENSTREETMAP",
        "source_id": "way/347550249",
        "name": "Industrial area (OSM context)",
        "category": "Industrial map context - identity unverified",
        "lat": 12.96060,
        "lng": 77.51570,
        "address": "",
        "metadata": {
            "identity_status": "INDUSTRIAL_CONTEXT_ONLY",
            "identity_source": "OSM_LANDUSE",
            "resolved_industry_name": "",
        },
    }]
    anchors = [{
        "source": "OPENSTREETMAP",
        "source_id": "way/9001",
        "name": "River Edge Engineering Pvt Ltd",
        "category": "Factory / works",
        "lat": 12.96062,
        "lng": 77.51572,
        "address": "12 Factory Road, Bengaluru",
        "metadata": {
            "identity_source": "OSM_NAME",
            "identity_status": "NAMED_OSM_INDUSTRY",
            "identity_confidence": "NAMED_MAP_FEATURE",
            "identity_anchor_strength": "STRONG",
            "resolved_industry_name": "River Edge Engineering Pvt Ltd",
            "nature_of_industry": "Factory / works",
            "operator": "River Edge Engineering",
        },
    }]
    enriched, stats = ii._enrich_osm_context_identities(context, anchors)
    assert stats["enriched"] == 1
    assert stats["nearby"] == 1
    item = enriched[0]
    assert item["name"] == "River Edge Engineering Pvt Ltd"
    assert item["address"] == "12 Factory Road, Bengaluru"
    assert item["metadata"]["resolved_industry_name"] == "River Edge Engineering Pvt Ltd"
    assert item["metadata"]["identity_status"] == "NAMED_OSM_INDUSTRY"
    assert item["metadata"]["identity_match_method"] == "NEARBY_OSM_NAMED_FACILITY"
    assert item["metadata"]["nature_of_industry"] == "Factory / works"


def test_context_candidate_is_not_given_unrelated_far_company_name(monkeypatch):
    monkeypatch.setattr(ii, "OSM_IDENTITY_MATCH_RADIUS_M", 120.0)
    context = [{
        "source": "OPENSTREETMAP", "source_id": "way/1", "name": "Industrial area (OSM context)",
        "category": "Industrial map context - identity unverified", "lat": 12.96060, "lng": 77.51570,
        "address": "", "metadata": {"identity_status": "INDUSTRIAL_CONTEXT_ONLY"},
    }]
    anchors = [{
        "source": "OPENSTREETMAP", "source_id": "way/2", "name": "Far Factory Ltd",
        "category": "Factory / works", "lat": 12.96500, "lng": 77.52000, "address": "",
        "metadata": {"identity_anchor_strength": "STRONG", "identity_source": "OSM_NAME"},
    }]
    enriched, stats = ii._enrich_osm_context_identities(context, anchors)
    assert stats["enriched"] == 0
    assert enriched[0]["name"] == "Industrial area (OSM context)"


def test_cached_route_runs_identity_refresh_without_breaking_detection(monkeypatch):
    from types import SimpleNamespace

    cached = [{
        "source": "OPENSTREETMAP",
        "source_id": "way/347550249",
        "name": "Industrial area (OSM context)",
        "category": "Industrial map context - identity unverified",
        "lat": 12.96060,
        "lng": 77.51570,
        "address": "",
        "metadata": {"identity_status": "INDUSTRIAL_CONTEXT_ONLY", "retrieval_mode": "LOCAL_DISCOVERY_CACHE"},
    }]
    anchors = [{
        "source": "OPENSTREETMAP",
        "source_id": "way/9001",
        "name": "Named Riverfront Industries Ltd",
        "category": "Factory / works",
        "lat": 12.96061,
        "lng": 77.51571,
        "address": "Industrial Road, Bengaluru",
        "metadata": {
            "identity_anchor_strength": "STRONG",
            "identity_source": "OSM_NAME",
            "identity_status": "NAMED_OSM_INDUSTRY",
            "identity_confidence": "NAMED_MAP_FEATURE",
            "resolved_industry_name": "Named Riverfront Industries Ltd",
            "nature_of_industry": "Factory / works",
        },
    }]
    monkeypatch.setattr(ii, "_discover_kiadb", lambda bbox: ([], "no KIADB plot in corridor"))
    monkeypatch.setattr(ii, "_load_cached_osm_items", lambda *a, **k: cached)
    monkeypatch.setattr(ii, "_discover_osm_identity_anchors", lambda bbox: anchors)
    monkeypatch.setattr(ii, "_discover_river_context", lambda *a, **k: ([], {"available": False, "source": "NONE", "feature_count": 0, "message": "test"}))
    monkeypatch.setattr(ii, "_save_run", lambda *a, **k: None)

    result = ii.discover_industries(
        SimpleNamespace(id=1),
        {
            "route": [
                {"time": 0.0, "lat": 12.96048, "lng": 77.51577},
                {"time": 5.0, "lat": 12.96080, "lng": 77.51555},
            ],
            "radius_m": 250,
            "river_radius_m": 250,
            "include_osm": True,
            "video_name": "DJI_0018.MP4",
            "srt_name": "DJI_0018.SRT",
        },
    )
    assert result["version"] == "V29.6.11"
    assert result["counts"]["openstreetmap"] == 1
    assert result["candidates"][0]["display_name"] == "Named Riverfront Industries Ltd"
    assert result["candidates"][0]["nature_of_industry"] == "Factory / works"
    osm = result["sources"]["openstreetmap"]
    assert osm["retrieval_mode"] == "LOCAL_DISCOVERY_CACHE"
    assert osm["identity_enriched_count"] == 1
    assert osm["identity_anchor_count"] == 1


def test_osm_identity_anchor_accepts_named_company_office_as_tight_business_anchor():
    raw = b'''<osm version="0.6">
      <node id="77" lat="12.96061" lon="77.51571">
        <tag k="name" v="Acme Engineering Pvt Ltd"/>
        <tag k="office" v="company"/>
        <tag k="addr:street" v="Industrial Main Road"/>
      </node>
    </osm>'''
    rows = ii._parse_osm_identity_anchors(raw)
    assert len(rows) == 1
    assert rows[0]["name"] == "Acme Engineering Pvt Ltd"
    assert rows[0]["metadata"]["identity_anchor_strength"] == "BUSINESS"
    assert rows[0]["address"] == "Industrial Main Road"


def test_google_places_named_manufacturer_can_resolve_context(monkeypatch):
    monkeypatch.setattr(ii, "GOOGLE_PLACES_API_KEY", "test-key")
    monkeypatch.setattr(ii, "GOOGLE_PLACES_ENABLED", True)
    monkeypatch.setattr(ii, "GOOGLE_PLACES_MATCH_RADIUS_M", 180.0)
    monkeypatch.setattr(ii, "GOOGLE_PLACES_WEAK_MATCH_RADIUS_M", 75.0)

    def fake_fetch(url, **kwargs):
        assert "places:searchNearby" in url
        assert kwargs["method"] == "POST"
        assert kwargs["headers"]["X-Goog-Api-Key"] == "test-key"
        return {
            "places": [{
                "id": "ChIJ_TEST_FACTORY",
                "displayName": {"text": "River Edge Manufacturing Pvt Ltd"},
                "formattedAddress": "12 Industrial Road, Bengaluru",
                "location": {"latitude": 12.96062, "longitude": 77.51572},
                "primaryType": "manufacturer",
                "types": ["manufacturer", "point_of_interest", "establishment"],
                "businessStatus": "OPERATIONAL",
                "googleMapsUri": "https://maps.google.com/?cid=test",
                "websiteUri": "https://example.invalid/",
            }]
        }

    monkeypatch.setattr(ii, "_fetch_json", fake_fetch)
    anchors = ii._discover_google_places_identity_anchors((12.958, 77.513, 12.963, 77.518))
    assert len(anchors) == 1
    assert anchors[0]["name"] == "River Edge Manufacturing Pvt Ltd"
    assert anchors[0]["metadata"]["identity_anchor_strength"] == "STRONG"

    context = [{
        "source": "OPENSTREETMAP",
        "source_id": "way/347550249",
        "name": "Industrial area (OSM context)",
        "category": "Industrial map context - identity unverified",
        "lat": 12.96060,
        "lng": 77.51570,
        "address": "",
        "metadata": {"identity_status": "INDUSTRIAL_CONTEXT_ONLY"},
    }]
    enriched, stats = ii._enrich_google_places_context_identities(context, anchors)
    assert stats["enriched"] == 1
    assert stats["strong"] == 1
    item = enriched[0]
    assert item["name"] == "River Edge Manufacturing Pvt Ltd"
    assert item["metadata"]["identity_status"] == "NEARBY_GOOGLE_PLACES_MATCH"
    assert item["metadata"]["identity_source"] == "GOOGLE_PLACES"
    assert item["metadata"]["google_place_id"] == "ChIJ_TEST_FACTORY"
    assert item["metadata"]["google_maps_uri"] == "https://maps.google.com/?cid=test"


def test_google_places_corporate_office_uses_tighter_radius(monkeypatch):
    monkeypatch.setattr(ii, "GOOGLE_PLACES_MATCH_RADIUS_M", 180.0)
    monkeypatch.setattr(ii, "GOOGLE_PLACES_WEAK_MATCH_RADIUS_M", 60.0)
    context = [{
        "source": "OPENSTREETMAP", "source_id": "way/1", "name": "Industrial (OSM context)",
        "category": "Industrial map context - identity unverified", "lat": 12.96060, "lng": 77.51570,
        "address": "", "metadata": {"identity_status": "INDUSTRIAL_CONTEXT_ONLY"},
    }]
    anchors = [{
        "source": "GOOGLE_PLACES", "source_id": "office-far", "name": "Generic Corporate Office",
        "category": "Corporate Office", "lat": 12.96150, "lng": 77.51570, "address": "",
        "metadata": {"identity_anchor_strength": "BUSINESS", "identity_source": "GOOGLE_PLACES"},
    }]
    enriched, stats = ii._enrich_google_places_context_identities(context, anchors)
    assert stats["enriched"] == 0
    assert enriched[0]["name"] == "Industrial (OSM context)"


def test_cached_context_can_fall_through_to_google_places_identity(monkeypatch):
    from types import SimpleNamespace

    cached = [{
        "source": "OPENSTREETMAP",
        "source_id": "way/347550249",
        "name": "Industrial (OSM context)",
        "category": "Industrial map context - identity unverified",
        "lat": 12.96060,
        "lng": 77.51570,
        "address": "",
        "metadata": {"identity_status": "INDUSTRIAL_CONTEXT_ONLY", "retrieval_mode": "LOCAL_DISCOVERY_CACHE"},
    }]
    places = [{
        "source": "GOOGLE_PLACES",
        "source_id": "ChIJ_FACTORY",
        "name": "Test Industrial Systems Pvt Ltd",
        "category": "Manufacturer",
        "lat": 12.96061,
        "lng": 77.51571,
        "address": "Bengaluru",
        "metadata": {
            "identity_anchor_strength": "STRONG",
            "identity_source": "GOOGLE_PLACES",
            "google_place_id": "ChIJ_FACTORY",
            "google_maps_uri": "https://maps.google.com/?cid=factory",
            "nature_of_industry": "Manufacturer",
        },
    }]
    monkeypatch.setattr(ii, "GOOGLE_PLACES_API_KEY", "test-key")
    monkeypatch.setattr(ii, "GOOGLE_PLACES_ENABLED", True)
    monkeypatch.setattr(ii, "_discover_kiadb", lambda bbox: ([], "no KIADB plot"))
    monkeypatch.setattr(ii, "_load_cached_osm_items", lambda *a, **k: cached)
    monkeypatch.setattr(ii, "_discover_osm_identity_anchors", lambda bbox: [])
    monkeypatch.setattr(ii, "_discover_google_places_identity_anchors", lambda bbox: places)
    monkeypatch.setattr(ii, "_discover_river_context", lambda *a, **k: ([], {"available": False, "source": "NONE", "feature_count": 0, "message": "test"}))
    monkeypatch.setattr(ii, "_save_run", lambda *a, **k: None)

    result = ii.discover_industries(
        SimpleNamespace(id=1),
        {
            "route": [
                {"time": 0.0, "lat": 12.96048, "lng": 77.51577},
                {"time": 5.0, "lat": 12.96080, "lng": 77.51555},
            ],
            "radius_m": 250,
            "river_radius_m": 250,
            "include_osm": True,
            "video_name": "DJI_0018.MP4",
            "srt_name": "DJI_0018.SRT",
        },
    )
    assert result["version"] == "V29.6.11"
    assert result["counts"]["openstreetmap"] == 1
    assert result["candidates"][0]["display_name"] == "Test Industrial Systems Pvt Ltd"
    assert result["candidates"][0]["identity_status"] == "NEARBY_GOOGLE_PLACES_MATCH"
    assert result["sources"]["google_places"]["configured"] is True
    assert result["sources"]["google_places"]["identity_enriched_count"] == 1


def test_osm_identity_anchor_accepts_industry_name_signal_without_special_tags():
    anchor = ii._osm_identity_anchor_from_tags(
        source_id="node/9001",
        lat=12.9604,
        lng=77.5156,
        tags={"name": "Sky Solar Industries Pvt Ltd"},
    )
    assert anchor is not None
    assert anchor["name"] == "Sky Solar Industries Pvt Ltd"
    assert anchor["metadata"]["identity_anchor_strength"] == "BUSINESS"


def test_candidate_centered_google_lookup_resolves_each_candidate(monkeypatch):
    monkeypatch.setattr(ii, "GOOGLE_PLACES_ENABLED", True)
    monkeypatch.setattr(ii, "GOOGLE_PLACES_API_KEY", "test-key")
    monkeypatch.setattr(ii, "GOOGLE_PLACES_MAX_POINT_QUERIES", 12)

    calls = []

    def fake_point(lat, lng, *, broad=False):
        calls.append((round(lat, 4), round(lng, 4), broad))
        if broad:
            return []
        if lat < 12.961:
            return [{
                "source": "GOOGLE_PLACES", "source_id": "p1", "name": "Alpha Engineering Pvt Ltd",
                "category": "Manufacturer", "lat": lat + 0.0001, "lng": lng,
                "address": "", "metadata": {"identity_anchor_strength": "STRONG", "identity_source": "GOOGLE_PLACES"},
            }]
        return [{
            "source": "GOOGLE_PLACES", "source_id": "p2", "name": "Beta Industries",
            "category": "Manufacturer", "lat": lat + 0.0001, "lng": lng,
            "address": "", "metadata": {"identity_anchor_strength": "STRONG", "identity_source": "GOOGLE_PLACES"},
        }]

    monkeypatch.setattr(ii, "_discover_google_places_point_anchors", fake_point)
    items = [
        {"source": "OPENSTREETMAP", "source_id": "way/1", "name": "Industrial (OSM context)", "category": "Industrial map context - identity unverified", "lat": 12.9605, "lng": 77.5157, "address": "", "metadata": {"identity_status": "INDUSTRIAL_CONTEXT_ONLY"}},
        {"source": "OPENSTREETMAP", "source_id": "way/2", "name": "Industrial (OSM context)", "category": "Industrial map context - identity unverified", "lat": 12.9615, "lng": 77.5158, "address": "", "metadata": {"identity_status": "INDUSTRIAL_CONTEXT_ONLY"}},
    ]
    enriched, stats = ii._candidate_centered_google_enrichment(items)
    assert enriched[0]["name"] == "Alpha Engineering Pvt Ltd"
    assert enriched[1]["name"] == "Beta Industries"
    assert stats["enriched"] == 2
    assert stats["queries"] == 2
    assert all(not call[2] for call in calls)


def test_google_broad_point_parser_rejects_restaurant_but_keeps_industry_name():
    payload = {
        "places": [
            {"id": "r1", "displayName": {"text": "River View Restaurant"}, "location": {"latitude": 12.96, "longitude": 77.51}, "primaryType": "restaurant", "types": ["restaurant"]},
            {"id": "i1", "displayName": {"text": "Omega Fabrication Works"}, "location": {"latitude": 12.9601, "longitude": 77.5101}, "primaryType": "point_of_interest", "types": ["point_of_interest", "establishment"]},
        ]
    }
    rows = ii._parse_google_places_rows(payload, broad=True)
    assert len(rows) == 1
    assert rows[0]["name"] == "Omega Fabrication Works"
    assert rows[0]["metadata"]["broad_lookup"] is True



def test_v2969_candidate_point_query_uses_captured_kiadb_contract():
    from urllib.parse import urlsplit, parse_qs
    url = ii._arcgis_point_query_url(
        "https://kgis.ksrsac.in/kgismaps2/rest/services/KIADB/KIADB/MapServer/1/query",
        12.98350041,
        77.7269896,
    )
    params = parse_qs(urlsplit(url).query)
    assert params["geometryType"] == ["esriGeometryPoint"]
    assert params["spatialRel"] == ["esriSpatialRelIntersects"]
    assert params["inSR"] == ["102100"]
    assert params["outFields"] == ["*"]
    geometry = __import__("json").loads(params["geometry"][0])
    assert geometry["spatialReference"]["wkid"] == 102100
    assert 8_000_000 < geometry["x"] < 9_000_000
    assert 1_000_000 < geometry["y"] < 2_000_000


def test_v2969_exact_candidate_kiadb_match_promotes_official_allottee(monkeypatch):
    ii._KIADB_DETAILS_CACHE.clear()
    monkeypatch.setattr(ii, "KIADB_CANDIDATE_LOOKUP_ENABLED", True)
    monkeypatch.setattr(ii, "KIADB_ARCGIS_QUERY_URL", "https://kgis.example/MapServer/1/query")
    monkeypatch.setattr(ii, "KIADB_PLOT_DETAILS_URL", "https://kiadb.example/getdeatilsforidentifier")
    monkeypatch.setattr(ii, "KIADB_PLOT_DETAILS_BODY_TEMPLATE", '{"plcd":"{{plot_code}}"}')

    def fake_fetch(url, *, method="GET", data=None, headers=None, timeout=25):
        del method, data, headers, timeout
        assert "MapServer/1/query" in url
        assert "geometryType=esriGeometryPoint" in url
        return {"features": [{"attributes": {
            "plotno": "11", "plotcode": "Z0657201670084", "industrycode": "0167",
            "latitude": 12.96060, "longitude": 77.51570,
            "industrialname": "Example Industrial Area", "indx": "Allotted",
        }}]}

    def fake_identifier(url, *, data, timeout=25):
        del timeout
        assert "getdeatilsforidentifier" in url
        assert b"Z0657201670084" in data
        return {"d": '[{"nmindar":"Example Industrial Area","plno":"11","plst":"Allotted","nmalt":"Riverfront Engineering Pvt Ltd","ntrind":"Engineering","implst":"Implemented"}]'}

    monkeypatch.setattr(ii, "_fetch_json", fake_fetch)
    monkeypatch.setattr(ii, "_fetch_kiadb_identifier_json", fake_identifier)
    context = [{
        "source": "OPENSTREETMAP", "source_id": "way/347550187",
        "name": "Industrial (OSM context)", "category": "Industrial map context - identity unverified",
        "lat": 12.96060, "lng": 77.51570, "address": "",
        "metadata": {"identity_status": "INDUSTRIAL_CONTEXT_ONLY", "identity_source": "OSM_LANDUSE"},
    }]
    rows, status = ii._try_enrich_kiadb_context_identities(context)
    assert status["queries"] == 1
    assert status["matches"] == 1
    assert status["enriched"] == 1
    assert status["exact"] == 1
    row = rows[0]
    assert row["source"] == "OPENSTREETMAP"
    assert row["name"] == "Riverfront Engineering Pvt Ltd"
    assert row["metadata"]["resolved_industry_name"] == "Riverfront Engineering Pvt Ltd"
    assert row["metadata"]["identity_status"] == "OFFICIAL_KIADB_COMPANY"
    assert row["metadata"]["kiadb_plot_no"] == "11"

def test_v2969_nearby_kiadb_plot_name_is_visible_but_not_claimed_as_ownership(monkeypatch):
    ii._KIADB_DETAILS_CACHE.clear()
    monkeypatch.setattr(ii, "KIADB_CANDIDATE_LOOKUP_ENABLED", True)
    monkeypatch.setattr(ii, "KIADB_CANDIDATE_MATCH_RADIUS_M", 250.0)
    monkeypatch.setattr(ii, "KIADB_ARCGIS_QUERY_URL", "https://kgis.example/MapServer/1/query")
    monkeypatch.setattr(ii, "KIADB_PLOT_DETAILS_URL", "https://kiadb.example/getdeatilsforidentifier")
    monkeypatch.setattr(ii, "KIADB_PLOT_DETAILS_BODY_TEMPLATE", '{"plcd":"{{plot_code}}"}')

    calls = {"map": 0}
    def fake_fetch(url, *, method="GET", data=None, headers=None, timeout=25):
        del method, data, headers, timeout
        assert "MapServer/1/query" in url
        calls["map"] += 1
        if "geometryType=esriGeometryPoint" in url:
            return {"features": []}
        return {"features": [{"attributes": {
            "plotno": "25", "plotcode": "PLOT25",
            "latitude": 12.96075, "longitude": 77.51570,
            "industrialname": "Nearby KIADB Estate", "indx": "Allotted",
        }}]}

    def fake_identifier(url, *, data, timeout=25):
        del url, data, timeout
        return {"d": '[{"nmindar":"Nearby KIADB Estate","plno":"25","nmalt":"Nearby Manufacturing Pvt Ltd","ntrind":"Manufacturing"}]'}

    monkeypatch.setattr(ii, "_fetch_json", fake_fetch)
    monkeypatch.setattr(ii, "_fetch_kiadb_identifier_json", fake_identifier)
    context = [{
        "source": "OPENSTREETMAP", "source_id": "way/347550249",
        "name": "Industrial (OSM context)", "category": "Industrial map context - identity unverified",
        "lat": 12.96060, "lng": 77.51570, "address": "",
        "metadata": {"identity_status": "INDUSTRIAL_CONTEXT_ONLY", "identity_source": "OSM_LANDUSE"},
    }]
    rows, status = ii._try_enrich_kiadb_context_identities(context)
    assert calls["map"] == 2
    assert status["nearby"] == 1
    assert rows[0]["name"] == "Nearby Manufacturing Pvt Ltd"
    assert rows[0]["metadata"]["identity_status"] == "NEARBY_KIADB_PLOT_MATCH"
    assert rows[0]["metadata"]["identity_match_method"] == "NEARBY_PLOT"
    assert "ownership proof" in rows[0]["metadata"]["identity_note"]

def test_v29611_default_uses_working_misspelled_kiadb_identifier_endpoint():
    assert ii.KIADB_PLOT_DETAILS_URL.endswith("/sulb.asmx/getdeatilsforidentifier")


def test_v29611_company_name_from_nmalt_when_nmalt_is_company():
    name, source = ii._extract_kiadb_company_name(
        "MAKINO ASIA PTE LTD",
        "3,Intnl.Tech Park, Whitefield Rd,Bangalore-66",
    )
    assert name == "MAKINO ASIA PTE LTD"
    assert source == "NMALT"


def test_v29611_company_name_from_addalt_when_nmalt_is_director():
    name, source = ii._extract_kiadb_company_name(
        "Sri,Senthil Iyyamperumal Kumar,Director",
        "Foxconn Hon Hai Technology India Mega Development Pvt.Ltd, Devenahalli General I.A, Bengaluru Rural",
    )
    assert name == "Foxconn Hon Hai Technology India Mega Development Pvt.Ltd"
    assert source == "ADDALT_PREFIX"


def test_v29611_identifier_enrichment_separates_company_from_allottee(monkeypatch):
    ii._KIADB_DETAILS_CACHE.clear()
    monkeypatch.setattr(ii, "KIADB_PLOT_DETAILS_URL", "https://kiadb.example/getdeatilsforidentifier")
    monkeypatch.setattr(ii, "KIADB_PLOT_DETAILS_BODY_TEMPLATE", '{"plcd":"{{plot_code}}"}')

    def fake_identifier(url, *, data, timeout=25):
        del url, data, timeout
        return {"d": '[{"dstr":"Bengaluru Rural","nmindar":"Devanahalli General Industrial Area","plno":"133","plst":"Allotted","nmalt":"Sri,Senthil Iyyamperumal Kumar,Director","addalt":"Foxconn Hon Hai Technology India Mega Development Pvt.Ltd, Devenahalli General I.A, Bengaluru Rural","implst":"Implemented"}]'}

    monkeypatch.setattr(ii, "_fetch_kiadb_identifier_json", fake_identifier)
    item = {
        "source": "KIADB", "source_id": "Z0752602360284", "name": "KIADB Plot 133",
        "lat": 13.30248, "lng": 77.614648, "address": "Devanahalli General Industrial Area",
        "metadata": {"kiadb_plot_code": "Z0752602360284", "kiadb_plot_no": "133"},
    }
    enriched = ii._enrich_kiadb_item_details(item)
    assert enriched["name"] == "Foxconn Hon Hai Technology India Mega Development Pvt.Ltd"
    assert enriched["metadata"]["company_name"] == "Foxconn Hon Hai Technology India Mega Development Pvt.Ltd"
    assert enriched["metadata"]["allottee"] == "Sri,Senthil Iyyamperumal Kumar,Director"
    assert enriched["metadata"]["identity_status"] == "OFFICIAL_KIADB_COMPANY"
    assert enriched["metadata"]["kiadb_details_endpoint"] == "getdeatilsforidentifier"
