package app.wingtipmaps.gateway.security.mcp;

import app.wingtipmaps.gateway.config.AppProperties;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * What the connector's open registration and its tokens leave behind,
 * let go each night: Spring's stores keep every row for ever, and
 * registration is open to anyone (the security audit's M3, 2026-11-10).
 *
 * <ul>
 *   <li>A connection whose every token has run out, a day after the last
 *       did: its refresh token lasts 30 days unused, so a connection in
 *       use is never one of them.
 *   <li>A client nobody connected through, or whose connections have all
 *       gone, a day (app.mcp.unused-client-days) after it registered, with
 *       its consents. Claude and ChatGPT register again when they next
 *       connect.
 * </ul>
 *
 * <p>Off where app.mcp.housekeeping-cron is "-".
 */
@Component
public class ConnectorHousekeeping {

    private static final Logger log = LoggerFactory.getLogger(ConnectorHousekeeping.class);

    private final JdbcOperations jdbc;
    private final Duration unusedClient;

    public ConnectorHousekeeping(JdbcOperations jdbc, AppProperties app) {
        int unusedClientDays = app.mcp().unusedClientDays();
        this.jdbc = jdbc;
        this.unusedClient = Duration.ofDays(unusedClientDays);
    }

    @Scheduled(cron = "${app.mcp.housekeeping-cron:0 45 3 * * *}", zone = "UTC")
    public void nightly() {
        letGo(Instant.now());
    }

    /** Lets go of what was done with by `now`; answers how many clients went. */
    @Transactional
    public int letGo(Instant now) {
        Timestamp dayAgo = Timestamp.from(now.minus(Duration.ofDays(1)));
        int connections = jdbc.update(
                "DELETE FROM oauth2_authorization WHERE COALESCE(refresh_token_expires_at, access_token_expires_at,"
                        + " authorization_code_expires_at) < ?",
                dayAgo);
        int clients = jdbc.update(
                "DELETE FROM oauth2_registered_client c WHERE c.client_id_issued_at < ? AND NOT EXISTS"
                        + " (SELECT 1 FROM oauth2_authorization a WHERE a.registered_client_id = c.id)",
                Timestamp.from(now.minus(unusedClient)));
        // A spent refresh token past the 30 days it would have lasted, or
        // whose connection has gone, can be presented to no effect.
        jdbc.update(
                "DELETE FROM oauth2_spent_refresh_token s WHERE s.spent_at < ? OR NOT EXISTS"
                        + " (SELECT 1 FROM oauth2_authorization a WHERE a.id = s.authorization_id)",
                Timestamp.from(now.minus(ConnectorClients.REFRESH_TOKEN)));
        jdbc.update("DELETE FROM oauth2_authorization_consent n WHERE NOT EXISTS"
                + " (SELECT 1 FROM oauth2_registered_client c WHERE c.id = n.registered_client_id)");
        if (connections + clients > 0) {
            log.info("connector: {} ended connections and {} unused clients let go", connections, clients);
        }
        return clients;
    }
}
