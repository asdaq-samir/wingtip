"""The Wingtip connector: an MCP server a pilot adds to their own Claude
or ChatGPT (docs/design/mcp-connector.md). Their subscription pays for
the model; this only answers tool calls, each from the planner's own
endpoints and the engine's rules, for the pilot signed in through the
gateway's authorization server.

- server: the MCP SDK's server, its Streamable HTTP routes and the
  protected resource metadata, mounted by app.main.
- auth: the gateway's tokens checked (issuer, audience, signature).
- calls: who is asking, the rate limit and the scope, and a planner
  refusal turned into words a pilot can act on.
- records: the pilot's airplanes and flights, asked of the gateway.
- airport_tools, weather_tools, flight_tools, pilot_tools: the tools, by group.

Nothing is imported here: the generated planner calls
(app.generated.planner_calls) import app.mcp.calls, and a package that
imported its server on import made those calls and the tools that use
them fail to import first on their own (a circular import). app.main
includes server.router.
"""
