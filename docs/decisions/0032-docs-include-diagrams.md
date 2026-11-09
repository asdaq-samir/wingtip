# 0032. An architecture change updates the diagram too

- **Date:** 2026-11-07
- **Status:** Accepted

## Context

The prose docs and the architecture SVG drifted apart.

## Decision

"Update the docs including svg": a change that adds, removes or renames a service, crate, app or outside source edits `docs/architecture-*.drawio` and re-exports the `.svg` with the `rlespinasse/drawio-export` image.

## Consequences

A docs check that passes on the Markdown alone is not enough.

## Source

The owner, 2026-11-07; docs/README.md, The diagrams.
