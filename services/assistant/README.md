# The assistant service

Every Claude call Wingtip Maps makes, split out of the planner (issue #535,
the owner's call of 2026-11-08). It holds the Anthropic key and the model
settings, and computes no figure: everything an answer rests on comes from
the planner's HTTP API (`app/planner.py`), which asks the engine every rule.

| Endpoint | What | Module |
|---|---|---|
| `POST /api/assistant` | The pilot's assistant: the SDK's tool runner over the planner's endpoints (the plan, the briefing, the Go / No-Go, a field's card, the nearest fields, a hold, a diversion, a proposed change), streamed as NDJSON | `app/assistant.py` |
| `POST /api/briefing/narrative` | The Brief's narrative of the nav log on screen, streamed | `app/narrative.py` |
| `POST /api/words/{notams,weather,risk,debrief,changes}` | A few sentences over the planner's sources (`POST /api/words/{kind}/sources` there), each citing what it rests on | `app/words.py` |
| `POST /api/checkpoint-notes/generate` | A "how to spot it" line for each checkpoint without one, streamed; the checkpoints and the notes are the planner's (`/api/checkpoint-notes/pending`, `/seed`) | `app/notes.py` |
| `POST /api/oral/question`, `/api/oral/grade` | The mock oral, over 14 CFR 61 and 91 and the AIM, fetched once into `data/raw/references` (`app/references.py`); `python -m app.oral_review` writes a CFI's review sheet | `app/oral.py` |
| `GET /` | Health: the service, the planner it asks, the models | `app/main.py` |

## How it is reached

The apps ask the same addresses as always, `/api/planner/...` on the
gateway. The gateway's `PlannerProxyController` checks the session, the
subscription and the day's allowance, then sends these paths here
(`isAssistant`) and the rest to the planner. The planner's internal
endpoints the assistant asks (`/api/words/{kind}/sources`,
`/api/checkpoint-notes/pending` and `/seed`, `/api/route-check`) are not
in the gateway's route table: no app reaches them.

## Settings

From the environment (`app/settings.py`): `ANTHROPIC_API_KEY` (the SDK
reads it), `PLANNER_URL` (`http://planner:8000`), `ASSISTANT_MODEL`,
`ASSISTANT_EFFORT`, `ASSISTANT_FALLBACKS` (`1` only), `ORAL_MODEL`,
`WORDS_MODEL`, `CHECKPOINT_NOTE_MODEL`, `NARRATIVE_MODEL`, `DATA_DIR`.

## Running and checking

`docker compose up assistant` (port 8085 on this machine), or with the
whole stack. The image is built on `services/Dockerfile.base` and capped at
256 MB in both compose files; it sits at about 100 MB.

    scripts/dev/check.sh assistant          # ruff and pytest, in Docker
    python -m app.openapi                   # after a schema or route change; then npm run types in apps/web

The tests stand the model and the planner in (`tests/conftest.py`).
