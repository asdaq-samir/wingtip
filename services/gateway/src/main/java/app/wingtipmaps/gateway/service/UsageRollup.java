package app.wingtipmaps.gateway.service;

import app.wingtipmaps.gateway.planner.model.PlannerUsageDay;
import app.wingtipmaps.gateway.upstream.PlannerApi;
import java.time.Clock;
import java.time.LocalDate;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Each planner route's calls a day, kept in Postgres (V55, usage_days):
 * the planner counts them on its own disk for 90 days (app.usage_days),
 * which a replaced server loses, so each night the finished days since
 * the last one kept are read from its internal /api/usage/daily and
 * written here (round 4's product audit, H2). Counts alone, nothing of a
 * pilot (docs/privacy-inventory.md). A day read again replaces its counts,
 * so a run missed or repeated changes nothing. Off where
 * app.usage.rollup-cron is "-".
 */
@Component
public class UsageRollup {

    private static final Logger log = LoggerFactory.getLogger(UsageRollup.class);

    /** As far back as the planner keeps (app.usage_days' 90 days). */
    static final int PLANNER_KEEPS_DAYS = 90;

    private final PlannerApi planner;
    private final JdbcOperations jdbc;
    private final Clock clock;

    @Autowired
    public UsageRollup(PlannerApi planner, JdbcOperations jdbc) {
        this(planner, jdbc, Clock.systemUTC());
    }

    UsageRollup(PlannerApi planner, JdbcOperations jdbc, Clock clock) {
        this.planner = planner;
        this.jdbc = jdbc;
        this.clock = clock;
    }

    @Scheduled(cron = "${app.usage.rollup-cron:0 20 4 * * *}", zone = "UTC")
    public void nightly() {
        try {
            int rows = rollUp();
            log.info("usage: {} route-days kept", rows);
        } catch (RuntimeException failed) {
            // Tomorrow's run reads from the same last day kept, so nothing is lost.
            log.warn(
                    "usage: the planner's daily counts were not read ({})",
                    failed.getClass().getSimpleName());
        }
    }

    /** Reads the finished days from the day after the last one kept (or as
     *  far back as the planner keeps), and keeps them; answers how many rows. */
    @Transactional
    public int rollUp() {
        LocalDate today = LocalDate.now(clock);
        LocalDate last = jdbc.queryForObject("SELECT max(day) FROM usage_days", LocalDate.class);
        LocalDate earliest = today.minusDays(PLANNER_KEEPS_DAYS);
        LocalDate since = last == null || last.isBefore(earliest) ? earliest : last.plusDays(1);
        List<PlannerUsageDay> days = planner.usageDaily(since).getDays();
        for (PlannerUsageDay row : days) {
            LocalDate day = LocalDate.parse(row.getDay());
            if (!day.isBefore(today)) {
                // Only finished days: today's counts are still growing.
                continue;
            }
            jdbc.update(
                    "INSERT INTO usage_days (day, route, method, status, calls) VALUES (?, ?, ?, ?, ?)"
                            + " ON CONFLICT (day, route, method, status) DO UPDATE SET calls = EXCLUDED.calls",
                    day,
                    row.getRoute(),
                    row.getMethod(),
                    row.getStatus(),
                    row.getCalls());
        }
        return days.size();
    }
}
