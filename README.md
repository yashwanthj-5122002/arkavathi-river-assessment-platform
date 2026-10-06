# Arkavati River Population Assessment Project
## Production-ready project portal

This package contains the hardened production deployment of the Arkavati project application: Institution/University data capture, Nakshatech review/approval, CNNL approved-output monitoring, project GIS, repository, tasks/workflows, scientific records and Video + SRT industry intelligence.

Start here:

1. Read `docs/PRODUCTION_DEPLOYMENT_GUIDE.md`.
2. Run `PRODUCTION_SETUP.ps1` once on the production machine.
3. Replace the 12 placeholder institution names using `backend/scripts/manage_users.py`.
4. Put operational Video + SRT files under `production_data/video_srt_pairs/<DATE>/`.
5. Run `RUN_PRODUCTION.ps1`.
6. Train users with `docs/USER_TRAINING_AND_WORKFLOW_GUIDE.md`.

Important operational documents:
- `docs/PRODUCTION_DEPLOYMENT_GUIDE.md`
- `docs/USER_TRAINING_AND_WORKFLOW_GUIDE.md`
- `docs/DATA_AND_MEDIA_OPERATIONS_GUIDE.md`
- `docs/CREDENTIALS_AND_ACCESS_GUIDE.md`

The existing `backend/runtime/auth.db` is preserved so existing account/password hashes remain valid. Plaintext credentials are intentionally not bundled.
