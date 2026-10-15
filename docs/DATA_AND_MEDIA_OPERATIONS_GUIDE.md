# Data and Media Operations Guide
## Arkavati River Pollution Assessment Project

## Production folders

All large operational media is kept outside the frontend source/build so new files can be added without rebuilding the application.

### Video + SRT library
Copy pairs into:

`production_data\video_srt_pairs\<DATE>\`

Example:

```text
production_data\video_srt_pairs\23-08-26\DJI_0008.MP4
production_data\video_srt_pairs\23-08-26\DJI_0008.SRT
```

Segmented video names are supported. Example:

```text
DJI_0015-006.MP4
DJI_0015.SRT
```

The pairing rule first looks for the exact same basename. If that is not available, it accepts a video basename beginning with the SRT basename followed by `-`.

After copying files:

1. No restart/rebuild is normally required.
2. Log into the application.
3. Open Street View -> Video + SRT.
4. Open the upload/setup panel.
5. In Server Media Library click Refresh Library.
6. Select the pair and click Load Pair.
7. Confirm MAP SYNC READY before playback/testing.

### Showcase videos
Copy approved showcase videos into:

`production_data\showcase_videos\`

The playlist is generated dynamically at runtime. Do not put large MP4 files inside `frontend\public\videos`.

### Imports
Use `production_data\imports\` as an operator staging area for approved import packages. Do not directly overwrite runtime databases with unknown files.

### Backups
Run `BACKUP_PRODUCTION.ps1`. Backups are created under `production_data\backups\`.

## Video/SRT quality checks

Before operational use, verify:

- Video and SRT belong to the same flight/segment.
- SRT contains valid latitude/longitude data.
- Playback reaches MAP SYNC READY.
- Route geometry visually agrees with the expected survey corridor.
- Fast scrubbing can temporarily move the UI ahead of discovery; for demonstration, allow discovery to complete and use normal playback.
- Industry names are interpreted according to source/identity status; unverified industrial context must remain unverified.

## Institution and repository attachments

Institution records support evidence attachments. Department Data Hub/repository files use the project's repository workflow and department authorization/passkey mechanism. Use the application upload screens rather than manually placing documents into `backend\runtime`.

## Do not modify manually

Do not manually edit:

- `backend\runtime\auth.db`
- generated hashes/sessions
- workflow tables
- production `frontend\dist`

Use the application's actions or supplied administration scripts so audit/workflow consistency is retained.
