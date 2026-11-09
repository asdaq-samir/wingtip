"""The assistant service: every Claude call the app makes, out of the
planner (issue #535, the owner's split of 2026-11-08). It holds the
Anthropic key and the model settings (app.settings) and computes no
figure: what each answer rests on comes from the planner's HTTP API
(app.generated.planner_client, generated from its OpenAPI document), which
asks the engine every rule.

- POST /api/assistant: the pilot's assistant, Claude's tool runner over
  the planner's endpoints and the engine's tagged rules, streamed
  (app.assistant, app.toolbox, app.rule_tools).
- POST /api/briefing/narrative: the Brief's narrative of the nav log on
  screen, streamed (app.narrative).
- POST /api/words/{notams,weather,risk,debrief,changes}: a few sentences
  over the planner's sources, each citing what it rests on (app.words).
- POST /api/checkpoint-notes/generate: a "how to spot it" line for each
  checkpoint without one, streamed, kept at the planner (app.notes).
- POST /api/oral/question, /api/oral/grade: the mock oral, over the
  regulations and the AIM it fetches itself (app.oral, app.references).

The browser reaches these only through the gateway, which routes them
here under the same /api/planner/... addresses the apps have always
asked (PlannerProxyController), and checks the subscription and the
day's allowance first."""
import logging

from fastapi import FastAPI
from fastapi.openapi.utils import get_openapi
from pydantic import BaseModel, TypeAdapter

from . import assistant, narrative, notam_rank, notes, oral, tracing, words
from .schemas import STREAM_MESSAGES
from .settings import get_settings

logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Wingtip Maps assistant")

for module in (assistant, narrative, words, notam_rank, notes, oral):
    app.include_router(module.router)

# Traces, where an OTLP endpoint is set (app.tracing).
tracing.instrument(app)


class Index(BaseModel):
    """What the health check reads: the service, the models it asks, and
    the planner it asks for figures."""

    service: str
    planner_url: str
    models: dict[str, str]


@app.get("/")
def index() -> Index:
    s = get_settings()
    return Index(service="assistant", planner_url=s.planner_url, models={
        "assistant": s.assistant_model, "oral": s.oral_model, "words": s.words_model,
        "checkpoint_notes": s.checkpoint_note_model, "narrative": s.narrative_model})


def _openapi() -> dict:
    """The document, with the streams' line unions no route returns
    published under their own names, as the planner's is."""
    if app.openapi_schema:
        return app.openapi_schema
    document = get_openapi(title=app.title, version=app.version, routes=app.routes)
    components = document.setdefault("components", {}).setdefault("schemas", {})
    for name, union in STREAM_MESSAGES.items():
        schema = TypeAdapter(union).json_schema(mode="serialization", ref_template="#/components/schemas/{model}")
        components.update(schema.pop("$defs", {}))
        components[name] = schema
    app.openapi_schema = document
    return document


app.openapi = _openapi
