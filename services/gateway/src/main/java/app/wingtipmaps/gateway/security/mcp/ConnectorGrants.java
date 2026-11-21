package app.wingtipmaps.gateway.security.mcp;

import app.wingtipmaps.gateway.dto.ConnectorGrantDto;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
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
     * Whether the pilot still has a live connection through this client:
     * one whose tokens are neither revoked (disconnected, or a refresh token
     * replayed) nor run out, and gone with the account. The planner asks
     * on every MCP call, since its JWTs are checked by signature alone and
     * would otherwise outlive both by up to 15 minutes (the security
     * audit's L4). By V41's index on the pilot, a pilot's few rows.
     *
     * <p>A live answer is kept by LiveConnections for at most a minute and
     * never past the first of its tokens' own expiries, and forgotten the
     * moment this app changes any of the pilot's connections (a revoke, a
     * rotation, a replay, the account deleted): the check stays as strict,
     * without its 2 + 2k queries and k row parses on every call.
     */
    public boolean live(long pilotId, String clientId) {
        if (kept.isLive(pilotId, clientId)) {
            return true;
        }
        long seen = kept.changes();
        List<Instant> expiries = jdbc
                .queryForList(
                        "SELECT a.id FROM oauth2_authorization a JOIN oauth2_registered_client c"
                                + " ON c.id = a.registered_client_id WHERE a.principal_name = ? AND c.client_id = ?",
                        String.class,
                        Long.toString(pilotId),
                        clientId)
                .stream()
                .map(authorizations::findById)
                .filter(ConnectorGrants::live)
                .map(ConnectorGrants::firstExpiry)
                .toList();
        if (expiries.isEmpty()) {
            return false;
        }
        kept.live(pilotId, clientId, expiries.stream().min(Instant::compareTo).orElseThrow(), seen);
        return true;
    }

    private static boolean live(OAuth2Authorization connection) {
        return connection != null && (active(connection.getAccessToken()) || active(connection.getRefreshToken()));
    }

    private static boolean active(OAuth2Authorization.Token<?> token) {
        return token != null && token.isActive();
    }

    /** The first moment one of a live connection's active tokens runs out
     *  (Instant.MAX where none says): after it the answer may be no. */
    private static Instant firstExpiry(OAuth2Authorization connection) {
        return java.util.stream.Stream.of(connection.getAccessToken(), connection.getRefreshToken())
                .filter(ConnectorGrants::active)
                .map(t -> t.getToken().getExpiresAt())
                .filter(java.util.Objects::nonNull)
                .min(Instant::compareTo)
                .orElse(Instant.MAX);
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
