from __future__ import annotations

# Allow direct execution from the backend/scripts folder.
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from app.auth_store import ensure_initialized  # noqa: E402

result = ensure_initialized()
print(f"AUTH_DB={result['db']}")
print(f"CREDENTIALS_FILE={result['credentials']}")
print(f"CREATED_USERS={result['created_users']}")
print("AUTH_INIT=PASS")
