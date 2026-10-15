# Verification Record — Arkavathi Survey GIS Dashboard V1

The supplied `Output(2).zip` was parsed and cross-checked before this project was packaged.

## Source files found
- Day_3.xlsx
- Day_4.xlsx
- Day_5.xlsx
- Day_6.xlsx
- Day_7.xlsx
- Day_8.xlsx
- Projections/Day_3.kmz through Day_8.kmz
- Projections/Merged.kmz

## Confirmed totals
- Survey days: 6
- Flight clips: 118
- Excel source rows: 937,575
- Track points reported by Merged.kmz: 17,923
- Total flight distance reported by Merged.kmz: 104.94 km
- Recorded duration: 3 h 45 m 03 s (Day 4-Day 8)
- Absolute altitude range: 888.0 m to 1,187.6 m
- Spatial extent: longitude 77.221062 to 77.656467; latitude 12.950039 to 13.384389

## Schema check
Day 3 columns:
- Source Video
- Latitude
- Longitude
- Abs_Alt

Day 4-Day 8 columns:
- Source Video
- Date
- Time
- FrameCnt
- Latitude
- Longitude
- Rel_Alt
- Abs_Alt

This is why Day 3 duration/time/frame information is shown as unavailable instead of being invented.

## Geometry note
Merged.kmz reports 17,923 sampled track points. The actual rendered LineString geometries contain 17,794 coordinate vertices because some repeated sampled points are omitted/reduced in the KML path geometry. V1 preserves the source-reported 17,923 KPI and separately records rendered vertices for audit purposes.

## Distance note
Summing clip-level `Path length (m)` values gives approximately 104.946 km, while Merged.kmz reports 104.94 km. The 0.006 km difference is a sub-10-metre rounding/aggregation difference. The dashboard uses the source-reported 104.94 km as the headline KPI.
