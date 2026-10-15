from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_verified_summary():
    response = client.get("/api/v1/summary")
    assert response.status_code == 200
    data = response.json()
    assert data["survey_days"] == 6
    assert data["flight_clips"] == 118
    assert data["source_rows"] == 937575
    assert data["reported_track_points"] == 17923
    assert data["flight_distance_km"] == 104.94
    assert data["recorded_duration_seconds"] == 13503


def test_day_4_flights():
    response = client.get("/api/v1/flights?day=4")
    assert response.status_code == 200
    assert len(response.json()) == 19


def test_map_filter():
    response = client.get("/api/v1/map/tracks?days=3,8")
    assert response.status_code == 200
    features = response.json()["features"]
    assert len(features) == 48
    assert {f["properties"]["day"] for f in features} == {3, 8}


def test_flight_detail():
    response = client.get("/api/v1/flights/D4-F001")
    assert response.status_code == 200
    data = response.json()
    assert data["clip"] == "DJI_20260806124926_0032_D.MP4"
    assert data["start"]["lat"] == 13.340216
    assert data["start"]["lon"] == 77.543686
