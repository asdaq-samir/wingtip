# 0028. The database is plain Postgres

- **Date:** 2026-11-08
- **Status:** Accepted

## Context

The pgvector image was there for a briefing agent's memory that was removed on 2026-11-06, and nothing else used the extension.

## Decision

The database runs on plain `postgres:18-trixie` (bookworm until 2026-11-09, when every image moved to one Debian), pinned by digest, locally and in the server's compose file.

## Consequences

No vector extension; reintroduce it only with a feature that needs it.

## Source

Branch claude/plain-postgres (#548), commit e3b7e4eb.
