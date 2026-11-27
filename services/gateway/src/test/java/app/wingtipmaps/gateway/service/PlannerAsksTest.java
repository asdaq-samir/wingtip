package app.wingtipmaps.gateway.service;

import static org.assertj.core.api.Assertions.assertThat;

import app.wingtipmaps.gateway.domain.LogbookEntry;
import app.wingtipmaps.gateway.domain.Pilot;
import app.wingtipmaps.gateway.planner.model.PlannerLogbookEntry;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.Test;

/** What the engine's passenger currency is sent of each entry (14 CFR
 *  61.57(a)(1)(ii); round 7's N7): its category, class, tailwheel and
 *  full stops, none where the pilot didn't say. */
class PlannerAsksTest {

    private final Pilot pilot = new Pilot("pilot@example.com", "A. Pilot", "sub-1");

    private LogbookEntry entry(int day, int night) {
        return new LogbookEntry(pilot).set(LocalDate.parse("2026-11-01"), "N1", "C170", null, 1, 0, 0, day, night, null);
    }

    @Test
    void anEntrysAirplaneAndFullStopsGoAsThePilotGaveThem() {
        LogbookEntry e = entry(3, 1).airplane("Airplane", "Single-engine land", true, 2);
        PlannerLogbookEntry sent = PlannerAsks.entriesOf(List.of(e)).getFirst();
        assertThat(sent.getCategory()).isEqualTo("Airplane");
        assertThat(sent.getPropertyClass()).isEqualTo("Single-engine land");
        assertThat(sent.getTailwheel()).isTrue();
        assertThat(sent.getFullStopLandings()).isEqualTo(2);
    }

    @Test
    void whatThePilotDidntSayGoesAsNone() {
        PlannerLogbookEntry sent = PlannerAsks.entriesOf(List.of(entry(3, 0))).getFirst();
        assertThat(sent.getCategory()).isNull();
        assertThat(sent.getPropertyClass()).isNull();
        assertThat(sent.getTailwheel()).isNull();
        assertThat(sent.getFullStopLandings()).isNull();
    }

    @Test
    void aTracksFullStopsAreItsLandingsLessItsTouchAndGoes() {
        // The track counts touch-and-goes among the day landings (V34).
        LogbookEntry e = entry(4, 1).track(1.0, 3, true, null);
        assertThat(PlannerAsks.fullStops(e)).isEqualTo(2);
    }
}
