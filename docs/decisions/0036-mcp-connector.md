# 0036. Wingtip reaches Claude and ChatGPT as the pilot's own connector

- **Date:** 2026-11-10
- **Status:** Accepted

## Context

Server-side Claude is off until there is a subscription to pay for it (the
owner, 2026-11-10). Pilots who already pay for Claude or ChatGPT can still
have an AI read Wingtip's planning, if Wingtip is a tool their AI calls
rather than a model Wingtip calls.

## Decision

Wingtip is an MCP connector a pilot adds to their own Claude or ChatGPT.
Their subscription pays for the model; Wingtip answers tool calls only, from
the planner and the engine. The MCP server lives in the planner
(`app/mcp`, the official MCP Python SDK); the gateway is its OAuth 2.1
authorization server (Spring Authorization Server, with dynamic client
registration and PKCE) behind the pilot's Wingtip sign-in, and fronts `/mcp`.
The tools are read-only but one, `save_flight`, which adds a flight and is
confirmed by the AI app before each call. No aviation figure is worked out
in the connector: each tool asks the planner's own endpoint.

## Consequences

The connector costs Wingtip the planner's work per call and no model calls;
a per-pilot rate limit keeps one connection from running that up. A tool's
answer leaves Wingtip only to the AI app the pilot connected. The tool list
is a reviewed contract (a snapshot test). Publishing it in Anthropic's and
OpenAI's directories, the production domain and the privacy review are the
owner's steps. The design and the sources checked are in
`docs/design/mcp-connector.md`.

The tools' own source (written by hand or generated) is compared with its
alternatives in [0039](0039-crash-and-mcp-boundaries.md).

## Source

The owner, 2026-11-10: "publish Wingtip as an MCP connector that pilots add
to their own Claude or ChatGPT. Their subscription pays for the model."
