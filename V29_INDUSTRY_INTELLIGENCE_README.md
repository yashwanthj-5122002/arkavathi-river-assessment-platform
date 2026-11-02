# Arkavathi V29.2 - SRT Corridor Industry Intelligence

## What this integration adds

V29.2 keeps the existing Video + SRT frame-locked satellite-map synchronization and adds automatic industry discovery around the SRT flight corridor.

When a valid Video + SRT pair is started:

1. The existing SRT parser supplies the complete `{time, lat, lng}` route.
2. V29 samples the route and requests nearby industrial features.
3. KIADB is queried first when a KIADB WFS or GeoJSON service is configured.
4. OpenStreetMap/Overpass is used as the operational fallback.
5. Every candidate is assigned its nearest SRT sample and nearest video timestamp.
6. Automatic candidates appear on the satellite map and in the **V29.2 Industry Intelligence** panel below the Street View / Video+SRT workspace.
7. **Video evidence** seeks the already uploaded local video to that candidate's nearest SRT timestamp.
8. Results are stored in the existing SQLite database in dedicated V29 tables.


## V28 compatibility

This V29.2 package is specifically merged on top of the installed V28/V28.1 Industry Intelligence build. It preserves:

- V28 manual **Mark Industry** capture from synchronized Video+SRT.
- Captured frame evidence and observation records.
- V28 observation map layer and visibility toggle.
- The standalone **Industry Intelligence** sidebar page and CSV export.
- V25 frame-locked GPS alignment and V27 in-app fullscreen behavior.

V29.2 adds a second, separate **automatic candidate** layer and panel; it does not replace the V28 observation workflow.

## Evidence wording

V29 deliberately calls results **industry candidates**. Spatial proximity to the drone route, river, drainage, or a suspected outfall does not establish that a company is a pollution source. Confirmation requires video, field, laboratory, regulatory, or other evidence.

## New backend endpoints

- `GET /api/v1/industry/status`
- `GET /api/v1/industry/latest`
- `POST /api/v1/industry/discover`

The discover request accepts:

```json
{
  "video_name": "DJI_0003.MP4",
  "srt_name": "DJI_0003.SRT",
  "radius_m": 1000,
  "include_osm": true,
  "route": [
    {"time": 0.0, "lat": 13.025340, "lng": 77.526959}
  ]
}
```

## KIADB connector

The exact hidden service URL behind the public KIADB GIS portal is intentionally **not hardcoded**. Configure one of these options in `backend/.env`.

### Option A - WFS

```env
ARKAVATHI_KIADB_WFS_URL=https://<actual-kiadb-map-service>/wfs
ARKAVATHI_KIADB_WFS_LAYER=<actual-industrial-plot-layer>
ARKAVATHI_KIADB_WFS_VERSION=2.0.0
```

### Option B - GeoJSON/JSON endpoint

```env
ARKAVATHI_KIADB_GEOJSON_URL=https://<actual-service>?bbox={bbox}
```

Supported URL placeholders: `{south}`, `{west}`, `{north}`, `{east}`, `{bbox}`.

A ready-to-copy template is provided at `backend/.env.industry-v29.example`.

Until the official KIADB WFS/GeoJSON endpoint is captured, V29 remains fully testable using the OpenStreetMap/Overpass fallback. The UI clearly identifies the source of every result.

## How to test V29 with your sample pair

1. Start backend:

```powershell
cd "E:\ARKAVATHI_FULL_AUTH\backend"
.\.venv\Scripts\Activate.ps1
python -m app.simple_server
```

2. Start frontend in a second PowerShell:

```powershell
cd "E:\ARKAVATHI_FULL_AUTH\frontend"
npm run dev
```

3. Open `http://localhost:5173/#/street-view`.
4. Select **Video + SRT**.
5. Upload the matching `DJI_0003.MP4` and `DJI_0003.SRT` files.
6. Click **Start**.
7. The existing satellite marker should move exactly as before.
8. V29 automatically scans the SRT corridor on the first playback start.
9. Scroll below the map/video pair to **V29.2 Industry Intelligence**. The existing **Industry Intelligence** sidebar page remains the V28 observation/verification/CSV workspace and is intentionally preserved.
10. Check candidate counts, source, route distance, nearest video time, and map markers.
11. Click **Locate** to focus a candidate on the satellite map.
12. Click **Video evidence** to seek the currently uploaded video to the linked SRT timestamp.

## Expected source status before KIADB endpoint configuration

- KIADB: `CONNECTOR READY`
- OpenStreetMap: `FALLBACK ACTIVE` after discovery

After the official KIADB map-service URL/layer is configured and the backend is restarted, KIADB records are queried first and are displayed with KIADB plot/allottee metadata when those fields exist in the service response.

## SQLite tables added

- `industry_discovery_runs`
- `industry_candidates`

Existing auth, workflow, scientific, Google Street View, Video + SRT, and project tables are not replaced.

## Supplied Output.zip

The supplied `Output/Projections/*.kmz` files contain survey flight paths (LineString/Point geometry), not a verified river polygon/centerline. Therefore V29.2 calculates distance from the **SRT flight corridor**. A later river layer can add industry-to-river, drainage, upstream/downstream, and suspected-outfall relationships without changing this V29 data model.
