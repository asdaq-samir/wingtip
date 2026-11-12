package app.wingtipmaps.gateway.controller;

import app.wingtipmaps.gateway.domain.Pilot;
import app.wingtipmaps.gateway.dto.FlightWatchDto;
import app.wingtipmaps.gateway.dto.WatchFlightRequest;
import app.wingtipmaps.gateway.service.FlightWatchService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** A pilot's watch on one of their saved flights -- start it, read what
 *  changed, end it. Pilot-scoped the same way {@link FlightController}
 *  is: another pilot's flight is not found, never refused as existing. */
@RestController
@RequestMapping("/api/flights/{id}/watch")
public class FlightWatchController {

    private final FlightWatchService watches;

    public FlightWatchController(FlightWatchService watches) {
        this.watches = watches;
    }

    /** Watches the flight up to its departure, briefing it now as the
     *  baseline; the watch, with no changes yet. */
    @PostMapping
    public ResponseEntity<FlightWatchDto> watch(
            Pilot pilot, @PathVariable Long id, @Valid @RequestBody WatchFlightRequest request) {
        return ResponseEntity.of(watches.watch(pilot, id, request.departAt()));
    }

    /** The watch and the latest changes, for the app to show. */
    @GetMapping
    public ResponseEntity<FlightWatchDto> get(Pilot pilot, @PathVariable Long id) {
        return ResponseEntity.of(watches.watchOf(pilot, id));
    }

    @DeleteMapping
    public ResponseEntity<Void> unwatch(Pilot pilot, @PathVariable Long id) {
        return PilotResponses.done(watches.unwatch(pilot, id));
    }
}
