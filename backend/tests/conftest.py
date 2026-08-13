"""Root test configuration. Runs the suite in the `test` environment and makes
the `app` package importable when pytest is invoked from the backend directory."""

from __future__ import annotations

import os
import sys
from pathlib import Path

os.environ.setdefault("APP_ENV", "test")

_BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(_BACKEND_ROOT))
