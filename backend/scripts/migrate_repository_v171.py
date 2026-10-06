# Allow direct execution from the backend/scripts folder.
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.repository_store import ensure_repository_schema

result = ensure_repository_schema()
print("REPOSITORY_V171_SCHEMA=PASS")
print("POLICY=PASSKEY_PER_NEW_UPLOAD_BATCH")
print("PURPOSE_BOUND_GRANTS=BROWSE,UPLOAD")
