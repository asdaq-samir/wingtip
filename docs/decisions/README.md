# Decision records

The standing product and engineering decisions the owner has made, one short page each, so a developer does not undo one by accident. Each page has the date, its status (accepted, or superseded by a later page), the context, the decision, what follows from it, and the owner's words where they are known. [CLAUDE.md](../../CLAUDE.md) holds the rules every session works by; these pages hold the reasons.

To change a decision, the owner says so in an issue (the `owner` label); then add a page that supersedes the old one and mark the old page "Superseded by NNNN", rather than editing history away.

| # | Decision | Date | Status |
|---|---|---|---|
| 0001 | [Every aviation rule lives once, in the Rust engine](0001-engine-is-the-home-of-rules.md) | 2026-11-03 | Accepted |
| 0002 | [Functional core, imperative shell, four layers](0002-functional-core-four-layers.md) | 2026-11-03 | Accepted |
| 0003 | [All new work follows the modular architecture](0003-modular-architecture.md) | 2026-11-09 | Accepted |
| 0004 | [Spring Boot for accounts, FastAPI and the engine for aviation; services split by job](0004-server-split.md) | 2026-11-06 | Accepted; the assistant superseded by 0041 |
| 0005 | [Code first, validate at the end, fewest and grouped pull requests](0005-code-first-waves-grouped-prs.md) | 2026-11-08 | Accepted |
| 0006 | [A wave goes live on the owner's stack before any lengthy test or CI](0006-live-first-testing.md) | 2026-11-08 | Accepted |
| 0007 | [Nothing is in production: break and rename freely](0007-break-freely-until-launch.md) | 2026-11-07 | Accepted |
| 0008 | [Warn, never limit](0008-warn-never-limit.md) | 2026-10-23 | Accepted |
| 0009 | [Altitudes are FL-045 on cruise controls and FL045 on the map](0009-flight-level-format.md) | 2026-10-20 | Accepted |
| 0010 | [No EMER button on the map](0010-no-emer-map-button.md) | 2026-11-08 | Accepted |
| 0011 | [With no airplane picked, never assume one](0011-no-assumed-airplane.md) | 2026-11-08 | Accepted |
| 0012 | [The Brief opens on its verdict](0012-verdict-first-brief.md) | 2026-11-08 | Accepted |
| 0013 | [A panel or control is never moved to another part of the screen unasked](0013-panels-never-moved-unasked.md) | 2026-10-22 | Accepted |
| 0014 | [One home per control](0014-one-home-per-control.md) | 2026-10-27 | Accepted, amended 2026-11-10 |
| 0015 | [Close goes back one level; no Back buttons](0015-close-goes-back.md) | 2026-10-22 | Accepted, amended 2026-11-10 |
| 0016 | [Stock components over hand-rolled ones](0016-stock-components.md) | 2026-10-28 | Accepted, amended 2026-11-10 |
| 0017 | [Discrete settings are menus or segmented controls, not sliders](0017-menus-not-sliders.md) | 2026-10-15 | Accepted |
| 0018 | [Panels are Liquid Glass sheets with detents; a throw moves one size](0018-liquid-glass-sheets.md) | 2026-10-15 | Accepted, amended 2026-11-10 (the web's sheet solid) |
| 0019 | [No explanatory footnotes on pilot screens](0019-no-explanatory-footnotes.md) | 2026-10-16 | Accepted |
| 0020 | [The app says "airplane"](0020-airplane-not-aircraft.md) | 2026-11-06 | Accepted |
| 0021 | [Labels are Title Case; the FAA's text is sentence case with codes kept](0021-title-case-labels.md) | 2026-10-23 | Accepted |
| 0022 | [The app is free for now](0022-free-app-for-now.md) | 2026-11-02 | Accepted |
| 0023 | [NOTAMs come from the SWIM feed; no FAA NOTAM API key](0023-notams-from-swim-only.md) | 2026-11-09 | Accepted |
| 0024 | [Dependabot opens no pull requests](0024-no-dependabot-prs.md) | 2026-11-09 | Accepted |
| 0025 | [Chart tiles, retina included, are palette PNGs](0025-palette-png-tiles.md) | 2026-11-08 | Accepted |
| 0026 | [The map has no OpenStreetMap layer](0026-no-openstreetmap.md) | 2026-09-21 | Accepted |
| 0027 | [Machine learning is scikit-learn only](0027-scikit-learn-only.md) | 2026-11-06 | Accepted |
| 0028 | [The database is plain Postgres](0028-plain-postgres.md) | 2026-11-08 | Accepted |
| 0029 | [The FPL sheet stays as it is; the nav log stays behind the ••• button](0029-fpl-sheet-as-is.md) | 2026-11-09 | Accepted |
| 0030 | [Controls never grow to reach 44 points](0030-nothing-grows-hit-areas.md) | 2026-10-22 | Accepted |
| 0031 | [Each platform may look its own best](0031-platform-looks.md) | 2026-11-04 | Accepted, amended 2026-11-10 |
| 0032 | [An architecture change updates the diagram too](0032-docs-include-diagrams.md) | 2026-11-07 | Accepted |
| 0033 | [One card rule and one scrolling rule on every platform](0033-one-card-rule-one-scroll-rule.md) | 2026-11-10 | Accepted |
| 0034 | [CI stays lean, and the guards hold it there](0034-ci-stays-lean.md) | 2026-11-10 | Accepted |
| 0035 | [The Claude features are off until the subscription is decided](0035-claude-off-until-subscription.md) | 2026-11-10 | Superseded by 0041 |
| 0036 | [Wingtip reaches Claude and ChatGPT as the pilot's own connector](0036-mcp-connector.md) | 2026-11-10 | Accepted |
| 0037 | [The order of a wave is enforced, not remembered](0037-order-enforced.md) | 2026-11-11 | Accepted |
| 0038 | [Web first; the phones on the owner's word](0038-web-first.md) | 2026-11-11 | Accepted |
| 0039 | [The crash pipeline's schedule and the MCP tools' source, weighed against their alternatives](0039-crash-and-mcp-boundaries.md) | 2026-11-12 | Accepted |
| 0040 | [The iPhone app's oldest iOS is 27, and the Watch's watchOS 27](0040-ios-27-floor.md) | 2026-11-12 | Accepted |
| 0041 | [The server's Claude features are taken out](0041-claude-taken-out.md) | 2026-11-12 | Accepted |
