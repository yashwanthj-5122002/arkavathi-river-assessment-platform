"""Authenticated, read-only catalogue and GeoJSON conversion for company survey SHP sets.

Only the folder names below can be opened. Source files stay in production_data;
the cached GeoJSON is held in process memory and invalidated by companion-file
size or modification time.
"""

from __future__ import annotations

import datetime as dt
import math
from functools import lru_cache
from pathlib import Path
from typing import Any

import shapefile
from pyproj import CRS, Transformer


SURVEY_ROOT = Path(__file__).resolve().parents[2] / "production_data" / "gis" / "nakshatech-survey"
REQUIRED_EXTENSIONS = (".shp", ".shx", ".dbf", ".prj", ".cpg")
WGS84 = CRS.from_epsg(4326)

# IDs are public API identifiers; folder names are the unchanged survey source names.
DATASETS = (
    ("arkavathi-boundary", "Arkavathi_Boundary", "Hydrology"),
    ("arkavathi-chainage", "Arkavathi_Chainage", "Hydrology"),
    ("cauvery", "Cauvery", "Hydrology"),
    ("kumudavthi-boundary", "Kumudavthi_Boundary", "Hydrology"),
    ("kumudavthi-chainage", "Kumudavthi_Chainage", "Hydrology"),
    ("suvarnamuthi-boundary", "Suvarnamuthi_Boundary", "Hydrology"),
    ("suvarnamuthi-chainage", "Suvarnamuthi_Chainage", "Hydrology"),
    ("vrishabavathi-boundary", "Vrishabavathi_Boundary", "Hydrology"),
    ("vrishabavathi-chainage", "Vrishabavathi_Chainage", "Hydrology"),
    ("river-stream", "River_Stream", "Hydrology"),
    ("reservoirs", "Reservoirs", "Hydrology"),
    ("road", "Road", "Project & Infrastructure"),
    ("industrial", "Industrial", "Project & Infrastructure"),
    ("hydro-power-plant", "Hydro Power Plant", "Project & Infrastructure"),
    ("temple", "Temple", "Project & Infrastructure"),
    ("forest", "Forest", "Land & Context"),
    ("tamil-nadu", "Tamil Nadu", "Land & Context"),
)
BY_ID = {dataset_id: (folder, group) for dataset_id, folder, group in DATASETS}
SHAPE_FAMILIES = {
    1: "Point", 11: "Point", 21: "Point",
    3: "LineString", 13: "LineString", 23: "LineString",
    5: "Polygon", 15: "Polygon", 25: "Polygon",
    8: "MultiPoint", 18: "MultiPoint", 28: "MultiPoint",
}


def _paths(dataset_id: str) -> dict[str, Path]:
    entry = BY_ID.get(dataset_id)
    if entry is None:
        raise LookupError("Survey dataset not found")
    folder_name, _ = entry
    root = SURVEY_ROOT.resolve()
    folder = (root / folder_name).resolve()
    if not folder.is_relative_to(root) or not folder.is_dir():
        raise LookupError("Survey dataset is unavailable")
    files = {extension: folder / f"{folder_name}{extension}" for extension in REQUIRED_EXTENSIONS}
    if any(not path.is_file() or not path.resolve().is_relative_to(folder) for path in files.values()):
        raise LookupError("Survey dataset is incomplete")
    return files


def _source_crs(paths: dict[str, Path]) -> CRS:
    return CRS.from_wkt(paths[".prj"].read_text(encoding="utf-8-sig"))


def _crs_label(crs: CRS) -> str:
    authority = crs.to_authority()
    if authority:
        return f"{authority[0]}:{authority[1]}"
    operation = crs.coordinate_operation
    return operation.method_name if operation else crs.name


def _catalogue_row(dataset_id: str, folder_name: str, group: str) -> dict[str, Any]:
    row: dict[str, Any] = {
        "id": dataset_id,
        "name": folder_name.replace("_", " "),
        "source_name": folder_name,
        "group": group,
        "geometry_type": None,
        "feature_count": 0,
        "source_crs": None,
        "available": False,
    }
    try:
        paths = _paths(dataset_id)
        crs = _source_crs(paths)
        with shapefile.Reader(str(paths[".shp"]), shx=str(paths[".shx"]), dbf=str(paths[".dbf"])) as reader:
            row["geometry_type"] = SHAPE_FAMILIES.get(reader.shapeType)
            row["feature_count"] = len(reader)
        row["source_crs"] = _crs_label(crs)
        row["available"] = row["geometry_type"] is not None
    except (LookupError, OSError, ValueError, shapefile.ShapefileException):
        pass
    return row


def survey_catalogue() -> dict[str, Any]:
    return {"datasets": [_catalogue_row(*entry) for entry in DATASETS]}


def _signature(paths: dict[str, Path]) -> tuple[tuple[int, int], ...]:
    return tuple((paths[extension].stat().st_mtime_ns, paths[extension].stat().st_size) for extension in REQUIRED_EXTENSIONS)


def _json_value(value: Any) -> Any:
    if isinstance(value, (dt.date, dt.datetime)):
        return value.isoformat()
    if isinstance(value, float) and not math.isfinite(value):
        return None
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    return value


def _transform_coordinates(value: Any, transformer: Transformer | None) -> Any:
    if isinstance(value, (list, tuple)) and len(value) >= 2 and isinstance(value[0], (int, float)):
        x, y = float(value[0]), float(value[1])
        lon, lat = transformer.transform(x, y) if transformer else (x, y)
        if not math.isfinite(lon) or not math.isfinite(lat) or not (-180 <= lon <= 180 and -90 <= lat <= 90):
            raise ValueError("Feature has coordinates outside WGS84 bounds")
        return [lon, lat]
    if isinstance(value, (list, tuple)):
        return [_transform_coordinates(part, transformer) for part in value]
    raise ValueError("Feature has unusable geometry")


def _usable_geometry(geometry: dict[str, Any]) -> bool:
    kind, coordinates = geometry.get("type"), geometry.get("coordinates")
    if kind == "Point":
        return isinstance(coordinates, list) and len(coordinates) == 2
    if kind in {"MultiPoint", "LineString"}:
        return isinstance(coordinates, list) and len(coordinates) >= (2 if kind == "LineString" else 1)
    if kind in {"MultiLineString", "Polygon"}:
        return isinstance(coordinates, list) and any(isinstance(part, list) and len(part) >= (4 if kind == "Polygon" else 2) for part in coordinates)
    if kind == "MultiPolygon":
        return isinstance(coordinates, list) and any(isinstance(poly, list) and any(isinstance(ring, list) and len(ring) >= 4 for ring in poly) for poly in coordinates)
    return False


@lru_cache(maxsize=34)
def _converted(dataset_id: str, signature: tuple[tuple[int, int], ...]) -> dict[str, Any]:
    paths = _paths(dataset_id)
    source_crs = _source_crs(paths)
    transformer = None if source_crs.equals(WGS84) else Transformer.from_crs(source_crs, WGS84, always_xy=True)
    encoding = paths[".cpg"].read_text(encoding="ascii", errors="replace").strip() or "utf-8"
    features: list[dict[str, Any]] = []
    bounds = [math.inf, math.inf, -math.inf, -math.inf]
    with shapefile.Reader(str(paths[".shp"]), shx=str(paths[".shx"]), dbf=str(paths[".dbf"]), encoding=encoding, encodingErrors="replace") as reader:
        for index, shape_record in enumerate(reader.iterShapeRecords()):
            if shape_record.shape.shapeType == 0:
                continue
            try:
                raw = shape_record.shape.__geo_interface__
                geometry = {"type": raw["type"], "coordinates": _transform_coordinates(raw["coordinates"], transformer)}
                if not _usable_geometry(geometry):
                    continue
            except (KeyError, TypeError, ValueError, shapefile.ShapefileException):
                continue
            points: list[list[float]] = []
            def visit(value: Any) -> None:
                if isinstance(value, list) and len(value) == 2 and isinstance(value[0], float):
                    points.append(value)
                elif isinstance(value, list):
                    for part in value:
                        visit(part)
            visit(geometry["coordinates"])
            for lon, lat in points:
                bounds[0] = min(bounds[0], lon)
                bounds[1] = min(bounds[1], lat)
                bounds[2] = max(bounds[2], lon)
                bounds[3] = max(bounds[3], lat)
            properties = {key: _json_value(value) for key, value in shape_record.record.as_dict().items()}
            features.append({"type": "Feature", "id": index, "properties": properties, "geometry": geometry})
    return {
        "type": "FeatureCollection",
        "features": features,
        "metadata": {
            "dataset_id": dataset_id,
            "source_name": BY_ID[dataset_id][0],
            "source_crs": _crs_label(source_crs),
            "target_crs": "EPSG:4326",
            "feature_count": len(features),
            "bounds": None if not features else bounds,
        },
    }


def survey_geojson(dataset_id: str) -> dict[str, Any]:
    paths = _paths(dataset_id)
    return _converted(dataset_id, _signature(paths))
