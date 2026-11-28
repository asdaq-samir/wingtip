package app.wingtipmaps.gateway.service;

import app.wingtipmaps.gateway.repository.PilotRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * An account deleted stays deleted after a restore. A backup is kept up to
 * 44 days (docs/privacy-inventory.md), so restoring one made before a
 * deletion brings that pilot back; the ids noted in deleted_accounts (V47),
 * put back after the restore (infra/server/reapply-deletions.sql), are
 * deleted again here, notes on the planner included (AccountService), as
 * the gateway starts and each night (Housekeeping), 2026-11-21.
 *
 * <p>Only a row made before its deletion is the deleted account: a pilot
 * who signed up later under a reused id is someone else (the restore step
 * moves the id sequence past every noted id, so none should be).
 */
@Service
public class DeletionsReapplied {

    private static final Logger log = LoggerFactory.getLogger(DeletionsReapplied.class);

    private final JdbcTemplate jdbc;
    private final PilotRepository pilots;
    private final AccountService accounts;

    public DeletionsReapplied(JdbcTemplate jdbc, PilotRepository pilots, AccountService accounts) {
        this.jdbc = jdbc;
        this.pilots = pilots;
        this.accounts = accounts;
    }

    /** As the gateway starts, which is how a restore ends (README-AWS). */
    @EventListener(ApplicationReadyEvent.class)
    public void onStart() {
        reapply();
    }

    /** How many accounts were deleted again. A planner that is down
     *  leaves an account for the next run (AccountService refuses then),
     *  and the start is never held up by it. */
    public int reapply() {
        int again = 0;
        for (Long id : jdbc.queryForList(
                "SELECT p.id FROM pilots p JOIN deleted_accounts d ON d.pilot_id = p.id"
                        + " WHERE p.created_at <= d.deleted_at",
                Long.class)) {
            try {
                var pilot = pilots.findById(id);
                if (pilot.isPresent()) {
                    accounts.delete(pilot.get());
                    again++;
                }
            } catch (RuntimeException failed) {
                // The id alone, never the address: the log outlives the account.
                log.error(
                        "A deleted account ({}) came back and could not be deleted again: {}",
                        id,
                        failed.getClass().getSimpleName());
            }
        }
        if (again > 0) {
            log.info("{} deleted accounts brought back by a restore deleted again", again);
        }
        return again;
    }
}
