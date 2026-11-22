package app.wingtipmaps.gateway.dto;

import java.time.Instant;
import java.util.List;
import org.jspecify.annotations.Nullable;

/**
 * One AI app connected through the connector (the MCP server), as You's
 * Connected Apps lists it: the connection's own id (what
 * DELETE /api/me/connections/{id} takes), the app's name as it registered,
 * the scopes granted and what they let it do in the pilot's words (the
 * consent page's, ConnectorSettings.SCOPE_WORDS), when its token was last
 * issued and until when it may be renewed. Never a token's value.
 */
public record ConnectionDto(
        String id,
        String app,
        @Nullable String scopes,
        List<String> can,
        @Nullable Instant renewedAt,
        @Nullable Instant until) {}
