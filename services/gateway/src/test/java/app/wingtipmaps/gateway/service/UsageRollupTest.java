package app.wingtipmaps.gateway.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import app.wingtipmaps.gateway.planner.model.PlannerUsageDay;
import app.wingtipmaps.gateway.planner.model.PlannerUsageDays;
import app.wingtipmaps.gateway.upstream.PlannerApi;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.postgresql.PostgreSQLContainer;

/** The planner's daily counts kept in Postgres (V55): finished days only,
 *  read from the day after the last kept, a day read again replaced. */
class UsageRollupTest {

    static PostgreSQLContainer postgres = new PostgreSQLContainer("postgres:18");
    static JdbcTemplate jdbc;
    static TransactionTemplate TX;

    private static final Clock NOV_23 = Clock.fixed(Instant.parse("2026-11-23T04:20:00Z"), ZoneOffset.UTC);

    @BeforeAll
    static void start() {
        postgres.start();
        Flyway.configure()
                .dataSource(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword())
                .locations("classpath:db/migration")
                .load()
                .migrate();
        DriverManagerDataSource db =
                new DriverManagerDataSource(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword());
        jdbc = new JdbcTemplate(db);
        TX = new TransactionTemplate(new DataSourceTransactionManager(db));
    }

    @AfterAll
    static void stop() {
        postgres.stop();
    }

    private static PlannerUsageDay row(String day, String route, int status, int calls) {
        return new PlannerUsageDay(calls, day, "GET", route, status);
    }

    @Test
    void finishedDaysAreKeptAndReadAgainFromTheLastOne() {
        PlannerApi planner = mock(PlannerApi.class);
        given(planner.usageDaily(any()))
                .willReturn(new PlannerUsageDays(List.of(
                        row("2026-11-21", "/api/plan", 200, 40),
                        row("2026-11-22", "/api/plan", 200, 55),
                        row("2026-11-22", "/api/plan", 502, 1),
                        row("2026-11-23", "/api/plan", 200, 3))));
        UsageRollup rollup = new UsageRollup(planner, jdbc, TX, NOV_23);

        rollup.rollUp();
        // Nothing kept yet: as far back as the planner keeps.
        verify(planner).usageDaily(LocalDate.parse("2026-08-25"));
        assertThat(jdbc.queryForObject("SELECT sum(calls) FROM usage_days", Long.class))
                .isEqualTo(96);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM usage_days WHERE day = DATE '2026-11-23'", Integer.class))
                .isZero();

        // The next night reads from the day after the last kept, and a
        // day it is sent again replaces its counts.
        given(planner.usageDaily(LocalDate.parse("2026-11-23")))
                .willReturn(new PlannerUsageDays(List.of(row("2026-11-22", "/api/plan", 200, 56))));
        rollup.rollUp();
        assertThat(jdbc.queryForObject(
                        "SELECT calls FROM usage_days WHERE day = DATE '2026-11-22' AND status = 200", Long.class))
                .isEqualTo(56);
    }
}
