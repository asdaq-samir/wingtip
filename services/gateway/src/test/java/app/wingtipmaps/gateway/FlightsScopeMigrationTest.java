package app.wingtipmaps.gateway;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.postgresql.PostgreSQLContainer;

/**
 * V53 against a real Postgres: a client registered for the old
 * wingtip:write may ask for wingtip:flights in its place, while the
 * consent a pilot gave to wingtip:write is left as it was, so it covers
 * none of the new scope and the pilot is asked again (the security review
 * of 2026-11-22, L4).
 */
class FlightsScopeMigrationTest {

    static PostgreSQLContainer postgres = new PostgreSQLContainer("postgres:18");
    static JdbcTemplate jdbc;

    @BeforeAll
    static void start() {
        postgres.start();
        jdbc = new JdbcTemplate(
                new DriverManagerDataSource(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword()));
    }

    @AfterAll
    static void stop() {
        postgres.stop();
    }

    private static Flyway flyway(String target) {
        return Flyway.configure()
                .dataSource(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword())
                .locations("classpath:db/migration")
                .target(target)
                .load();
    }

    private static String client(String scopes) {
        String id = UUID.randomUUID().toString();
        jdbc.update(
                "INSERT INTO oauth2_registered_client (id, client_id, client_name, client_authentication_methods,"
                        + " authorization_grant_types, scopes, client_settings, token_settings)"
                        + " VALUES (?, ?, 'Claude', 'none', 'authorization_code', ?, '{}', '{}')",
                id,
                id,
                scopes);
        return id;
    }

    private static String scopesOf(String id) {
        return jdbc.queryForObject("SELECT scopes FROM oauth2_registered_client WHERE id = ?", String.class, id);
    }

    @Test
    void aClientMayAskForTheNewScopeAndAnOldConsentCoversNoneOfIt() {
        flyway("52").migrate();
        String both = client("wingtip:read,wingtip:write");
        String reader = client("wingtip:read");
        jdbc.update(
                "INSERT INTO oauth2_authorization_consent (registered_client_id, principal_name, authorities)"
                        + " VALUES (?, '42', 'SCOPE_wingtip:read,SCOPE_wingtip:write')",
                both);

        flyway("latest").migrate();

        assertThat(scopesOf(both)).isEqualTo("wingtip:read,wingtip:flights");
        assertThat(scopesOf(reader)).isEqualTo("wingtip:read");
        assertThat(jdbc.queryForObject(
                        "SELECT authorities FROM oauth2_authorization_consent WHERE registered_client_id = ?",
                        String.class,
                        both))
                .doesNotContain("wingtip:flights");
    }
}
