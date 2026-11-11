package app.wingtipmaps.gateway.dto;

import java.time.Instant;
import org.jspecify.annotations.Nullable;

/**
 * An AI app the pilot connected through the connector (the MCP server),
 * as their export gives it: which app, whether this row is a connection
 * (its tokens) or the consent behind it, the scopes, when it was given and
 * until when it may be renewed. Never a token's value.
 */
public record ConnectorGrantDto(
        String app,
        String kind,
        @Nullable String scopes,
        @Nullable Instant at,
        @Nullable Instant until) {}
