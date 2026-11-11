package app.wingtipmaps.gateway.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import app.wingtipmaps.gateway.domain.Flight;
import app.wingtipmaps.gateway.domain.LogbookEntry;
import app.wingtipmaps.gateway.domain.Pilot;
import app.wingtipmaps.gateway.dto.LogbookEntryRequest;
import app.wingtipmaps.gateway.dto.LogbookImportResult;
import app.wingtipmaps.gateway.repository.FlightRepository;
import app.wingtipmaps.gateway.repository.LogbookRepository;
import app.wingtipmaps.gateway.repository.PilotRepository;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

/** A logbook brought in from a file: what is already in it -- the same
 *  day, airplane, route and time, whatever their case -- and a flight the
 *  file gives twice are left out, the rest added together. */
@ExtendWith(MockitoExtension.class)
class LogbookServiceTest {

    @Mock
    private LogbookRepository entries;

    @Mock
    private PilotRepository pilots;

    @Mock
    private FlightRepository flights;

    @InjectMocks
    private LogbookService logbook;

    private static Pilot pilot() {
        Pilot pilot = new Pilot("pilot@example.com", "A. Pilot", "sub-1");
        ReflectionTestUtils.setField(pilot, "id", 1L);
        return pilot;
    }

    private static LogbookEntryRequest flight(String on, String aircraft, String route, double hours) {
        return new LogbookEntryRequest(
                LocalDate.parse(on),
                aircraft,
                "C172",
                route,
                hours,
                0,
                0,
                1,
                0,
                null,
                0,
                0,
                0,
                0,
                0,
                0,
                0,
                false,
                false,
                0,
                0,
                false,
                null);
    }

    @Test
    @SuppressWarnings("unchecked")
    void anImportAddsWhatIsNotThereAlreadyAndCountsTheRest() {
        Pilot pilot = pilot();
        LogbookEntry logged = new LogbookEntry(pilot)
                .set(LocalDate.of(2026, 9, 20), "N12345", "C172", "C81 KDLH", 3.4, 0, 3.4, 1, 0, null);
        given(entries.findByPilotIdOrderByFlownOnDescIdDesc(1L)).willReturn(List.of(logged));

        LogbookImportResult result = logbook.importAll(
                pilot,
                List.of(
                        flight("2026-09-20", "n12345", "c81 kdlh", 3.4), // already logged
                        flight("2026-09-21", "N12345", "KDLH C81", 3.1),
                        flight("2026-09-21", "N12345", "KDLH C81", 3.1), // twice in the file
                        flight("2026-09-21", "N12345", "KDLH C81", 3.2))); // another flight that day

        assertThat(result).isEqualTo(new LogbookImportResult(2, 2));
        ArgumentCaptor<List<LogbookEntry>> saved = ArgumentCaptor.forClass(List.class);
        verify(entries).saveAll(saved.capture());
        assertThat(saved.getValue()).extracting(LogbookEntry::getTotalHours).containsExactly(3.1, 3.2);
        assertThat(saved.getValue()).allSatisfy(e -> assertThat(e.getPilot()).isSameAs(pilot));
    }

    /** An entry drawn from the app's track keeps what the pilot confirmed,
     *  and the saved flight it was flown as only where that is theirs. */
    @Test
    void anEntryFromTheTrackKeepsItsFiguresAndOnlyThePilotsOwnFlight() {
        Pilot pilot = pilot();
        given(entries.save(any(LogbookEntry.class))).willAnswer(a -> a.getArgument(0));
        given(flights.findByIdAndPilotId(7L, 1L)).willReturn(Optional.of(mock(Flight.class)));
        given(flights.findByIdAndPilotId(8L, 1L)).willReturn(Optional.empty());

        LogbookEntry mine = logbook.add(pilot, fromTrack(7L));
        LogbookEntry theirs = logbook.add(pilot, fromTrack(8L));

        assertThat(mine.getFlightId()).isEqualTo(7L);
        assertThat(theirs.getFlightId()).isNull();
        assertThat(mine.isFromTrack()).isTrue();
        assertThat(mine.getAirHours()).isEqualTo(3.9);
        assertThat(mine.getTouchAndGoes()).isEqualTo(1);
        assertThat(mine.getNightLandings()).isEqualTo(1);
    }

    private static LogbookEntryRequest fromTrack(Long flightId) {
        return new LogbookEntryRequest(
                LocalDate.parse("2026-11-09"),
                "N3429J",
                "C150",
                "C81 KDLH",
                4.0,
                0.8,
                4.0,
                1,
                1,
                "Logged from the app's track.",
                0,
                0,
                0,
                1,
                323,
                323,
                0,
                false,
                false,
                3.9,
                1,
                true,
                flightId);
    }
}
