package app.wingtipmaps.gateway;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.authentication;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import app.wingtipmaps.gateway.domain.Pilot;
import app.wingtipmaps.gateway.security.MagicLinkAuthenticationToken;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * Deleting an account in the app (App Review 5.1.1(v)), and the copy a
 * pilot may take away first: every table that holds a pilot's data is
 * counted afterwards (AccountTestBase.rowsOf) -- empty for the deleted
 * pilot, untouched for another.
 */
class AccountDeletionTest extends AccountTestBase {

    @Test
    void deletingAnAccountTakesEverythingThatWasTheirsAndNothingOfAnyoneElses() throws Exception {
        Pilot leaving = pilotWithEverything();
        Pilot staying = pilotWithEverything();
        assertThat(rowsOf(leaving)).allMatch(rows -> rows > 0);
        List<Integer> before = rowsOf(staying);

        mockMvc.perform(delete("/api/me")
                        .with(csrf())
                        .with(authentication(new MagicLinkAuthenticationToken(leaving.getEmail()))))
                .andExpect(status().isNoContent());

        assertThat(rowsOf(leaving)).containsOnly(0);
        // A flight's nav log and track have no pilot of their own: none may
        // be left without its flight.
        assertThat(jdbc.queryForObject(
                        "SELECT count(*) FROM flight_checkpoints WHERE flight_id NOT IN " + "(SELECT id FROM flights)",
                        Integer.class))
                .isZero();
        assertThat(jdbc.queryForObject(
                        "SELECT count(*) FROM flight_tracks WHERE flight_id NOT IN " + "(SELECT id FROM flights)",
                        Integer.class))
                .isZero();
        assertThat(rowsOf(staying)).isEqualTo(before);
        // The planner was asked to forget the pilot's own notes, by their id.
        assertThat(plannerAsked).containsExactly("DELETE /api/checkpoint-notes/mine pilot=" + leaving.getId());
    }

    @Test
    void whenThePlannerCannotTakeTheNotesNothingIsDeleted() throws Exception {
        Pilot pilot = pilotWithEverything();
        List<Integer> before = rowsOf(pilot);
        plannerStatus = 503;

        mockMvc.perform(delete("/api/me")
                        .with(csrf())
                        .with(authentication(new MagicLinkAuthenticationToken(pilot.getEmail()))))
                .andExpect(status().isBadGateway());

        assertThat(rowsOf(pilot)).isEqualTo(before);
    }

    /** The copy a pilot may take away (ExportController): everything of
     *  theirs from the fixture above, as a download, and nothing of the
     *  other pilot's. */
    @Test
    void theExportCarriesEverythingOfTheirsAndNothingOfAnyoneElses() throws Exception {
        Pilot pilot = pilotWithEverything();
        pilotWithEverything();

        mockMvc.perform(get("/api/me/export").with(authentication(new MagicLinkAuthenticationToken(pilot.getEmail()))))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Disposition", startsWith("attachment; filename=\"wingtip-maps-")))
                .andExpect(jsonPath("$.format").value("wingtip-maps-export/1"))
                .andExpect(jsonPath("$.account.email").value(pilot.getEmail()))
                .andExpect(jsonPath("$.airplanes.length()").value(1))
                .andExpect(jsonPath("$.airplanes[0].squawks[0].text").value("Landing light out"))
                .andExpect(jsonPath("$.flights.length()").value(1))
                .andExpect(jsonPath("$.flights[0].flight.checkpoints.length()").value(2))
                .andExpect(jsonPath("$.flights[0].track").exists())
                .andExpect(jsonPath("$.flights[0].share.url").exists())
                .andExpect(jsonPath("$.flights[0].watch.flightId").exists())
                .andExpect(jsonPath("$.logbook.length()").value(1))
                // What no screen reads back whole (docs/legal/privacy.md, "Export My Data").
                .andExpect(jsonPath("$.checkpointNotes[0].description").value("Water tower"))
                .andExpect(jsonPath("$.reminders.on").value(false))
                .andExpect(jsonPath("$.records.remindersSent[0].what").value("medical"))
                .andExpect(jsonPath("$.records.subscription.updatedAt").exists())
                .andExpect(jsonPath("$.records.featureUses[0].feature").value("NARRATIVE"))
                .andExpect(jsonPath("$.connectedApps.length()").value(2))
                .andExpect(jsonPath("$.connectedApps[0].app").value("Claude"))
                .andExpect(jsonPath("$.connectedApps[0].scopes").value("wingtip:read"));
        // Never a token.
        String file = mockMvc.perform(
                        get("/api/me/export").with(authentication(new MagicLinkAuthenticationToken(pilot.getEmail()))))
                .andReturn()
                .getResponse()
                .getContentAsString();
        assertThat(file).doesNotContain("secret-token");
    }

    @Test
    void nobodySignedInExportsNothing() throws Exception {
        mockMvc.perform(get("/api/me/export")).andExpect(status().isUnauthorized());
    }

    @Test
    void nobodySignedInDeletesNothing() throws Exception {
        mockMvc.perform(delete("/api/me").with(csrf())).andExpect(status().isUnauthorized());
        assertThat(plannerAsked).isEmpty();
    }
}
