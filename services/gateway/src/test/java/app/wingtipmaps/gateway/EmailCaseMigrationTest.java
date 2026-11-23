package app.wingtipmaps.gateway;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.Map;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.postgresql.PostgreSQLContainer;

/**
 * V50 against a real Postgres holding pilots one address apart but for
 * case, as V3's byte-wise UNIQUE let them be (the deep security review of
 * 2026-11-21, N8): one that merges cleanly is merged into the oldest with
 * its rows and its subject, one whose rows clash on a unique key is kept
 * apart with nothing lost, both are noted, and afterwards no new pilot
 * can take an address that differs from one in use only by case.
 */
class EmailCaseMigrationTest {

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

    private static long pilot(String email, String googleSubject) {
        return jdbc.queryForObject(
                "INSERT INTO pilots (email, display_name, google_subject, created_at) VALUES (?, ?, ?, now()) RETURNING id",
                Long.class,
                email,
                email,
                googleSubject);
    }

    private static void aircraft(long pilot, String tail) {
        jdbc.update(
                "INSERT INTO aircraft (pilot_id, tail_number, type_designator, cruise_tas_kt, fuel_burn_gph, created_at)"
                        + " VALUES (?, ?, 'C172', 110, 8, now())",
                pilot,
                tail);
    }

    @Test
    void pilotsOneAddressButForCaseAreMergedOrKeptApartAndNoted() {
        flyway("49").migrate();
        long alice = pilot("alice@example.com", null);
        long aliceToo = pilot("Alice@Example.com", "google-alice");
        long bob = pilot("bob@example.com", null);
        long bobToo = pilot("BOB@example.com", null);
        aircraft(aliceToo, "N123AB");
        aircraft(bob, "N456CD");
        aircraft(bobToo, "N456CD"); // the same tail in both: a merge would break uq_aircraft_pilot_tail

        flyway("latest").migrate();

        // Alice's second account is gone into her first, its airplane and subject with it.
        assertThat(jdbc.queryForObject("SELECT count(*) FROM pilots WHERE id = ?", Long.class, aliceToo))
                .isZero();
        assertThat(jdbc.queryForObject("SELECT pilot_id FROM aircraft WHERE tail_number = 'N123AB'", Long.class))
                .isEqualTo(alice);
        assertThat(jdbc.queryForObject("SELECT google_subject FROM pilots WHERE id = ?", String.class, alice))
                .isEqualTo("google-alice");

        // Bob's second account stands, with its airplane, under an address no mail reaches.
        assertThat(jdbc.queryForObject("SELECT email FROM pilots WHERE id = ?", String.class, bobToo))
                .endsWith("@merge-by-hand.invalid");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM aircraft WHERE pilot_id = ?", Long.class, bobToo))
                .isEqualTo(1L);

        List<Map<String, Object>> noted =
                jdbc.queryForList("SELECT kept_pilot_id, other_pilot_id, outcome FROM email_case_merges ORDER BY id");
        assertThat(noted)
                .extracting(r -> r.get("other_pilot_id") + ":" + r.get("outcome"))
                .containsExactly(aliceToo + ":merged", bobToo + ":kept_apart");

        assertThatThrownBy(
                        () -> jdbc.update(
                                "INSERT INTO pilots (email, display_name, created_at) VALUES ('ALICE@example.com', 'x', now())"))
                .isInstanceOf(DuplicateKeyException.class);
    }
}
