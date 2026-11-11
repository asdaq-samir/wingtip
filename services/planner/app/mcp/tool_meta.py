"""What each tool says of itself to Claude and ChatGPT, beyond its name
and schema. Both directories require the hints set explicitly on every
tool (claude.com/docs/connectors/building/review-criteria: a title and
readOnlyHint or destructiveHint; developers.openai.com/apps-sdk/reference:
readOnlyHint, destructiveHint and openWorldHint, each true or false). Read
tools run without asking each time; a write is confirmed by the pilot.

openWorldHint is false throughout: every tool reads Wingtip's own data
sets and the pilot's own account, a bounded set, not the open web.
securitySchemes in _meta is OpenAI's per-tool mirror of the OAuth scope a
tool needs, for clients that read only _meta."""

from mcp.types import ToolAnnotations

from .calls import READ, WRITE


def read_only(title: str) -> ToolAnnotations:
    return ToolAnnotations(title=title, read_only_hint=True, destructive_hint=False, idempotent_hint=True, open_world_hint=False)


def additive(title: str) -> ToolAnnotations:
    """A write that adds and never overwrites or deletes: not destructive
    (OpenAI's word is for deletions, overwrites and irreversible sends),
    and not read-only, so both hosts ask the pilot before each call."""
    return ToolAnnotations(title=title, read_only_hint=False, destructive_hint=False, idempotent_hint=False, open_world_hint=False)


READS = {"securitySchemes": [{"type": "oauth2", "scopes": [READ]}]}
WRITES = {"securitySchemes": [{"type": "oauth2", "scopes": [READ, WRITE]}]}
