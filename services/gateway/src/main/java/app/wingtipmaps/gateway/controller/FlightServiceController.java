package app.wingtipmaps.gateway.controller;

import app.wingtipmaps.gateway.domain.Pilot;
import app.wingtipmaps.gateway.dto.FlightPlanFiled;
import app.wingtipmaps.gateway.dto.FlightPlanFilingRequest;
import app.wingtipmaps.gateway.dto.FlightServiceStatus;
import app.wingtipmaps.gateway.flightservice.FlightServiceGateway;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Filing a flight plan with Flight Service from the app, and its standard
 * briefing (FlightServiceGateway) -- signed in, in the pilot's name. With
 * no provider connected, the status says so and each ask is a 503 that
 * sends the pilot to Flight Service itself.
 */
@RestController
@RequestMapping("/api/flight-service")
public class FlightServiceController {

    private final FlightServiceGateway flightService;

    public FlightServiceController(FlightServiceGateway flightService) {
        this.flightService = flightService;
    }

    @GetMapping
    public FlightServiceStatus status() {
        return new FlightServiceStatus(flightService.connected(), flightService.provider());
    }

    @PostMapping("/flight-plans")
    public ResponseEntity<FlightPlanFiled> file(Pilot pilot, @Valid @RequestBody FlightPlanFilingRequest plan) {
        return ResponseEntity.status(HttpStatus.CREATED).body(new FlightPlanFiled(flightService.file(pilot, plan)));
    }

    @PostMapping("/briefings")
    public ResponseEntity<String> brief(Pilot pilot, @Valid @RequestBody FlightPlanFilingRequest plan) {
        return ResponseEntity.ok(flightService.brief(pilot, plan));
    }
}
