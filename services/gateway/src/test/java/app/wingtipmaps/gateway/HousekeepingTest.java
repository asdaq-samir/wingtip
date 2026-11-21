package app.wingtipmaps.gateway;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.wingtipmaps.gateway.domain.MagicLink;
import app.wingtipmaps.gateway.domain.Pilot;
import app.wingtipmaps.gateway.domain.SpeedSample;
import app.wingtipmaps.gateway.repository.SpeedSampleRepository;
import app.wingtipmaps.gateway.security.MagicLinkAuthenticationToken;
import app.wingtipmaps.gateway.service.DeletionsReapplied;
import app.wingtipmaps.gateway.service.Housekeeping;
import java.sql.Date;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * The nightly letting go (Housekeeping) against a real Postgres: each
 * table keeps what is still of use and loses what is past it; and an
 * account deleted, then brought back by a restore of an older backup, is
 * deleted again (DeletionsReapplied).
 */
class HousekeepingTest extends AccountTestBase {

    @Autowired
    private Housekeeping housekeeping;

    @Autowired
    private DeletionsReapplied deletions;

    @Autowired
    private SpeedSampleRepository samples;

    private int count(String sql, Object... args) {
        return jdbc.queryForObject(sql, Integer.class, args);
    }

    @Test
    void eachTableLetsGoOnlyWhatIsPastItsUse() {
        Instant now = Instant.now();
        samples.deleteAll();
        samples.save(new SpeedSample(now.minus(Duration.ofDays(401)), "field", "lcp", 1.0, "plan", "phone", "1"));
        samples.save(new SpeedSample(now.minus(Duration.ofDays(399)), "field", "lcp", 1.0, "plan", "phone", "1"));
        String email = "keep-" + now.toEpochMilli() + "@example.com";
        magicLinks.save(new MagicLink(email, "old-" + now.toEpochMilli(), now.minus(Duration.ofDays(2))));
        magicLinks.save(new MagicLink(email, "new-" + now.toEpochMilli(), now.plus(Duration.ofMinutes(15))));
        Pilot pilot = pilots.save(new Pilot(email, "Kept Pilot", "google-keep-" + now.toEpochMilli()));
        LocalDate today = LocalDate.ofInstant(now, ZoneOffset.UTC);
        for (LocalDate due : new LocalDate[] {today.minusDays(3), today, today.plusDays(7)}) {
            jdbc.update(
                    "INSERT INTO reminders_sent (pilot_id, what, due_on, days_before) VALUES (?, 'medical', ?, 7)",
                    pilot.getId(),
                    Date.valueOf(due));
        }
        jdbc.update(
                "INSERT INTO deleted_accounts (pilot_id, deleted_at) VALUES (?, ?), (?, ?)",
                -1L,
                Timestamp.from(now.minus(Duration.ofDays(61))),
                -2L,
                Timestamp.from(now.minus(Duration.ofDays(10))));

        housekeeping.run();

        // The speed trend keeps 400 days (SpeedService.KEPT).
        assertThat(samples.count()).isEqualTo(1);
        assertThat(count(
                        "SELECT count(*) FROM speed_samples WHERE recorded_at > ?",
                        Timestamp.from(now.minus(Duration.ofDays(400)))))
                .isEqualTo(1);
        assertThat(count("SELECT count(*) FROM magic_links WHERE email = ?", email))
                .isEqualTo(1);
        // The reminder whose day is past guards nothing; today's and next week's still do.
        assertThat(count("SELECT count(*) FROM reminders_sent WHERE pilot_id = ?", pilot.getId()))
                .isEqualTo(2);
        assertThat(count("SELECT count(*) FROM deleted_accounts WHERE pilot_id = -1"))
                .isZero();
        assertThat(count("SELECT count(*) FROM deleted_accounts WHERE pilot_id = -2"))
                .isEqualTo(1);
    }

    @Test
    void anAccountDeletedThenRestoredIsDeletedAgain() throws Exception {
        Pilot leaving = pilotWithEverything();
        Pilot staying = pilotWithEverything();
        mockMvc.perform(delete("/api/me")
                        .with(csrf())
                        .with(authentication(new MagicLinkAuthenticationToken(leaving.getEmail()))))
                .andExpect(status().isNoContent());
        // The deletion is noted by id alone.
        assertThat(count("SELECT count(*) FROM deleted_accounts WHERE pilot_id = ?", leaving.getId()))
                .isEqualTo(1);

        // A restore from the night before: the pilot's row is back, made
        // before the deletion, with the same id.
        jdbc.update(
                "INSERT INTO pilots (id, email, display_name, created_at) VALUES (?, ?, 'Test Pilot', ?)",
                leaving.getId(),
                leaving.getEmail(),
                Timestamp.from(Instant.now().minus(Duration.ofDays(1))));
        FakePlanner.asked.clear();

        assertThat(deletions.reapply()).isEqualTo(1);

        assertThat(count("SELECT count(*) FROM pilots WHERE id = ?", leaving.getId()))
                .isZero();
        assertThat(count("SELECT count(*) FROM pilots WHERE id = ?", staying.getId()))
                .isEqualTo(1);
        // The planner was asked again to forget the notes the restore brought back.
        assertThat(FakePlanner.asked).containsExactly("DELETE /api/checkpoint-notes/mine pilot=" + leaving.getId());
        // And again finds nothing to do.
        assertThat(deletions.reapply()).isZero();
    }
}
