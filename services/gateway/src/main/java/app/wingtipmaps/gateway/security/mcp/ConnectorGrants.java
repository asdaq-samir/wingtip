package app.wingtipmaps.gateway.security.mcp;

import app.wingtipmaps.gateway.dto.ConnectorGrantDto;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.security.oauth2.server.authorization.OAuth2Authorization;
import org.springframework.security.oauth2.server.authorization.OAuth2AuthorizationService;
import org.springframework.stereotype.Component;

/**
 * What a pilot granted the AI apps they connected (V40): each connection's
 * tokens and the consent behind it, kept under the pilot's id as the
 * principal (PilotPrincipalFilter). Forgotten with the account
 * (AccountService), as everything linked to it is
 * (docs/privacy-inventory.md); Spring's stores have no "every one of this
 * principal's", so the two rows are deleted by it here. The registered
 * clients stay: they are Claude's and ChatGPT's, no pilot's.
 */
@Component
public class ConnectorGrants {

    private final JdbcOperations jdbc;
    private final OAuth2AuthorizationService authorizations;
    private final LiveConnections kept;

    public ConnectorGrants(JdbcOperations jdbc, OAuth2AuthorizationService authorizations, LiveConnections kept) {
        this.jdbc = jdbc;
        this.authorizations = authorizations;
        this.kept = kept;
    }

    /**
     * Whether this very access token still stands: issued to the pilot
     * through this client, on a connection that is not removed (the
     * account deleted, a refresh token replayed), and itself neither
     * revoked nor run out. The planner asks on every MCP call, since its
     * JWTs are checked by signature alone and would otherwise outlive all
     * of that by up to 15 minutes (the security audit's L4). It asked
     * only whether the pilot had any live connection through the client
     * until the deep review of 2026-11-21: an access token revoked at
     * /oauth2/revoke, while its refresh token stood, or one of a second
     * connection removed beside a live one, still read as live. So the
     * token itself is looked for among the pilot's connections through the
     * client (V41's index on the pilot: a pilot's few rows), as an
     * introspection would (RFC 7662).
     *
     * <p>A live answer is kept by LiveConnections, for that token alone,
     * for at most a minute and never past the token's own expiry, and
     * forgotten the moment this app changes any of the pilot's
     * connections (a revoke, a rotation, a replay, the account deleted).
     */
    public boolean live(long pilotId, String clientId, String accessToken) {
        if (accessToken == null || accessToken.isBlank()) {
            return false;
        }
        if (kept.isLive(pilotId, clientId, accessToken)) {
            return true;
        }
        long seen = kept.changes();
        Optional<Instant> expiry = jdbc
                .queryForList(
                        "SELECT a.id FROM oauth2_authorization a JOIN oauth2_registered_client c"
                                + " ON c.id = a.registered_client_id WHERE a.principal_name = ? AND c.client_id = ?",
                        String.class,
                        Long.toString(pilotId),
                        clientId)
                .stream()
                .map(authorizations::findById)
                .filter(Objects::nonNull)
                .map(OAuth2Authorization::getAccessToken)
                .filter(token -> token != null
                        && token.isActive()
                        && MessageDigest.isEqual(bytes(token.getToken().getTokenValue()), bytes(accessToken)))
                .findFirst()
                .map(token -> Objects.requireNonNullElse(token.getToken().getExpiresAt(), Instant.MAX));
        if (expiry.isEmpty()) {
            return false;
        }
        kept.live(pilotId, clientId, accessToken, expiry.get(), seen);
        return true;
    }

    private static byte[] bytes(String value) {
        return value.getBytes(StandardCharsets.UTF_8);
    }

    /**
     * What the pilot granted, for their export: each connection (which
     * app, the scopes, when its token was first issued and until when it
     * may be renewed) and each consent (the scopes agreed to). Never a
     * token or a code.
     */
    public List<ConnectorGrantDto> of(long pilotId) {
        String principal = Long.toString(pilotId);
        List<ConnectorGrantDto> granted = new ArrayList<>(jdbc.query(
                "SELECT c.client_name, a.authorized_scopes, a.access_token_issued_at, a.refresh_token_expires_at"
                        + " FROM oauth2_authorization a JOIN oauth2_registered_client c ON c.id = a.registered_client_id"
                        + " WHERE a.principal_name = ? ORDER BY a.access_token_issued_at",
                (r, n) -> new ConnectorGrantDto(
                        r.getString(1),
                        "connection",
                        r.getString(2),
                        instant(r.getTimestamp(3)),
                        instant(r.getTimestamp(4))),
                principal));
        granted.addAll(jdbc.query(
                "SELECT c.client_name, x.authorities FROM oauth2_authorization_consent x"
                        + " JOIN oauth2_registered_client c ON c.id = x.registered_client_id WHERE x.principal_name = ?",
                (r, n) -> new ConnectorGrantDto(r.getString(1), "consent", r.getString(2), null, null),
                principal));
        return granted;
    }

    private static Instant instant(Timestamp at) {
        return at == null ? null : at.toInstant();
    }

    /** Ends every connection the pilot made: their tokens stop working at once. */
    public void forget(long pilotId) {
        String principal = Long.toString(pilotId);
        kept.forget(principal);
        jdbc.update(
                "DELETE FROM oauth2_spent_refresh_token WHERE authorization_id IN"
                        + " (SELECT id FROM oauth2_authorization WHERE principal_name = ?)",
                principal);
        jdbc.update("DELETE FROM oauth2_authorization WHERE principal_name = ?", principal);
        jdbc.update("DELETE FROM oauth2_authorization_consent WHERE principal_name = ?", principal);
        // Again after the rows are gone: an answer read between the first
        // forget and the delete is not kept either.
        kept.forget(principal);
    }
}
