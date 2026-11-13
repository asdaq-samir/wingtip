package app.wingtipmaps.gateway;

import static org.assertj.core.api.Assertions.assertThat;

import app.wingtipmaps.gateway.domain.Aircraft;
import app.wingtipmaps.gateway.domain.Flight;
import app.wingtipmaps.gateway.domain.FlightCheckpoint;
import app.wingtipmaps.gateway.domain.FlightShare;
import app.wingtipmaps.gateway.domain.Pilot;
import app.wingtipmaps.gateway.dto.SharedFlightDto;
import app.wingtipmaps.gateway.repository.AircraftRepository;
import app.wingtipmaps.gateway.repository.FlightRepository;
import app.wingtipmaps.gateway.repository.PilotRepository;
import app.wingtipmaps.gateway.service.FlightShareService;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

/**
 * A saved flight shared by link, against a real Postgres: V39 applies and
 * validates, a link reads the flight with its nav log and nothing of its
 * pilot's, the N-number only when turned on, and a stop ends the link
 * for good (a share made again is a new link).
 */
@SpringBootTest
@Testcontainers
class FlightSharePersistenceTest {

    @Container
    @ServiceConnection
    static PostgreSQLContainer postgres = new PostgreSQLContainer("postgres:18");

    @Autowired
    private PilotRepository pilots;

    @Autowired
    private AircraftRepository aircraft;

    @Autowired
    private FlightRepository flights;

    @Autowired
    private FlightShareService shares;

    private Pilot newPilot() {
        String unique = UUID.randomUUID().toString();
        return pilots.save(new Pilot(unique + "@example.com", "Test Pilot", "sub-" + unique));
    }

    private Flight newFlight(Pilot pilot) {
        Aircraft plane = aircraft.save(new Aircraft(
                pilot,
                "N" + (10000 + (int) (Math.random() * 80000)),
                "C172",
                110,
                8.5,
                null,
                null,
                null,
                null,
                null,
                53.0));
        List<FlightCheckpoint> navLog = List.of(
                new FlightCheckpoint(0, "KMSN", "departure", 43.1399, -89.3375, 0.0)
                        .withLeg(55.0, 40.0, 42.0, 110.0, 30.0, 4.3),
                new FlightCheckpoint(1, "KOSH", "destination", 43.9844, -88.5570, 55.0));
        return flights.save(new Flight(pilot, plane, "KMSN", "KOSH")
                .withStops(List.of())
                .fileNavLog(navLog, 3500, 55.0, 30.0, 4.3)
                .edited("Breakfast with Mom", "Call her from the FBO"));
    }

    @Test
    void aLinkReadsThePlanAndItsNavLog_andNothingOfThePilots() {
        Pilot pilot = newPilot();
        Flight flight = newFlight(pilot);

        FlightShare share = shares.share(pilot, flight.getId(), false).orElseThrow();
        SharedFlightDto read = shares.shared(share.getToken()).orElseThrow();

        assertThat(share.getToken()).hasSize(22);
        assertThat(read.departureIdent()).isEqualTo("KMSN");
        assertThat(read.cruiseAltitudeFt()).isEqualTo(3500);
        assertThat(read.aircraftType()).isEqualTo("C172");
        assertThat(read.aircraftTailNumber()).isNull();
        assertThat(read.checkpoints()).hasSize(2);
        // The flight's own name and notes are the pilot's.
        assertThat(read.toString()).doesNotContain("Breakfast", "Call her", "Test Pilot", "example.com");
    }

    @Test
    void theNumberGoesWithItOnlyWhenTurnedOn_onTheSameLink() {
        Pilot pilot = newPilot();
        Flight flight = newFlight(pilot);

        String token = shares.share(pilot, flight.getId(), false).orElseThrow().getToken();
        String again = shares.share(pilot, flight.getId(), true).orElseThrow().getToken();

        assertThat(again).isEqualTo(token);
        assertThat(shares.shared(token).orElseThrow().aircraftTailNumber()).startsWith("N");
    }

    @Test
    void aStopEndsTheLink_andSharingAgainIsANewOne() {
        Pilot pilot = newPilot();
        Flight flight = newFlight(pilot);
        String token = shares.share(pilot, flight.getId(), false).orElseThrow().getToken();

        assertThat(shares.stop(pilot, flight.getId())).isTrue();

        assertThat(shares.shared(token)).isEmpty();
        String fresh = shares.share(pilot, flight.getId(), false).orElseThrow().getToken();
        assertThat(fresh).isNotEqualTo(token);
    }

    @Test
    void anotherPilotCanNeitherShareNorStopIt() {
        Pilot pilot = newPilot();
        Flight flight = newFlight(pilot);
        String token = shares.share(pilot, flight.getId(), false).orElseThrow().getToken();
        Pilot other = newPilot();

        assertThat(shares.share(other, flight.getId(), true)).isEmpty();
        assertThat(shares.stop(other, flight.getId())).isFalse();
        assertThat(shares.shared(token)).isPresent();
    }

    @Test
    void theShareGoesWithTheFlight() {
        Pilot pilot = newPilot();
        Flight flight = newFlight(pilot);
        String token = shares.share(pilot, flight.getId(), false).orElseThrow().getToken();

        flights.delete(flight);

        assertThat(shares.shared(token)).isEmpty();
    }
}
