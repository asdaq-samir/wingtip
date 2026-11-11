package app.wingtipmaps.gateway.security.mcp;

import org.springframework.jdbc.core.JdbcOperations;
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

    /** Ends every connection the pilot made: their tokens stop working at once. */
    public void forget(long pilotId) {
        String principal = Long.toString(pilotId);
        jdbc.update("DELETE FROM oauth2_authorization WHERE principal_name = ?", principal);
        jdbc.update("DELETE FROM oauth2_authorization_consent WHERE principal_name = ?", principal);
    }
}
