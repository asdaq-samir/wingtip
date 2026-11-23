package app.wingtipmaps.gateway;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import app.wingtipmaps.gateway.domain.Flight;
import app.wingtipmaps.gateway.domain.Pilot;
import app.wingtipmaps.gateway.dto.SaveFlightRequest;
import app.wingtipmaps.gateway.service.FlightService;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.web.ErrorResponseException;

/**
 * The connector's update_saved_flight plans a saved flight again in place
 * (FlightService.replan). A flight put to an instructor for the solo
 * cross-country review (14 CFR 61.93(c)(3)) keeps its route: the review
 * and its endorsement show that row, so a new route there would stand
 * under a signature given for another (the security review of 2026-11-22,
 * M1).
 */
class ReplanReviewedFlightTest extends AccountTestBase {

    @Autowired
    FlightService flightService;

    private static SaveFlightRequest toMinneapolis() {
        return new SaveFlightRequest(
                null, "C81", "KMSP", 4500, 300.0, 150.0, 20.0, null, List.of(), List.of(), null, null, null);
    }

    @Test
    void aFlightPutToAnInstructorIsNotPlannedAgainInPlace() {
        Pilot pilot = pilotWithEverything();
        Flight reviewed =
                flights.findByPilotIdOrderByCreatedAtDesc(pilot.getId()).get(0);

        assertThatThrownBy(() -> flightService.replan(pilot, reviewed.getId(), toMinneapolis()))
                .isInstanceOfSatisfying(
                        ErrorResponseException.class,
                        e -> assertThat(e.getStatusCode()).isEqualTo(HttpStatus.CONFLICT));
        assertThat(flights.findById(reviewed.getId()).orElseThrow().getDestinationIdent())
                .isEqualTo("KDLH");
    }

    @Test
    void aFlightNoInstructorSawIsPlannedAgain() {
        Pilot pilot = pilotWithEverything();
        Flight plain = flights.save(new Flight(pilot, null, "C81", "KDLH"));

        assertThat(flightService.replan(pilot, plain.getId(), toMinneapolis()))
                .hasValueSatisfying(f -> assertThat(f.getDestinationIdent()).isEqualTo("KMSP"));
    }
}
