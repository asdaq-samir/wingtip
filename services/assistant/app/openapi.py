"""Writes this service's OpenAPI document to services/assistant/openapi.json,
the file apps/web/ generates its assistant types from (`npm run types`:
src/lib/api/assistant-schema.d.ts). Run it after changing a schema or a
route's signature:

    python -m app.openapi

services/assistant/tests/test_openapi.py fails until the committed file matches."""

import json
from pathlib import Path

from .main import app

OPENAPI_PATH = Path(__file__).resolve().parent.parent / "openapi.json"


def render() -> str:
    return json.dumps(app.openapi(), indent=2, sort_keys=True) + "\n"


if __name__ == "__main__":
    OPENAPI_PATH.write_text(render())
    print(f"wrote {OPENAPI_PATH}")
