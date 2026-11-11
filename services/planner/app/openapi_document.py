"""The planner's OpenAPI document as app.main serves it and app.openapi
writes it: FastAPI's own, plus the NDJSON stream message unions. No route
returns those, so FastAPI would never publish them, and apps/web/ needs
them typed as much as any JSON response. Moved out of app.main as it is,
to keep that file to its wiring."""

from collections.abc import Callable

from fastapi import FastAPI
from fastapi.openapi.utils import get_openapi
from pydantic import TypeAdapter

from .schemas.chart import DetectMessage
from .schemas.plan import NavLogMessage

# The unions no route returns, published into the OpenAPI components so
# apps/web/ gets a TypeScript type for each stream.
STREAM_MESSAGES = {"NavLogMessage": NavLogMessage, "DetectMessage": DetectMessage}


def with_streams(app: FastAPI) -> Callable[[], dict]:
    """The `app.openapi` for `app`: its document, built once and kept."""

    def document() -> dict:
        if app.openapi_schema:
            return app.openapi_schema
        built = get_openapi(title=app.title, version=app.version, routes=app.routes)
        components = built.setdefault("components", {}).setdefault("schemas", {})
        for name, union in STREAM_MESSAGES.items():
            piece = TypeAdapter(union).json_schema(mode="serialization", ref_template="#/components/schemas/{model}")
            components.update(piece.pop("$defs", {}))
            components[name] = piece
        app.openapi_schema = built
        return built

    return document
