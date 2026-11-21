package app.wingtipmaps.gateway.service;

import app.wingtipmaps.gateway.repository.MagicLinkRepository;
import app.wingtipmaps.gateway.repository.SpeedSampleRepository;
import java.sql.Date;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/**
 * The nightly letting go of rows kept only for a while, so each table's
 * retention holds on a quiet day as on a busy one (the prelaunch audit,
 * 2026-11-21, P8): before this, the speed trend was pruned only when a
 * new sample came, the magic links only when another was asked for, and
 * the reminders sent never, until the account went. The device faults
 * have their own night (DiagnosticsService.prune). Then any deleted
 * account a restore brought back is deleted again (DeletionsReapplied).
 * Off where app.housekeeping.cron is "-".
 */
@Service
public class Housekeeping {

    /** A magic link is let go a day after it expired, used or not: past
     *  its expiry it can sign nobody in (MagicLinkRepository), and the day
     *  over is what the request path has always kept. */
    static final Duration LINK_KEPT = Duration.ofDays(1);

    /** A reminder sent is kept only while it can still stop a second one:
     *  one is sent 30 and 7 days before its day and never after it
     *  (ReminderService), so once the day is past the row guards nothing.
     *  A day over, so a pilot whose day it is, in any time zone, still
     *  has theirs. */
    static final int REMINDER_DAYS_OVER = 1;

    /** An account's deletion is noted as long as a backup from before it
     *  may still be restored: 14 days of backups, 30 more as an older
     *  version, so 44 (docs/privacy-inventory.md), and a margin over. */
    static final Duration DELETION_KEPT = Duration.ofDays(60);

    private static final Logger log = LoggerFactory.getLogger(Housekeeping.class);

    private final SpeedSampleRepository samples;
    private final MagicLinkRepository links;
    private final JdbcTemplate jdbc;
    private final DeletionsReapplied deletions;

    public Housekeeping(
            SpeedSampleRepository samples, MagicLinkRepository links, JdbcTemplate jdbc, DeletionsReapplied deletions) {
        this.samples = samples;
        this.links = links;
        this.jdbc = jdbc;
        this.deletions = deletions;
    }

    @Scheduled(cron = "${app.housekeeping.cron:0 30 3 * * *}", zone = "UTC")
    public void run() {
        letGo();
        // Outside the transaction: each deletion is its own (AccountService).
        deletions.reapply();
    }

    /** Each delete its own statement: a failure in one keeps what the
     *  others let go. */
    void letGo() {
        Instant now = Instant.now();
        // The speed trend: a year's trend and a month over (SpeedService.KEPT).
        int speed = samples.deleteOlderThan(now.minus(SpeedService.KEPT));
        int linksGone = links.deleteExpiredBefore(now.minus(LINK_KEPT));
        LocalDate past = LocalDate.ofInstant(now, ZoneOffset.UTC).minusDays(REMINDER_DAYS_OVER);
        int reminders = jdbc.update("DELETE FROM reminders_sent WHERE due_on < ?", Date.valueOf(past));
        int noted = jdbc.update(
                "DELETE FROM deleted_accounts WHERE deleted_at < ?", Timestamp.from(now.minus(DELETION_KEPT)));
        if (speed + linksGone + reminders + noted > 0) {
            log.info(
                    "Housekeeping let go {} speed samples, {} magic links, {} reminders sent, {} deletions noted",
                    speed,
                    linksGone,
                    reminders,
                    noted);
        }
    }
}
