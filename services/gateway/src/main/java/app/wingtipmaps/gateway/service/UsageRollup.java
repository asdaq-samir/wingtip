package app.wingtipmaps.gateway.service;

import app.wingtipmaps.gateway.planner.model.PlannerUsageDay;
import app.wingtipmaps.gateway.upstream.PlannerApi;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.LocalDate;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Each planner route's calls a day, kept in Postgres (V55, usage_days):
 * the planner counts them on its own disk for 90 days (app.usage_days),
 * which a replaced server loses, so each night the finished days since
 * the last one kept are read from its internal /api/usage/daily and
 * written here. Counts alone, nothing of a
 * pilot (docs/privacy-inventory.md). A day read again replaces its counts,
 * so a run missed or repeated changes nothing. Off where
 * app.usage.rollup-cron is "-".
 */
@Component
public class UsageRollup {

    private static final Logger log = LoggerFactory.getLogger(UsageRollup.class);

    /** As far back as the planner keeps (app.usage_days' 90 days). */
    static final int PLANNER_KEEPS_DAYS = 90;

    /** usage_days' column widths (V55): a longer route is fitted (fit), a method cut. */
    static final int ROUTE_WIDTH = 300;

    static final int METHOD_WIDTH = 10;

    private final PlannerApi planner;
    private final JdbcOperations jdbc;
    private final TransactionTemplate tx;
    private final Clock clock;

    @Autowired
    public UsageRollup(PlannerApi planner, JdbcOperations jdbc, TransactionTemplate tx) {
        this(planner, jdbc, tx, Clock.systemUTC());
    }

    UsageRollup(PlannerApi planner, JdbcOperations jdbc, TransactionTemplate tx, Clock clock) {
        this.planner = planner;
        this.jdbc = jdbc;
        this.tx = tx;
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
     *  far back as the planner keeps), then keeps them all or none, in one
     *  transaction: the next run starts the day after max(day), so a day
     *  before it left unwritten by a failure part way would never be read
     *  again. The planner is asked before the transaction opens, so no
     *  database connection waits on its HTTP answer. Through a TransactionTemplate, not @Transactional, which
     *  Spring's proxy never applies to nightly()'s call on this. Answers how many rows were written. */
    public int rollUp() {
        LocalDate today = LocalDate.now(clock);
        LocalDate last = jdbc.queryForObject("SELECT max(day) FROM usage_days", LocalDate.class);
        LocalDate earliest = today.minusDays(PLANNER_KEEPS_DAYS);
        LocalDate since = last == null || last.isBefore(earliest) ? earliest : last.plusDays(1);
        Map<Key, Long> counts = finished(planner.usageDaily(since).getDays(), today);
        Integer rows = tx.execute(status -> keep(counts));
        return rows == null ? 0 : rows;
    }

    /** A row of usage_days: its day, route, method and status. */
    record Key(LocalDate day, String route, String method, int status) {}

    /** The finished days' rows (today's counts are still growing), each
     *  route and method as its column takes it; two the planner sends
     *  that come to the same row are added, never one written over the
     *  other. */
    static Map<Key, Long> finished(List<PlannerUsageDay> days, LocalDate today) {
        Map<Key, Long> counts = new LinkedHashMap<>();
        for (PlannerUsageDay row : days) {
            LocalDate day = LocalDate.parse(row.getDay());
            if (!day.isBefore(today)) {
                continue;
            }
            Key key = new Key(
                    day, fit(row.getRoute(), ROUTE_WIDTH), clip(row.getMethod(), METHOD_WIDTH), row.getStatus());
            counts.merge(key, (long) row.getCalls(), Long::sum);
        }
        return counts;
    }

    private int keep(Map<Key, Long> counts) {
        counts.forEach((key, calls) -> jdbc.update(
                "INSERT INTO usage_days (day, route, method, status, calls) VALUES (?, ?, ?, ?, ?)"
                        + " ON CONFLICT (day, route, method, status) DO UPDATE SET calls = EXCLUDED.calls",
                key.day(),
                key.route(),
                key.method(),
                key.status(),
                calls));
        return counts.size();
    }

    /** The text as its column takes it: whole where it fits, else its
     *  start and "#" and its SHA-256's first 16 hex digits, so two routes
     *  alike for the first 300 characters stay two rows. Counted and cut
     *  in characters (code points), as Postgres's VARCHAR counts them,
     *  never inside a surrogate pair. */
    static String fit(String text, int width) {
        if (text.codePointCount(0, text.length()) <= width) {
            return text;
        }
        String mark = "#" + HexFormat.of().formatHex(sha256(text)).substring(0, 16);
        return head(text, width - mark.length()) + mark;
    }

    /** A method cut to its column: GET, POST and the rest all fit. */
    static String clip(String text, int width) {
        return head(text, width);
    }

    /** The text's first `width` characters, whole code points. */
    private static String head(String text, int width) {
        int points = text.codePointCount(0, text.length());
        return points <= width ? text : text.substring(0, text.offsetByCodePoints(0, width));
    }

    private static byte[] sha256(String text) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8));
        } catch (NoSuchAlgorithmException absent) {
            // Every Java platform has SHA-256 (MessageDigest's own list).
            throw new IllegalStateException(absent);
        }
    }
}
