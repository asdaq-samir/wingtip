# The API reference

Every endpoint of the two services, with its parameters, answers and
descriptions, is in the service's OpenAPI document. The documents are
written from the code (FastAPI for the planner, springdoc
for the gateway), committed, and each held to its code by a test, so they
are never out of date the way a table in a README is.

| Service | Document | What it is |
|---|---|---|
| Planner | [services/planner/openapi.json](../../services/planner/openapi.json) | The flight, the chart tiles, the weather and live feeds, the briefing |
| Gateway | [services/gateway/openapi.json](../../services/gateway/openapi.json) | Accounts, sign-in, saved records, the public API |

To read them as a page, `scripts/build/api-reference.sh` renders each with
Redoc into `build/api-reference/` (planner.html, gateway.html),
in Docker. CI's docs job runs it too and keeps the result
as the `api-reference` artifact of the run. The pages are not committed:
GitHub shows HTML as source, and a rebuild changes the bytes.

To change what an endpoint says here, change its docstring, summary or
model in the code and regenerate the document (`python -m app.openapi` in
services/planner, `WRITE_OPENAPI=1 mvn -B test` in
services/gateway).
