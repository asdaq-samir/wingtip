package app.wingtipmaps.gateway.service;

import app.wingtipmaps.gateway.domain.Pilot;
import app.wingtipmaps.gateway.dto.AccountRecordsDto;
import app.wingtipmaps.gateway.dto.AccountRecordsDto.SentReminder;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * The rows of a pilot's that no endpoint reads back whole, read for their
 * export (ExportController): reminders_sent (V23). Read here, in one
 * place, rather than given an endpoint of its own that no screen would
 * call.
 */
@Service
public class AccountRecords {

    private final JdbcTemplate jdbc;

    public AccountRecords(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Everything of that table that is the pilot's. */
    public AccountRecordsDto of(Pilot pilot) {
        List<SentReminder> sent = jdbc.query(
                "SELECT what, due_on, days_before, sent_at FROM reminders_sent WHERE pilot_id = ? ORDER BY sent_at",
                (r, n) -> new SentReminder(
                        r.getString(1),
                        r.getDate(2).toLocalDate(),
                        r.getInt(3),
                        r.getTimestamp(4).toInstant()),
                pilot.getId());
        return new AccountRecordsDto(sent);
    }
}
