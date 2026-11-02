# Production Hardening Report
## Arkavati River Pollution Assessment Project

### Scope reviewed
- Python backend/API and SQLite authentication/workflow stores
- React/TypeScript/Vite frontend source
- Institution, Nakshatech and CNNL role/permission model
- Task/review/final-approval/integration workflow
- Department repository/upload flow
- Video + SRT synchronization and industry-intelligence integration
- Production configuration, media handling and startup/backup/account operations

### Hardening applied
- Exact project title standardized to **Arkavati River Pollution Assessment Project**.
- Company display standardized to **Nakshatech**.
- Existing `auth.db` retained; account emails/password hashes remain intact.
- Session password hashing parameters strengthened for newly reset/created passwords.
- Production session lifetime made configurable.
- Secure-cookie behavior added for HTTPS/proxy deployments.
- CORS changed from arbitrary Origin reflection to an explicit allowlist/same-origin model.
- Proxy forwarding headers are trusted only when `ARKAVATI_TRUST_PROXY=true`.
- Production error responses no longer expose internal exception text by default.
- Security response headers added.
- Production server defaults to localhost so it can sit safely behind a reverse proxy/tunnel.
- Frontend production build can be served by the same Python origin; Vite dev server is not required in production.
- MP4 byte-range serving added for efficient seeking/streaming.
- Runtime showcase-video directory added outside frontend build assets.
- Runtime Video + SRT library added outside frontend build assets.
- Authenticated server-media pair endpoints added.
- Video + SRT UI enhanced with a Server Media Library selector: copy files, Refresh Library, Load Pair.
- Example API/token files sanitized; no live-looking frontend token/key is shipped in examples.
- Production account-management script added for listing users, renaming institutions, creating users and safely resetting passwords.
- Production setup, run, readiness-check and backup scripts added.
- Detailed deployment, credentials, media/data and user-training/workflow documentation added.

### Verification completed in this review environment
- Backend Python compilation: PASS.
- Backend test suite: **45 passed**.
- SQLite `PRAGMA integrity_check`: PASS.
- Required workflow/permission tables: PASS.
- Runtime media pair matching including uppercase `.SRT`/`.MP4`: PASS after hardening.
- Production API boot on an isolated local port: PASS.
- `/health`: HTTP 200, production service identity correct.
- Root API fallback: HTTP 200, project title correct.
- Secret scan of example configuration: PASS after sanitization.

### Verification that must run on the Windows deployment host
The review container could not complete `npm ci` because package-registry retrieval timed out. Therefore the final Windows production acceptance must run `PRODUCTION_SETUP.ps1`, which performs the locked `npm ci` install followed by `npm run build` (`tsc --noEmit && vite build`). Do not mark the deployment live until that build succeeds.

### Known go-live configuration item
The supplied database contains 12 institution placeholders (`Institution 01` ... `Institution 12`). This is intentional source data, not guessed university names. Replace each placeholder with the real participating institution name using `manage_users.py rename-institution` before production go-live.

### Accuracy principle retained
Industry candidates remain source-attributed. Generic industrial geometry is not promoted to a company name without defensible identity evidence, and a nearby industry candidate is not treated as proof of pollution. This safeguard is intentionally preserved for technical defensibility.
