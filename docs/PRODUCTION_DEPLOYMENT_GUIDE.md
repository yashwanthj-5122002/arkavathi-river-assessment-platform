# Production Deployment Guide
## Arkavati River Population Assessment Project

## Production architecture in this package

The hardened deployment uses one application origin:

```text
User browser
    |
    | HTTPS (recommended)
    v
Trusted reverse proxy / Cloudflare Tunnel / IIS / Nginx
    |
    | localhost HTTP
    v
Arkavati Python server :8766
    |-- serves frontend/dist
    |-- /api/... backend API
    |-- /videos/... runtime showcase videos with byte-range streaming
    |-- /api/v1/media/pairs/... authenticated Video/SRT library
    `-- SQLite/runtime project stores
```

The Python application binds to `127.0.0.1` by default in the production configuration. Do not expose the raw application port directly to the public internet; publish it behind a trusted HTTPS reverse proxy/tunnel.

## First deployment on Windows

1. Extract the package to a permanent location, for example:
   `E:\ARKAVATI_PRODUCTION_READY`
2. Install Python 3.10+ and Node.js LTS.
3. Open PowerShell in the application root.
4. Run:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
.\PRODUCTION_SETUP.ps1
```

Setup:
- creates production data folders;
- backs up the current auth database;
- creates/uses `backend\.venv`;
- installs Python requirements;
- applies workflow/permission migrations;
- compiles/checks backend code;
- installs the locked frontend dependencies with `npm ci`;
- runs the TypeScript/Vite production build;
- runs the production-readiness checker.

5. Review `config\production.env`.
6. Start production:

```powershell
.\RUN_PRODUCTION.ps1
```

7. On the same machine, open `http://127.0.0.1:8766` for local validation.

## HTTPS/reverse proxy configuration

When published at a final HTTPS URL, edit `config\production.env`:

```text
ARKAVATI_PUBLIC_URL=https://your-final-hostname.example
ARKAVATI_TRUST_PROXY=true
ARKAVATI_SECURE_COOKIES=auto
ARKAVATI_ALLOWED_ORIGINS=
```

Keep `ARKAVATI_ALLOWED_ORIGINS` empty for the recommended same-origin deployment. The application will add the configured public URL as an allowed origin and will issue Secure cookies when HTTPS is detected/configured.

Only enable `ARKAVATI_TRUST_PROXY=true` when requests truly come through a trusted proxy/tunnel; this prevents arbitrary clients from spoofing forwarded IP/scheme headers.

## Production security changes included

- strict CORS allowlist rather than reflecting any Origin;
- secure/HttpOnly session-cookie support and configurable SameSite/session lifetime;
- login throttling controls;
- forwarded-IP trust only when explicitly enabled;
- generic production 500 responses (internal trace stays server-side);
- anti-sniff, frame, referrer, permissions and cross-origin headers;
- HSTS when HTTPS is detected;
- external runtime media folders so large videos are not bundled into frontend builds;
- byte-range MP4 serving for browser seeking;
- sanitized example environment files (no live key should be stored in them);
- account-management utility that stores only password hashes in the database;
- database backup before setup/migration.

## API keys

Put browser/API keys in the production environment/build environment, not in committed example files. Frontend `VITE_*` values are embedded into the built browser bundle, so restrict browser keys at the provider level (HTTP referrer/API restrictions) and treat them as public client identifiers rather than server secrets.

For a changed Vite variable, rebuild the frontend using `PRODUCTION_SETUP.ps1` or `npm run build` in the frontend folder.

## Adding new Video + SRT data

Copy files to:

`production_data\video_srt_pairs\<DATE>\`

Then in the application: Street View -> Video + SRT -> Server Media Library -> Refresh Library -> Load Pair.

No frontend rebuild is needed for new media files.

## Adding showcase videos

Copy them to:

`production_data\showcase_videos\`

The `/videos/video-playlist.json` endpoint is generated dynamically.

## Daily operations

- Start: `RUN_PRODUCTION.ps1`
- Check: `CHECK_PRODUCTION.ps1`
- Backup: `BACKUP_PRODUCTION.ps1`
- Accounts: `OPEN_ACCOUNT_ADMIN.ps1`

## Accuracy and QA rules

The software can enforce deterministic workflow and preserve source-backed GIS identities, but no application can guarantee an external GIS/field source is always complete or current. Operational accuracy therefore depends on both software checks and source/field verification.

For industry intelligence:
- KIADB/OSM/registry identities should remain source-attributed;
- generic industrial context must not be converted into an invented company name;
- a mapped industrial candidate is not automatically evidence of pollution;
- source failures/timeouts must not be silently interpreted as “no industry exists”;
- field/scientific evidence should be used for pollution conclusions.

## Production acceptance checklist

Before go-live verify:
- `CHECK_PRODUCTION.ps1` has no FAIL results.
- `frontend\dist\index.html` exists.
- all 12 placeholder institution names are replaced with real participating institution names.
- known login accounts can authenticate through their correct portals.
- Institution -> correction -> resubmission -> technical approval -> final approval -> CNNL approved view works end-to-end.
- repository department access/passkeys have been tested.
- one known Video/SRT pair produces the expected route and industry candidates.
- backup script creates a readable backup archive.
- HTTPS final hostname works and the session cookie is Secure.
- secrets/credential text files are not present in the deployment package.
