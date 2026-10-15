"""Reproducible preprocessing for the Arkavathi GIS data panel.

Two independent stages are provided because the two source formats need
different libraries. Both stages are read-only against the supplied originals:
nothing in the source folders is modified, moved or deleted.

  drainage   Drainage_Network.shp -> frontend/public/gis/arkavathi/drainage-network.geojson
  elevation  Arkavathi_Dem1.tif   -> frontend/public/gis/arkavathi/elevation-dem1.png
                                     frontend/public/gis/arkavathi/elevation-dem1.manifest.json
  manifest   (no inputs)          -> docs/arkavathi-gis-data-manifest.json

Run from the repository root on Windows:

  backend\\.venv\\Scripts\\python.exe scripts\\prepare_arkavathi_gis_data.py drainage
  python scripts\\prepare_arkavathi_gis_data.py elevation
  python scripts\\prepare_arkavathi_gis_data.py manifest

Stage requirements
  drainage  : pyshp (+ pyproj only when the .prj is not already WGS 84)
  elevation : numpy + Pillow
  manifest  : standard library only
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import math
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
PUBLIC_GIS = ROOT / "frontend" / "public" / "gis" / "arkavathi"
DOCS = ROOT / "docs"

DEFAULT_DRAINAGE_DIR = Path(r"C:\Users\NT01231\Downloads\AI Team\Drainage network")
DEFAULT_DEM = Path(r"C:\Users\NT01231\Downloads\AI Team\Elevation Band\Arkavathi_Dem1.tif")

DRAINAGE_COMPONENTS = (".shp", ".shx", ".dbf", ".prj", ".cpg")
DRAINAGE_OUTPUT = PUBLIC_GIS / "drainage-network.geojson"
ELEVATION_OUTPUT = PUBLIC_GIS / "elevation-dem1.png"
ELEVATION_MANIFEST = PUBLIC_GIS / "elevation-dem1.manifest.json"
SOURCE_MANIFEST = DOCS / "arkavathi-gis-data-manifest.json"

# 12-class hypsometric ramp, green (low) through yellow/orange to dark
# red-brown (high). Class breaks are derived from the raster, never hard coded.
ELEVATION_RAMP = [
    "#1b6b3e", "#25824a", "#3d9a52", "#6ab15a", "#9ac363", "#c8cc66",
    "#e8c862", "#f2ac59", "#ec8d52", "#dd6f4a", "#c35743", "#9c4238",
]


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _write_json(path: Path, payload: Any, indent: int | None = 2) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    body = json.dumps(payload, indent=indent, ensure_ascii=False, separators=None if indent else (",", ":"))
    path.write_text(body + "\n", encoding="utf-8")
    print(f"  wrote {path.relative_to(ROOT)} ({path.stat().st_size:,} bytes)")


# ===========================================================================
# DRAINAGE NETWORK
# ===========================================================================
def _source_crs_is_wgs84(prj_text: str) -> bool:
    lowered = prj_text.lower()
    return "wgs_1984" in lowered or "wgs 84" in lowered or "wgs84" in lowered


def build_drainage(source_dir: Path, output: Path, precision: int = 7) -> dict[str, Any]:
    try:
        import shapefile  # pyshp
    except ImportError:  # pragma: no cover - environment guard
        raise SystemExit(
            "pyshp is required for the drainage stage.\n"
            "  backend\\.venv\\Scripts\\python.exe scripts\\prepare_arkavathi_gis_data.py drainage"
        )

    missing = [ext for ext in DRAINAGE_COMPONENTS if not (source_dir / f"Drainage_Network{ext}").is_file()]
    if missing:
        raise SystemExit(f"Drainage source folder {source_dir} is missing: {', '.join(missing)}")

    prj_text = (source_dir / "Drainage_Network.prj").read_text(encoding="utf-8-sig").strip()
    cpg_text = (source_dir / "Drainage_Network.cpg").read_text(encoding="ascii", errors="replace").strip()
    encoding = cpg_text or "utf-8"

    transformer = None
    crs_label = "GCS_WGS_1984 (EPSG:4326)"
    if not _source_crs_is_wgs84(prj_text):
        try:
            from pyproj import CRS, Transformer
        except ImportError:  # pragma: no cover - environment guard
            raise SystemExit(
                "The supplied .prj is not WGS 84, so pyproj is required to reproject:\n"
                "  backend\\.venv\\Scripts\\python.exe scripts\\prepare_arkavathi_gis_data.py drainage"
            )
        source_crs = CRS.from_wkt(prj_text)
        crs_label = source_crs.to_string()
        transformer = Transformer.from_crs(source_crs, "EPSG:4326", always_xy=True)

    def round_pair(lon: float, lat: float) -> list[float]:
        if transformer is not None:
            lon, lat = transformer.transform(lon, lat)
        return [round(lon, precision), round(lat, precision)]

    reader = shapefile.Reader(
        str(source_dir / "Drainage_Network.shp"),
        shx=str(source_dir / "Drainage_Network.shx"),
        dbf=str(source_dir / "Drainage_Network.dbf"),
        encoding=encoding,
        encodingErrors="replace",
    )
    field_names = [field[0] for field in reader.fields[1:]]
    shape_type_code = reader.shapeType
    shape_type_name = shapefile.SHAPETYPE_LOOKUP.get(shape_type_code, str(shape_type_code))
    declared_count = len(reader)
    bbox = [float(value) for value in reader.bbox]

    features: list[dict[str, Any]] = []
    dropped_null = 0
    dropped_degenerate = 0
    total_parts = 0
    total_points = 0
    bounds = [math.inf, math.inf, -math.inf, -math.inf]

    for index, shape_record in enumerate(reader.iterShapeRecords()):
        shape = shape_record.shape
        if shape.shapeType == 0 or not shape.points:
            dropped_null += 1
            continue
        raw = shape.__geo_interface__
        if raw["type"] == "LineString":
            rings = [raw["coordinates"]]
        elif raw["type"] == "MultiLineString":
            rings = list(raw["coordinates"])
        else:
            dropped_degenerate += 1
            continue

        converted: list[list[list[float]]] = []
        for ring in rings:
            points = [round_pair(float(pt[0]), float(pt[1])) for pt in ring]
            if len(points) < 2 or len({tuple(point) for point in points}) < 2:
                continue
            converted.append(points)
            total_parts += 1
            total_points += len(points)
            for lon, lat in points:
                bounds[0] = min(bounds[0], lon)
                bounds[1] = min(bounds[1], lat)
                bounds[2] = max(bounds[2], lon)
                bounds[3] = max(bounds[3], lat)
        if not converted:
            dropped_degenerate += 1
            continue

        properties: dict[str, Any] = {}
        for key, value in shape_record.record.as_dict().items():
            if isinstance(value, bytes):
                value = value.decode(encoding, errors="replace")
            elif isinstance(value, float) and not math.isfinite(value):
                value = None
            properties[key] = value

        geometry = (
            {"type": "LineString", "coordinates": converted[0]}
            if len(converted) == 1
            else {"type": "MultiLineString", "coordinates": converted}
        )
        features.append({"type": "Feature", "id": index, "properties": properties, "geometry": geometry})

    reader.close()

    if not features:
        raise SystemExit("The supplied drainage shapefile produced no usable geometry.")

    geometry_types = sorted({feature["geometry"]["type"] for feature in features})
    collection = {
        "type": "FeatureCollection",
        "features": features,
        "metadata": {
            "dataset_id": "drainage-network",
            "source_name": "Drainage_Network",
            "source_crs": crs_label,
            "target_crs": "EPSG:4326",
            "feature_count": len(features),
            "geometry_types": geometry_types,
            "bounds": bounds,
            "encoding": encoding,
        },
    }
    _write_json(output, collection, indent=None)

    report = {
        "source_dir": str(source_dir),
        "declared_feature_count": declared_count,
        "written_feature_count": len(features),
        "dropped_null_or_empty": dropped_null,
        "dropped_degenerate": dropped_degenerate,
        "geometry_types": geometry_types,
        "total_parts": total_parts,
        "total_vertices": total_points,
        "shape_type": f"{shape_type_code} ({shape_type_name})",
        "source_crs": crs_label,
        "declared_bbox": bbox,
        "written_bounds": bounds,
        "attribute_encoding": encoding,
        "attribute_fields": field_names,
        "output": str(output.relative_to(ROOT)),
        "output_bytes": output.stat().st_size,
        "output_sha256": _sha256(output),
    }
    print(json.dumps(report, indent=2))
    return report


# ===========================================================================
# ELEVATION (Arkavathi_Dem1.tif)
# ===========================================================================
def _hex_to_rgb(value: str) -> tuple[int, int, int]:
    value = value.lstrip("#")
    return int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16)


def build_elevation_classes(minimum: float, maximum: float) -> tuple[list[float], list[dict[str, Any]]]:
    """Equal-interval classes on rounded 100 m breaks that fully contain the data."""
    width = 100.0
    lower = math.floor(minimum / width) * width
    upper = math.ceil(maximum / width) * width
    if upper <= lower:
        upper = lower + width
    steps = int(round((upper - lower) / width))
    breaks = [lower + width * step for step in range(steps + 1)]
    if len(breaks) - 1 > len(ELEVATION_RAMP):
        raise SystemExit(
            f"Classification produced {len(breaks) - 1} classes but only {len(ELEVATION_RAMP)} ramp colours."
        )
    classes = []
    for index, (start, end) in enumerate(zip(breaks, breaks[1:])):
        classes.append({
            "index": index,
            "label": f"{int(start)}-{int(end)} m",
            "min": int(start),
            "max": int(end),
            "color": ELEVATION_RAMP[index],
        })
    return breaks, classes


def build_elevation(dem_path: Path, image_out: Path, manifest_out: Path) -> dict[str, Any]:
    try:
        import numpy as np
        from PIL import Image
    except ImportError as error:  # pragma: no cover - environment guard
        raise SystemExit(
            f"{getattr(error, 'name', 'numpy/Pillow')} is required for the elevation stage.\n"
            "  python scripts\\prepare_arkavathi_gis_data.py elevation"
        )

    if not dem_path.is_file():
        raise SystemExit(f"DEM not found: {dem_path}")

    source_image = Image.open(dem_path)
    width, height = source_image.size
    mode = source_image.mode
    tags = source_image.tag_v2

    nodata_tag = tags.get(42113)
    nodata = float(str(nodata_tag).strip()) if nodata_tag is not None else None
    pixel_scale = tags.get(33550)
    tiepoint = tags.get(33922)
    geokeys = tags.get(34735)
    geovalue_keys = list(tags.get(34736) or [])

    if mode != "F":
        raise SystemExit(f"Expected a single-band float raster, got mode {mode!r}")
    if pixel_scale is None or tiepoint is None:
        raise SystemExit("The DEM carries no ModelPixelScale / ModelTiepoint tags, so it is not georeferenced.")

    x_res = abs(float(pixel_scale[0]))
    y_res = abs(float(pixel_scale[1]))
    west = float(tiepoint[3])
    north = float(tiepoint[4])
    east = west + width * x_res
    south = north - height * y_res

    # GeographicTypeGeoKey (2048) carries the horizontal datum code.  A GeoKey
    # with location 0 holds its value inline; otherwise it indexes 34736.
    geodetic_code = None
    if geokeys:
        directory = list(geokeys)
        for offset in range(4, len(directory), 4):
            key_id, location, _count, value_or_offset = directory[offset:offset + 4]
            if key_id == 2048:
                if location == 0:
                    geodetic_code = int(value_or_offset)
                elif geovalue_keys:
                    geodetic_code = int(geovalue_keys[int(value_or_offset)])
                break
    crs_label = f"EPSG:{geodetic_code}" if geodetic_code else "unknown"

    array = np.array(source_image, dtype=np.float32)
    valid = np.isfinite(array)
    if nodata is not None:
        valid &= array != np.float32(nodata)
    values = array[valid]
    if values.size == 0:
        raise SystemExit("The DEM has no valid (non-NoData) pixels.")

    minimum = float(values.min())
    maximum = float(values.max())
    mean = float(values.mean())
    std = float(values.std())

    breaks, classes = build_elevation_classes(minimum, maximum)
    if minimum < breaks[0] or maximum > breaks[-1]:
        raise SystemExit("Classification range does not cover the valid elevation range.")

    palette = np.asarray([_hex_to_rgb(item["color"]) for item in classes], dtype=np.uint8)
    bucket = np.digitize(array, breaks[1:-1], right=False)
    rgba = np.zeros((height, width, 4), dtype=np.uint8)
    rgba[valid] = np.concatenate(
        [palette[bucket[valid]], np.full((int(valid.sum()), 1), 255, dtype=np.uint8)], axis=1
    )

    image_out.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(rgba, mode="RGBA").save(image_out, format="PNG", optimize=True)

    counts = np.bincount(bucket[valid], minlength=len(classes))
    for item, count in zip(classes, counts):
        item["pixel_count"] = int(count)
        item["percent_of_valid"] = round(100.0 * float(count) / float(values.size), 4)

    aux_path = Path(str(dem_path) + ".aux.xml")
    auxiliary: dict[str, str] = {}
    if aux_path.is_file():
        text = aux_path.read_text(encoding="utf-8", errors="replace")
        for key in ("STATISTICS_MINIMUM", "STATISTICS_MAXIMUM", "STATISTICS_MEAN",
                    "STATISTICS_STDDEV", "STATISTICS_VALID_PERCENT"):
            marker = f'<MDI key="{key}">'
            if marker in text:
                auxiliary[key] = text.split(marker, 1)[1].split("</MDI>", 1)[0].strip()

    units_note = (
        "The GeoTIFF encodes only horizontal GeoKeys (GTRasterTypeGeoKey and GeographicTypeGeoKey = "
        f"{crs_label}). No VerticalUnitsGeoKey, VerticalCSTypeGeoKey and no vertical unit metadata item "
        "are present, so the vertical unit is NOT declared by the file. The valid range "
        f"({minimum:.0f}-{maximum:.0f}) matches Arkavathi basin topography (Nandi Hills headwaters near "
        "1400 m down to the Cauvery confluence near 350 m) and the legacy band legend, so the values are "
        "interpreted and displayed as metres (m). This is a documented interpretation, not a file-declared datum."
    )

    manifest = {
        "dataset_id": "elevation-bands",
        "title": "Arkavathi Elevation Bands",
        "generated_by": "scripts/prepare_arkavathi_gis_data.py elevation",
        "generated_at": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat(),
        "source": {
            "path": str(dem_path),
            "file_name": dem_path.name,
            "size_bytes": dem_path.stat().st_size,
            "sha256": _sha256(dem_path),
        },
        "raster": {
            "width": width,
            "height": height,
            "band_count": 1,
            "data_type": "float32",
            "nodata": nodata,
            "crs": crs_label,
            "geotransform": [west, x_res, 0.0, north, 0.0, -y_res],
            "pixel_size_degrees": x_res,
            "pixel_size_arc_seconds": round(x_res * 3600.0, 6),
            "bounds": [west, south, east, north],
            "vertical_units": "m",
            "vertical_units_note": units_note,
            "statistics": {
                "min": round(minimum, 3),
                "max": round(maximum, 3),
                "mean": round(mean, 4),
                "std": round(std, 4),
                "valid_pixels": int(values.size),
                "total_pixels": int(array.size),
                "valid_percent": round(100.0 * float(values.size) / float(array.size), 3),
            },
            "auxiliary_approximate_statistics": auxiliary,
        },
        "classification": {
            "method": "equal-interval",
            "class_width": 100,
            "units": "m",
            "range": [int(breaks[0]), int(breaks[-1])],
            "breaks": [int(value) for value in breaks],
            "nodata_policy": (
                f"NoData pixels (value {nodata:g}) are written with alpha 0 and stay fully transparent."
                if nodata is not None else "No NoData value is declared."
            ),
            "coverage_note": (
                f"Exact valid minimum {minimum:.0f} m and maximum {maximum:.0f} m both fall inside the "
                f"{int(breaks[0])}-{int(breaks[-1])} m range, so no valid value is clipped or truncated."
            ),
            "classes": classes,
        },
        "output": {
            "image": image_out.name,
            "width": width,
            "height": height,
            "format": "PNG RGBA",
            "size_bytes": image_out.stat().st_size,
            "sha256": _sha256(image_out),
            "maplibre_source": {
                "type": "image",
                "coordinates": [[west, south], [west, north], [east, north], [east, south]],
            },
        },
    }
    _write_json(manifest_out, manifest)
    print(
        f"  elevation {minimum:.0f}-{maximum:.0f} m, {len(classes)} classes, "
        f"{manifest['raster']['statistics']['valid_percent']}% valid pixels"
    )
    return manifest


# ===========================================================================
# SOURCE MANIFEST
# ===========================================================================
def _describe(folder: Path, names: list[str]) -> list[dict[str, Any]]:
    files = []
    for name in names:
        path = folder / name
        if path.is_file():
            files.append({"file_name": name, "size_bytes": path.stat().st_size, "sha256": _sha256(path)})
    return files


def build_source_manifest(drainage_source: Path, dem_source: Path) -> dict[str, Any]:
    entry: dict[str, Any] = {
        "project": "Arkavathi River Pollution Assessment",
        "generated_at": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat(),
        "note": (
            "The supplied originals are read-only inputs and are never modified. Re-running the commands "
            "below regenerates every generated file from the same sources."
        ),
        "reproducible_commands": [
            "backend\\.venv\\Scripts\\python.exe scripts\\prepare_arkavathi_gis_data.py drainage",
            "python scripts\\prepare_arkavathi_gis_data.py elevation",
            "python scripts\\prepare_arkavathi_gis_data.py manifest",
        ],
        "datasets": [],
    }

    drainage_files = _describe(drainage_source, [f"Drainage_Network{ext}" for ext in DRAINAGE_COMPONENTS])
    if drainage_files:
        entry["datasets"].append({
            "dataset_id": "drainage-network",
            "panel_row": "Arkavathi River Data / Drainage Network",
            "frontend_layer_key": "drainage",
            "source_path": str(drainage_source),
            "source_files": drainage_files,
            "generated_outputs": [{"path": "frontend/public/gis/arkavathi/drainage-network.geojson"}],
            "legacy_source_preserved": {
                "path": "frontend/public/gis/arkavathi/drainage.geojson",
                "note": "Previous drainage renderer. Kept on disk, no longer referenced by the atlas layer.",
            },
        })

    dem_files = []
    if dem_source.is_file():
        stem = str(dem_source)[: -len(".tif")]
        for suffix in (".tif", ".tfw", ".tif.aux.xml", ".tif.ovr"):
            companion = dem_source if suffix == ".tif" else Path(stem + suffix)
            if companion.is_file():
                dem_files.append({
                    "file_name": companion.name,
                    "size_bytes": companion.stat().st_size,
                    "sha256": _sha256(companion),
                })
    if dem_files:
        entry["datasets"].append({
            "dataset_id": "elevation-bands",
            "panel_row": "Arkavathi River Data / Elevation Bands",
            "frontend_layer_key": "elevation",
            "source_path": str(dem_source),
            "source_files": dem_files,
            "generated_outputs": [
                {"path": "frontend/public/gis/arkavathi/elevation-dem1.png"},
                {"path": "frontend/public/gis/arkavathi/elevation-dem1.manifest.json"},
            ],
            "legacy_source_preserved": {
                "path": "frontend/public/gis/arkavathi/elevation-bands.geojson",
                "note": "Previous 7-band polygon layer. Kept on disk, no longer rendered.",
            },
        })

    _write_json(SOURCE_MANIFEST, entry)
    return entry


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("stage", choices=["drainage", "elevation", "manifest", "validate"])
    parser.add_argument("--source", type=Path, default=None,
                        help="Drainage folder or DEM file, depending on the stage.")
    parser.add_argument("--precision", type=int, default=7, help="Coordinate decimals for the drainage GeoJSON.")
    args = parser.parse_args()

    if args.stage == "drainage":
        build_drainage(args.source or DEFAULT_DRAINAGE_DIR, DRAINAGE_OUTPUT, args.precision)
    elif args.stage == "elevation":
        build_elevation(args.source or DEFAULT_DEM, ELEVATION_OUTPUT, ELEVATION_MANIFEST)
    elif args.stage == "manifest":
        build_source_manifest(DEFAULT_DRAINAGE_DIR, DEFAULT_DEM)
    else:
        for label, path in (
            ("drainage source", DEFAULT_DRAINAGE_DIR),
            ("DEM source", DEFAULT_DEM),
            ("drainage output", DRAINAGE_OUTPUT),
            ("elevation image", ELEVATION_OUTPUT),
            ("elevation manifest", ELEVATION_MANIFEST),
            ("source manifest", SOURCE_MANIFEST),
        ):
            state = "OK     " if path.exists() else "MISSING"
            print(f"{label:20s} {state} {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

