package app.wingtipmaps.gateway.service;

import app.wingtipmaps.gateway.domain.Pilot;
import app.wingtipmaps.gateway.dto.AccountRecordsDto;
import app.wingtipmaps.gateway.dto.AccountRecordsDto.FeatureUse;
import app.wingtipmaps.gateway.dto.AccountRecordsDto.SentReminder;
import app.wingtipmaps.gateway.dto.AccountRecordsDto.SubscriptionRow;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * The rows of a pilot's that no endpoint reads back whole, read for their
 * export (ExportController): reminders_sent (V23), the subscriptions row
 * and paid_feature_uses (V19). Read here, in one place, rather than given
 * endpoints of their own that no screen would call.
 */
@Service
public class AccountRecords {

    private final JdbcTemplate jdbc;

    public AccountRecords(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Everything of those three tables that is the pilot's. */
    public AccountRecordsDto of(Pilot pilot) {
        Long id = pilot.getId();
        List<SentReminder> sent = jdbc.query(
                "SELECT what, due_on, days_before, sent_at FROM reminders_sent WHERE pilot_id = ? ORDER BY sent_at",
                (r, n) -> new SentReminder(
                        r.getString(1),
                        r.getDate(2).toLocalDate(),
                        r.getInt(3),
                        r.getTimestamp(4).toInstant()),
                id);
        List<SubscriptionRow> subscription = jdbc.query(
                "SELECT trial_started_at, trial_ends_at, paid_until, plan, store, store_ref, updated_at"
                        + " FROM subscriptions WHERE pilot_id = ?",
                (r, n) -> new SubscriptionRow(
                        instant(r.getTimestamp(1)),
                        instant(r.getTimestamp(2)),
                        instant(r.getTimestamp(3)),
                        r.getString(4),
                        r.getString(5),
                        r.getString(6),
                        r.getTimestamp(7).toInstant()),
                id);
        List<FeatureUse> uses = jdbc.query(
                "SELECT month, feature, uses FROM paid_feature_uses WHERE pilot_id = ? ORDER BY month, feature",
                (r, n) -> new FeatureUse(r.getDate(1).toLocalDate(), r.getString(2), r.getInt(3)),
                id);
        return new AccountRecordsDto(sent, subscription.isEmpty() ? null : subscription.get(0), uses);
    }

    private static Instant instant(Timestamp at) {
        return at == null ? null : at.toInstant();
    }
}
