# 0061. Wingtip inside Claude: a live view beside the chat, and the flight edited by tools

- **Date:** 2026-11-22
- **Status:** Accepted (the owner, 2026-11-22: "Do we have Claude connector
  for our app?", "Can claude open the app and make changes in it etc",
  "Can we claude open the app on the side as it works on it?", "No I want
  to go all the way now", "Only make changes to web for now")
- **Builds on:** 0036 (the connector) and 0041 (no model call on the server)

## Context

The connector (decision 0036) answered questions and saved a flight, in
text. The owner wants Claude to open Wingtip beside the chat and change
the flight there as it works, the pilot able to tap in it too, and the
result saved to their account. Claude renders interactive views for a
connector's tools through the MCP Apps extension.

What was read, on 2026-11-22, from the pages themselves:

- **The extension:** MCP Apps, SEP-1865, `io.modelcontextprotocol/ui`,
  specification **2026-01-26 (Stable)**
  ([ext-apps/specification/2026-01-26](https://github.com/modelcontextprotocol/ext-apps/tree/main/specification/2026-01-26);
  a `draft` folder beside it changes nothing used here). A tool names a
  `ui://` resource in `_meta.ui.resourceUri`; the resource is one HTML
  document, `text/html;profile=mcp-app`, with `_meta.ui.csp`
  (`resourceDomains`, `connectDomains`, `frameDomains`,
  `baseUriDomains`). The host renders it in a sandboxed iframe whose
  Content-Security-Policy it builds from those lists: `default-src
  'none'`, `script-src 'self' 'unsafe-inline'` and the resource domains,
  `connect-src 'self'` and the connect domains, nothing else; no
  `worker-src`, no `blob:`, no `wasm-unsafe-eval`. The view speaks
  JSON-RPC over `postMessage`: `ui/initialize`, then the host pushes
  `ui/notifications/tool-input` and `tool-result`; the view may call the
  server's tools (`tools/call`), `ui/update-model-context`, `ui/message`,
  `ui/open-link` and `ui/request-display-mode` (`inline`, `fullscreen`,
  `pip`). `structuredContent` is for the view, not the model's context;
  `content` is for the model.
- **The SDKs:** `@modelcontextprotocol/ext-apps` **2.0.4** (npm `latest`,
  2026-10-27; Claude's own quickstart verified 1.7.5, the 1.x line for the
  1.x TypeScript SDK), its `App`, and its React hooks (`useApp`). The
  official MCP Python SDK **2.3.0**, which the planner runs, has the
  extension in core: `mcp.server.apps.Apps`.
- **Claude's pages**
  ([MCP Apps](https://claude.com/docs/connectors/building/mcp-apps/getting-started.md),
  [display modes](https://claude.com/docs/connectors/building/mcp-apps/display-modes.md),
  [app tools](https://claude.com/docs/connectors/building/mcp-apps/app-tools.md),
  [supersession](https://claude.com/docs/connectors/building/mcp-apps/instance-supersession.md),
  [troubleshooting](https://claude.com/docs/connectors/building/mcp-apps/troubleshooting.md)):
  a view opens inline, in the side panel (reported as `fullscreen`) or
  full screen; `_meta.ui.preferredDisplayMode: "fullscreen"` on the
  resource asks for the side panel without a click (Claude's own key);
  the side panel and app tools are "available to a limited set of
  organizations". Claude mounts a new view for every tool call and
  unmounts none; a newer view of the same connector replaces the one in
  the side panel, and the old one returns to the conversation, so the
  newest should keep the say (a server-made key on a `BroadcastChannel`).
  A tool result over about 150,000 characters is written to a file and
  never reaches the view. Views are served from
  `{hash}.claudemcpcontent.com`; requests carry that `Origin`, and iOS
  sends no `Referer`. Views of a local (stdio) server render, but Claude
  calls app tools only for a remote connector.
- **The directory**
  ([submission](https://claude.com/docs/connectors/building/submission.md),
  [review criteria](https://claude.com/docs/connectors/building/review-criteria.md),
  [authentication](https://claude.com/docs/connectors/building/authentication.md),
  [testing](https://claude.com/docs/connectors/building/testing.md)):
  every tool a `title` and `readOnlyHint` or `destructiveHint`; read and
  write in separate tools; names of 64 characters at most; no
  instructions to the model in descriptions; actionable errors; OAuth 2.0
  (DCR or CIMD, S256 PKCE, the `https://claude.ai/api/mcp/auth_callback`
  callback and Claude Code's loopback one); an MCP App adds 3 to 5 PNG
  carousel screenshots at least 1000 px wide, each with its prompt; the
  `ui/open-link` targets may be listed as allowed link URIs; a local
  server needs a public HTTPS address (a tunnel) to be added by URL.

## Decision

1. **The live view is an MCP App served by the planner** (`app/mcp`,
   `ui://wingtip/flight`), its page the web's own build:
   `apps/web/claude-view.html` and `features/claude-view`, built into one
   self-contained file inside the app's build and served by the gateway at
   `/app/claude-view.html`, which the planner reads and serves as the
   resource. It reuses the web's figure strip (`FigureStrip`,
   `tripFigures`), the timeline's marks (`TimelineMark`), the grouped
   lists and the stock buttons. Its CSP names Wingtip's own origin alone
   (the chart's tiles); it asks for the side panel.
2. **No map library and no engine in the view.** The sandbox's CSP runs
   no worker and no WebAssembly, so MapLibre and the engine's `.wasm`
   cannot run there. The chart is a still picture: the FAA sectional's
   own tiles from Wingtip, placed by `lib/map/tileMath` (its new
   `fitZoom`), the course in the map's magenta as SVG. Every figure comes
   worked out by the planner and the engine, the strip's fuel
   (`strip_fuel`) among them; the pilot opens the flight in Wingtip, by
   its own address, for the map.
3. **The flight is handed in and back, never kept on the server.** Each
   edit tool takes the flight the last answer gave (the web's own address
   keys: route, fuel stops, altitude, departure time, procedures, fuel on
   board, airplane, the saved flight it came from), changes one thing,
   plans it again with `/api/plan` and answers it: the model reads a line
   of figures, the flight to pass on and its link; the view reads the
   rest. The planner stays stateless and holds no records (decisions
   0001-0004). A tap in the view calls the same tools through the host and
   tells the model the flight's new state (`ui/update-model-context`).
4. **Tools:** `show_flight`, `add_stop`, `remove_stop`, `move_stop`,
   `set_cruise_altitude`, `set_departure_time`, `change_approach` (load,
   activate, deactivate, remove, unsuspend and suspend the missed
   approach, through the engine's `procedures_read` and
   `procedures_write`), `add_fuel_stops`, `remove_fuel_stops`,
   `set_fuel_on_board`, `pick_airplane` change nothing kept: read-only,
   the read scope. `open_saved_flight` reads; `save_flight_plan` adds;
   `update_saved_flight` and `delete_saved_flight` are destructive (the
   host always asks); those three need `wingtip:flights` (named `wingtip:write` when this was written; renamed by the security review of 2026-11-22), which the pilot
   may now leave out on the consent page. Connected Apps says what each
   connection may do in the consent page's words.
5. **Not app tools.** Claude's app tools (tools registered in the view)
   would let Claude change the view directly, but they are limited to some
   organizations and change only the view's own state; the server's tools
   work in every host and keep the planner the one place a flight is
   planned. Revisit once app tools are generally available.
6. **Out of scope until the owner says:** the phones; turning the
   connector on in production (`MCP_ENABLED` stays false there).

## Consequences

- The view's file is 2.06 MB (React, Base UI, the strip and the timeline's
  module, the ext-apps client), read once a view opens; trimming it
  (the procedures and plan features' entries pull more than the view
  draws) is a follow-up.
- The view looks like Wingtip, not like Claude: it follows the host's
  light or dark theme, with the system's fonts, since the sandbox loads
  none of Wingtip's.
- A flight's tanks and fuel-stop marks are not kept by a saved flight
  (the gateway's picks are the address's `PICK_KEYS`); its procedures
  are.
- claude.ai reaches a connector from Anthropic's servers: the owner's
  live stack on the LAN is reached through a tunnel
  (docs/MCP-CONNECTOR.md).
