# Demo Guide

## What to show first
1. Open the dashboard at `http://localhost:5173`.
2. Point out that every headline value comes from the currently supplied Day 3-Day 8 survey dataset.
3. Use the Day 3-Day 8 filter buttons to switch map coverage on/off.
4. Click a colored flight line or Start/End marker. The right panel shows the exact source clip, coordinates, altitude, distance and timing fields available for that flight.
5. For Day 4-Day 8 flights, use the Play button on the map to replay the timestamped `gx:Track` trajectory. Day 3 does not contain time/frame fields, so it is shown as geometry-only rather than fabricated playback time.
6. Scroll to the daily distance and clip-count charts.
7. Open Flight Explorer and select different source videos.
8. End at Data Readiness. This section is the request list for the Civil/GIS teams.

## Recommended presentation wording
“Based on the data currently available, I have visualized the complete Day 3 to Day 8 drone survey evidence: 118 source flight clips, 937,575 telemetry rows, the flight paths and start/end points, 104.94 km of reported flight distance, altitude information and the recorded timeline where timestamps are available. I have not inserted the example Civil KPI values from the reference images because the underlying Civil datasets have not yet been provided. The dashboard is already structured for those modules; once the listed data is supplied, the same system can populate river survey, structures, drains/outfalls, water sampling, critical locations, institution progress and remedial-measure views.”

## Data to request immediately
- Arkavathi River and tributary alignment GIS layer.
- Planned survey reach/length or planned survey GIS line.
- 12-institution allocation by watershed/reach, preferably with GIS boundaries.
- River/drain field register with location ID, chainage, coordinates, width, depth, levels and condition.
- Structure inventory with IDs, GPS, type, dimensions, condition and hydraulic status.
- Drain/outfall inventory with IDs, GPS, source/type, connectivity and flow condition.
- Water-sampling register with sample IDs, locations, institution, date/status and report reference.
- Critical-location register with category, problem, priority, action and status.
