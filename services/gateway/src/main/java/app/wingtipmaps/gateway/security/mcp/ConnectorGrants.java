package app.wingtipmaps.gateway.security.mcp;

import app.wingtipmaps.gateway.dto.ConnectorGrantDto;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.scheduling.annotation.Scheduled;
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

    public ConnectorGrants(JdbcOperations jdbc) {
        this.jdbc = jdbc;
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

    /**
     * The connections whose every code and token has run out, a day after
     * the last did, each night: a connection unused past its 30-day refresh
     * token (ConnectorClients) is over, and the privacy policy keeps
     * nothing past its use (docs/privacy-inventory.md). A row that has not
     * yet had a code issued is an authorization in progress, and stays.
     * The consents stay: they are the pilot's standing answer, gone with
     * the account. How many went.
     */
    @Scheduled(cron = "${app.mcp.purge-cron:0 30 3 * * *}", zone = "UTC")
    public int purgeExpired() {
        return jdbc.update("DELETE FROM oauth2_authorization"
                + " WHERE (authorization_code_issued_at IS NOT NULL OR access_token_issued_at IS NOT NULL)"
                + " AND greatest(coalesce(authorization_code_expires_at, '-infinity'),"
                + " coalesce(access_token_expires_at, '-infinity'), coalesce(refresh_token_expires_at, '-infinity'))"
                + " < now() - interval '1 day'");
    }

    /** Ends every connection the pilot made: their tokens stop working at once. */
    public void forget(long pilotId) {
        String principal = Long.toString(pilotId);
        jdbc.update("DELETE FROM oauth2_authorization WHERE principal_name = ?", principal);
        jdbc.update("DELETE FROM oauth2_authorization_consent WHERE principal_name = ?", principal);
    }
}
