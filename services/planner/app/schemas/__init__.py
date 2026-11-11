"""Every shape this service sends, as Pydantic models, one module per router.

FastAPI validates each response against its model and publishes them all
in /openapi.json; apps/web/ generates its TypeScript types from that document
(`npm run types`), so a field renamed here is a compile error there
rather than a silent `undefined` at runtime.

Each model lives in exactly one module: `app.schemas.<router>` (named after
its module in app.routers) holds the models that router alone uses, and
`app.schemas.common` those two or more routers share, or that app.main,
app.figures.schemas and app.gonogo.schemas build on. A router's module
imports only from common, never from another router's. Import a model from
the module that owns it; this package re-exports nothing. The streamed
NDJSON messages live with their routers (NavLogMessage in plan,
DetectMessage in chart): no route "returns" them, so app.main adds their
unions to the OpenAPI components by hand.
"""
