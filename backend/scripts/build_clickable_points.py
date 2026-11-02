from __future__ import annotations

import argparse
import bisect
import json
import math
import re
import tempfile
import zipfile
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from xml.etree import ElementTree as ET

XLSX_NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"


def col_index(cell_ref: str) -> int:
    letters = re.match(r"[A-Z]+", cell_ref or "")
    if not letters:
        return 0
    value = 0
    for ch in letters.group(0):
        value = value * 26 + (ord(ch) - 64)
    return value - 1


def cell_value(cell: ET.Element, shared_strings: list[str] | None = None):
    cell_type = cell.attrib.get("t")
    if cell_type == "inlineStr":
        texts = [t.text or "" for t in cell.findall(f".//{XLSX_NS}t")]
        return "".join(texts)
    v = cell.find(XLSX_NS + "v")
    if v is None or v.text is None:
        return None
    raw = v.text
    if cell_type == "s":
        try:
            idx = int(raw)
            return shared_strings[idx] if shared_strings is not None else raw
        except (ValueError, IndexError):
            return raw
    if cell_type == "str":
        return raw
    try:
        number = float(raw)
        return int(number) if number.is_integer() else number
    except ValueError:
        return raw


def iter_xlsx_rows(xlsx_path: Path):
    with zipfile.ZipFile(xlsx_path) as zf:
        shared_strings: list[str] | None = None
        if "xl/sharedStrings.xml" in zf.namelist():
            root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
            shared_strings = []
            for si in root.findall(XLSX_NS + "si"):
                shared_strings.append("".join((t.text or "") for t in si.findall(f".//{XLSX_NS}t")))
        with zf.open("xl/worksheets/sheet1.xml") as stream:
            headers: list[str] | None = None
            for event, elem in ET.iterparse(stream, events=("end",)):
                if elem.tag != XLSX_NS + "row":
                    continue
                row_number = int(elem.attrib.get("r", "0") or 0)
                values: dict[int, object] = {}
                for cell in elem.findall(XLSX_NS + "c"):
                    values[col_index(cell.attrib.get("r", "A1"))] = cell_value(cell, shared_strings)
                if row_number == 1:
                    max_col = max(values.keys(), default=-1)
                    headers = [str(values.get(i, "")) for i in range(max_col + 1)]
                elif headers:
                    row = {headers[i]: values.get(i) for i in range(len(headers))}
                    yield row_number, row
                elem.clear()


def as_float(value):
    try:
        return None if value in (None, "") else float(value)
    except (TypeError, ValueError):
        return None


def as_int(value):
    try:
        return None if value in (None, "") else int(float(value))
    except (TypeError, ValueError):
        return None


def iso_dt(date_value, time_value) -> datetime | None:
    if not date_value or not time_value:
        return None
    try:
        return datetime.fromisoformat(f"{date_value}T{time_value}")
    except ValueError:
        return None


def haversine_m(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    radius = 6_371_008.8
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * radius * math.asin(min(1.0, math.sqrt(h)))


def row_payload(row_number: int, row: dict, workbook: str) -> dict:
    date_value = str(row.get("Date")) if row.get("Date") not in (None, "") else None
    time_value = str(row.get("Time")) if row.get("Time") not in (None, "") else None
    full_time = f"{date_value}T{time_value}" if date_value and time_value else None
    return {
        "source_row": row_number,
        "source_workbook": workbook,
        "time": full_time,
        "date": date_value,
        "time_of_day": time_value,
        "frame": as_int(row.get("FrameCnt")),
        "lat": as_float(row.get("Latitude")),
        "lon": as_float(row.get("Longitude")),
        "rel_alt_m": as_float(row.get("Rel_Alt")),
        "abs_alt_m": as_float(row.get("Abs_Alt")),
    }


def enrich_timed_day(day: int, xlsx_path: Path, day_flights: list[dict]) -> dict[str, list[dict]]:
    target_by_clip: dict[str, list[dict]] = {}
    for flight in day_flights:
        targets = []
        for i, playback in enumerate(flight.get("playback") or [], start=1):
            dt = datetime.fromisoformat(playback["time"])
            targets.append({
                "index": i,
                "target_dt": dt,
                "kml_time": playback["time"],
                "kml_lon": float(playback["lon"]),
                "kml_lat": float(playback["lat"]),
                "kml_abs_alt_m": as_float(playback.get("abs_alt_m")),
            })
        target_by_clip[flight["clip"]] = targets

    current_index = {clip: 0 for clip in target_by_clip}
    previous_row: dict[str, tuple[datetime, int, dict] | None] = {clip: None for clip in target_by_clip}
    matches: dict[str, list[dict | None]] = {
        clip: [None] * len(targets) for clip, targets in target_by_clip.items()
    }

    for row_number, row in iter_xlsx_rows(xlsx_path):
        clip = str(row.get("Source Video") or "")
        if clip not in target_by_clip:
            continue
        dt = iso_dt(row.get("Date"), row.get("Time"))
        if dt is None:
            continue
        targets = target_by_clip[clip]
        idx = current_index[clip]
        prev = previous_row[clip]
        while idx < len(targets) and targets[idx]["target_dt"] <= dt:
            target = targets[idx]
            candidates: list[tuple[datetime, int, dict]] = []
            if prev is not None:
                candidates.append(prev)
            candidates.append((dt, row_number, row))
            best_dt, best_row_number, best_row = min(
                candidates,
                key=lambda item: abs((item[0] - target["target_dt"]).total_seconds()),
            )
            payload = row_payload(best_row_number, best_row, xlsx_path.name)
            payload.update({
                "kml_time": target["kml_time"],
                "source_time_delta_ms": round((best_dt - target["target_dt"]).total_seconds() * 1000, 3),
                "kml_lon": target["kml_lon"],
                "kml_lat": target["kml_lat"],
                "kml_abs_alt_m": target["kml_abs_alt_m"],
            })
            matches[clip][idx] = payload
            idx += 1
            current_index[clip] = idx
        previous_row[clip] = (dt, row_number, row)

    # Finalize any target after the last source row for a clip with its final telemetry row.
    for clip, targets in target_by_clip.items():
        idx = current_index[clip]
        prev = previous_row[clip]
        while idx < len(targets):
            if prev is None:
                break
            target = targets[idx]
            best_dt, best_row_number, best_row = prev
            payload = row_payload(best_row_number, best_row, xlsx_path.name)
            payload.update({
                "kml_time": target["kml_time"],
                "source_time_delta_ms": round((best_dt - target["target_dt"]).total_seconds() * 1000, 3),
                "kml_lon": target["kml_lon"],
                "kml_lat": target["kml_lat"],
                "kml_abs_alt_m": target["kml_abs_alt_m"],
            })
            matches[clip][idx] = payload
            idx += 1
            current_index[clip] = idx

    result: dict[str, list[dict]] = {}
    for clip, rows in matches.items():
        if any(item is None for item in rows):
            missing = sum(item is None for item in rows)
            raise RuntimeError(f"Day {day} {clip}: failed to match {missing} sampled point(s) to XLSX telemetry")
        result[clip] = [item for item in rows if item is not None]
    return result


def enrich_day3(xlsx_path: Path, day_flights: list[dict]) -> dict[str, list[dict]]:
    target_by_clip: dict[str, list[tuple[float, float, float | None]]] = {
        f["clip"]: [
            (round(float(c[0]), 6), round(float(c[1]), 6), round(float(c[2]), 2) if c[2] is not None else None)
            for c in f.get("coordinates", [])
        ]
        for f in day_flights
    }
    idx_by_clip = {clip: 0 for clip in target_by_clip}
    matches: dict[str, list[dict]] = {clip: [] for clip in target_by_clip}

    for row_number, row in iter_xlsx_rows(xlsx_path):
        clip = str(row.get("Source Video") or "")
        if clip not in target_by_clip:
            continue
        idx = idx_by_clip[clip]
        targets = target_by_clip[clip]
        if idx >= len(targets):
            continue
        lon = as_float(row.get("Longitude"))
        lat = as_float(row.get("Latitude"))
        alt = as_float(row.get("Abs_Alt"))
        if lon is None or lat is None:
            continue
        key = (round(lon, 6), round(lat, 6), round(alt, 2) if alt is not None else None)
        if key != targets[idx]:
            continue
        payload = row_payload(row_number, row, xlsx_path.name)
        payload.update({
            "kml_time": None,
            "source_time_delta_ms": None,
            "kml_lon": lon,
            "kml_lat": lat,
            "kml_abs_alt_m": alt,
        })
        matches[clip].append(payload)
        idx_by_clip[clip] += 1

    for clip, targets in target_by_clip.items():
        if len(matches[clip]) != len(targets):
            raise RuntimeError(
                f"Day 3 {clip}: matched {len(matches[clip])}/{len(targets)} rendered vertices to XLSX source rows"
            )
    return matches


def finalize_flight_points(flight: dict, matched_rows: list[dict]) -> list[dict]:
    points: list[dict] = []
    total = len(matched_rows)
    cumulative = 0.0
    previous: tuple[float, float] | None = None
    first_time: datetime | None = None

    for i, source in enumerate(matched_rows, start=1):
        # The KML sample location is the displayed survey point; XLSX is the authoritative metadata row.
        lon = as_float(source.get("kml_lon"))
        lat = as_float(source.get("kml_lat"))
        if lon is None:
            lon = as_float(source.get("lon"))
        if lat is None:
            lat = as_float(source.get("lat"))
        if lon is None or lat is None:
            raise RuntimeError(f"{flight['id']} point {i}: missing GPS coordinate")
        if previous is not None:
            cumulative += haversine_m(previous[0], previous[1], lon, lat)
        previous = (lon, lat)

        source_time = source.get("time")
        elapsed = None
        if source_time:
            dt = datetime.fromisoformat(source_time)
            if first_time is None:
                first_time = dt
            elapsed = round((dt - first_time).total_seconds(), 3)

        point = {
            "point_id": f"{flight['id']}-P{i:04d}",
            "flight_id": flight["id"],
            "day": flight["day"],
            "flight_sequence": flight["sequence"],
            "clip": flight["clip"],
            "point_index": i,
            "point_count": total,
            "time": source_time,
            "date": source.get("date"),
            "time_of_day": source.get("time_of_day"),
            "frame": source.get("frame"),
            "lat": lat,
            "lon": lon,
            "rel_alt_m": source.get("rel_alt_m"),
            "abs_alt_m": source.get("abs_alt_m") if source.get("abs_alt_m") is not None else source.get("kml_abs_alt_m"),
            "source_row": source.get("source_row"),
            "source_workbook": source.get("source_workbook"),
            "source_time_delta_ms": source.get("source_time_delta_ms"),
            "elapsed_seconds": elapsed,
            "distance_from_start_m": round(cumulative, 2),
            "progress_pct": round(((i - 1) / max(1, total - 1)) * 100.0, 2),
            "detail_status": "Full timed telemetry" if flight["day"] >= 4 else "Day 3 spatial telemetry",
            "schema_note": (
                "Date, Time, FrameCnt, Relative Altitude and Absolute Altitude are available from the source workbook."
                if flight["day"] >= 4
                else "Day 3 source workbook contains Source Video, Latitude, Longitude and Absolute Altitude only; time, frame and relative altitude are not present in the supplied data."
            ),
        }
        points.append(point)
    return points


def build(zip_path: Path, data_dir: Path) -> dict:
    flights_path = data_dir / "flights.json"
    summary_path = data_dir / "summary.json"
    flights = json.loads(flights_path.read_text(encoding="utf-8"))
    summary = json.loads(summary_path.read_text(encoding="utf-8"))

    with tempfile.TemporaryDirectory(prefix="arkavathi_points_") as tmp:
        tmp_path = Path(tmp)
        with zipfile.ZipFile(zip_path) as zf:
            for day in range(3, 9):
                member = f"Output/Day_{day}.xlsx"
                zf.extract(member, tmp_path)

        all_point_features = []
        verification = {
            "days": {},
            "total_clickable_points": 0,
            "timed_full_detail_points": 0,
            "day3_spatial_points": 0,
            "max_source_time_delta_ms": 0.0,
        }

        for day in range(3, 9):
            day_flights = [f for f in flights if f["day"] == day]
            xlsx_path = tmp_path / "Output" / f"Day_{day}.xlsx"
            if day == 3:
                matches = enrich_day3(xlsx_path, day_flights)
            else:
                matches = enrich_timed_day(day, xlsx_path, day_flights)

            day_count = 0
            max_delta = 0.0
            for flight in day_flights:
                pts = finalize_flight_points(flight, matches[flight["clip"]])
                flight["points"] = pts
                # Playback becomes the same enriched point sequence for Days 4-8.
                if day >= 4:
                    flight["playback"] = pts
                day_count += len(pts)
                for point in pts:
                    delta = point.get("source_time_delta_ms")
                    if delta is not None:
                        max_delta = max(max_delta, abs(float(delta)))
                    all_point_features.append({
                        "type": "Feature",
                        "id": point["point_id"],
                        "properties": {
                            key: point[key]
                            for key in (
                                "point_id", "flight_id", "day", "flight_sequence", "clip",
                                "point_index", "point_count", "time", "date", "time_of_day", "frame",
                                "lat", "lon", "rel_alt_m", "abs_alt_m", "source_row", "source_workbook",
                                "source_time_delta_ms", "elapsed_seconds", "distance_from_start_m",
                                "progress_pct", "detail_status", "schema_note",
                            )
                        },
                        "geometry": {
                            "type": "Point",
                            "coordinates": [point["lon"], point["lat"], point["abs_alt_m"]],
                        },
                    })

            verification["days"][str(day)] = {
                "flights": len(day_flights),
                "clickable_points": day_count,
                "reported_track_points": sum((f.get("reported_points") or 0) for f in day_flights),
                "note": "Day 3 clickable points follow rendered KML vertices because the supplied Day 3 workbook has no time/frame columns." if day == 3 else "All reported timed KML samples matched to source XLSX telemetry rows.",
                "max_source_time_delta_ms": round(max_delta, 3),
            }
            verification["total_clickable_points"] += day_count
            if day == 3:
                verification["day3_spatial_points"] += day_count
            else:
                verification["timed_full_detail_points"] += day_count
            verification["max_source_time_delta_ms"] = max(
                verification["max_source_time_delta_ms"], max_delta
            )

        summary["clickable_points"] = verification["total_clickable_points"]
        summary["clickable_points_note"] = (
            f"{verification['timed_full_detail_points']:,} Day 4-8 timed points include source time/frame/relative and absolute altitude. "
            f"{verification['day3_spatial_points']:,} Day 3 clickable points include source video/GPS/absolute altitude; Day 3 time/frame/relative altitude were not supplied."
        )

        flights_path.write_text(json.dumps(flights, separators=(",", ":")), encoding="utf-8")
        summary_path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
        (data_dir / "track_points.geojson").write_text(
            json.dumps({"type": "FeatureCollection", "features": all_point_features}, separators=(",", ":")),
            encoding="utf-8",
        )
        verification["max_source_time_delta_ms"] = round(verification["max_source_time_delta_ms"], 3)
        (data_dir / "point_verification.json").write_text(json.dumps(verification, indent=2), encoding="utf-8")
        return verification


def main() -> None:
    parser = argparse.ArgumentParser(description="Build Google-Earth-style clickable survey points from Arkavathi XLSX telemetry")
    parser.add_argument("zip_path", type=Path, help="Output(2).zip or equivalent Arkavathi survey ZIP")
    parser.add_argument(
        "--data-dir",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "app" / "data",
        help="Dashboard data directory containing flights.json and summary.json",
    )
    args = parser.parse_args()
    report = build(args.zip_path.resolve(), args.data_dir.resolve())
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
