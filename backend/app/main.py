from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

DATA_DIR = Path(__file__).resolve().parent / "data"


def load_json(name: str):
    path = DATA_DIR / name
    if not path.exists():
        raise RuntimeError(f"Required data file is missing: {path}")
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


app = FastAPI(
    title="Arkavathi Survey GIS Dashboard API",
    version="1.3.0",
    description="Python API for the verified Day 3-Day 8 Arkavathi drone survey visualization.",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[*[f"http://localhost:{p}" for p in range(5173, 5180)], *[f"http://127.0.0.1:{p}" for p in range(5173, 5180)]],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {
        "status": "ok",
        "service": "Arkavathi Survey GIS Dashboard API",
        "version": "1.3.0",
        "health": "/health",
        "docs": "/docs",
        "summary": "/api/v1/summary",
    }


@app.get("/health")
def health():
    return {"status": "ok", "service": "Arkavathi Survey GIS Dashboard API", "version": "1.3.0"}


@app.get("/api/v1/summary")
def get_summary():
    return summary()


@app.get("/api/v1/days")
def get_days():
    return summary()["days"]


@app.get("/api/v1/flights")
def get_flights(day: int | None = Query(default=None, ge=3, le=8)):
    items = flights()
    if day is not None:
        items = [item for item in items if item["day"] == day]
    return [
        {
            key: item[key]
            for key in (
                "id",
                "day",
                "sequence",
                "clip",
                "distance_km",
                "reported_points",
                "rendered_vertices",
                "duration_label",
                "alt_min_m",
                "alt_max_m",
                "start",
                "end",
            )
        }
        for item in items
    ]


@app.get("/api/v1/flights/{flight_id}")
def get_flight(flight_id: str):
    item = next((item for item in flights() if item["id"] == flight_id), None)
    if not item:
        raise HTTPException(status_code=404, detail="Flight not found")
    return item


def parse_days(days: str | None) -> set[int] | None:
    if not days:
        return None
    try:
        values = {int(value.strip()) for value in days.split(",") if value.strip()}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="days must be comma-separated integers") from exc
    invalid = values - set(range(3, 9))
    if invalid:
        raise HTTPException(status_code=400, detail=f"Invalid day(s): {sorted(invalid)}")
    return values


@app.get("/api/v1/map/tracks")
def get_tracks(days: str | None = None):
    selected = parse_days(days)
    data = tracks()
    if selected is None:
        return data
    return {
        "type": "FeatureCollection",
        "features": [feature for feature in data["features"] if feature["properties"]["day"] in selected],
    }


@app.get("/api/v1/map/endpoints")
def get_endpoints(days: str | None = None):
    selected = parse_days(days)
    data = endpoints()
    if selected is None:
        return data
    return {
        "type": "FeatureCollection",
        "features": [feature for feature in data["features"] if feature["properties"]["day"] in selected],
    }


@app.get("/api/v1/map/points")
def get_points(days: str | None = None):
    selected = parse_days(days)
    data = points()
    if selected is None:
        return data
    return {
        "type": "FeatureCollection",
        "features": [feature for feature in data["features"] if feature["properties"]["day"] in selected],
    }


@app.get("/api/v1/point-verification")
def get_point_verification():
    return point_verification()


@app.get("/api/v1/data-availability")
def get_availability():
    return availability()


@app.get("/api/v1/verification")
def get_verification():
    return verification()
