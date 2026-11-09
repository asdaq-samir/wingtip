# The assistant service

Every Claude call Wingtip Maps makes, split out of the planner (issue #535,
the owner's call of 2026-11-08). It holds the Anthropic key and the model
settings, and computes no figure: everything an answer rests on comes from
the planner's HTTP API, which asks the engine every rule.

## Generated code

`app/generated/` is written by `scripts/build/assistant-client.sh` (the
generator is `scripts/build/assistant_client.py`) and never by hand:

| File | From | What |
|---|---|---|
| `planner_models.py` | `services/planner/openapi.json` | Every planner schema as a pydantic model (datamodel-code-generator), every field optional |
| `planner_client.py` | `services/planner/openapi.json` | One typed function per planner operation answering JSON, its answer read into the models; a refusal or an answer not of the document's shape is `PlannerError` |
| `engine_tools.py` | `engine/contract/engine.schema.json` | Each rule the contract tags `"x-tool": true` as a Claude tool: its name, its description with its CFR or AIM source, its input schema |

The same run writes the planner's allow-list,
`services/planner/app/generated/engine_tools.py`, for its internal
`POST /api/engine/{name}`. Run it after the planner's document or the
contract changes and commit what it writes; `tests/test_generated.py` and
CI's test-assistant job fail while the committed files differ. To make a
rule a tool, tag its entry in the contract `"x-tool": true` and run the
script: no other code.

| Endpoint | What | Module |
|---|---|---|
| `POST /api/assistant` | The pilot's assistant: the SDK's tool runner over the planner's endpoints (the plan, the briefing, the Go / No-Go, a field's card, the nearest fields, a diversion, a proposed change) and the engine's tagged rules (altitudes, winds, reserves, density altitude, minimums, currency, alternates, holds, glide), streamed as NDJSON | `app/assistant.py`, `app/toolbox.py`, `app/rule_tools.py` |
| `POST /api/briefing/narrative` | The Brief's narrative of the nav log on screen: one streamed Messages call (`NARRATIVE_MODEL`, Haiku by default), as NDJSON `delta` lines, then `done` or `error`, so a cut-off briefing is never taken as whole | `app/narrative.py` |
| `POST /api/words/{notams,weather,risk,debrief,changes}` | A few sentences over the planner's sources (`POST /api/words/{kind}/sources` there), each citing what it rests on; a sentence with no source is dropped. `changes` diffs two briefings first, for the gateway's flight watch (a saved flight re-briefed every half hour up to departure, what changed mailed to the pilot) | `app/words.py` |
| `POST /api/checkpoint-notes/generate` | A "how to spot it" line for each checkpoint without one, streamed; the checkpoints and the notes are the planner's (`/api/checkpoint-notes/pending`, `/seed`) | `app/notes.py` |
| `POST /api/oral/question`, `/api/oral/grade` | The mock oral, over 14 CFR 61 and 91 and the AIM, fetched once into `data/raw/references` (`app/references.py`); `python -m app.oral_review` writes a CFI's review sheet | `app/oral.py` |
| `GET /` | Health: the service, the planner it asks, the models | `app/main.py` |

## How it is reached

The apps ask the same addresses as always, `/api/planner/...` on the
gateway. The gateway's `PlannerProxyController` checks the session, the
subscription and the day's allowance, then sends these paths here
(`isAssistant`) and the rest to the planner. The planner's internal
endpoints the assistant asks (`/api/words/{kind}/sources`,
`/api/checkpoint-notes/pending` and `/seed`, `/api/route-check`,
`/api/engine/{name}`, marked `x-internal: assistant`) are not in the
gateway's route table: no app reaches them.

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
