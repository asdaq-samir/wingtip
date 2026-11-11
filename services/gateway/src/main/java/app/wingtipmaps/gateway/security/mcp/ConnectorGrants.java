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

    public ConnectorGrants(JdbcOperations jdbc, OAuth2AuthorizationService authorizations) {
        this.jdbc = jdbc;
        this.authorizations = authorizations;
    }

    /**
     * Whether the pilot still has a live connection through this client:
     * one whose tokens are neither revoked (disconnected, or a refresh token
     * replayed) nor run out, and gone with the account. The planner asks
     * on every MCP call, since its JWTs are checked by signature alone and
     * would otherwise outlive both by up to 15 minutes (the security
     * audit's L4). By V41's index on the pilot, a pilot's few rows.
     */
    public boolean live(long pilotId, String clientId) {
        return jdbc
                .queryForList(
                        "SELECT a.id FROM oauth2_authorization a JOIN oauth2_registered_client c"
                                + " ON c.id = a.registered_client_id WHERE a.principal_name = ? AND c.client_id = ?",
                        String.class,
                        Long.toString(pilotId),
                        clientId)
                .stream()
                .map(authorizations::findById)
                .anyMatch(ConnectorGrants::live);
    }

    private static boolean live(OAuth2Authorization connection) {
        return connection != null
                && ((connection.getAccessToken() != null
                                && connection.getAccessToken().isActive())
                        || (connection.getRefreshToken() != null
                                && connection.getRefreshToken().isActive()));
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
        jdbc.update(
                "DELETE FROM oauth2_spent_refresh_token WHERE authorization_id IN"
                        + " (SELECT id FROM oauth2_authorization WHERE principal_name = ?)",
                principal);
        jdbc.update("DELETE FROM oauth2_authorization WHERE principal_name = ?", principal);
        jdbc.update("DELETE FROM oauth2_authorization_consent WHERE principal_name = ?", principal);
    }
}
