package app.wingtipmaps.gateway.controller;

import app.wingtipmaps.gateway.domain.Flight;
import app.wingtipmaps.gateway.domain.PaidFeature;
import app.wingtipmaps.gateway.domain.Pilot;
import app.wingtipmaps.gateway.dto.FlightCheckpointDto;
import app.wingtipmaps.gateway.dto.FlightDto;
import app.wingtipmaps.gateway.dto.FlightShareDto;
import app.wingtipmaps.gateway.dto.FlightSummaryDto;
import app.wingtipmaps.gateway.dto.RiskAssessmentDto;
import app.wingtipmaps.gateway.dto.SaveFlightRequest;
import app.wingtipmaps.gateway.dto.TrackDto;
import app.wingtipmaps.gateway.dto.UpdateFlightRequest;
import app.wingtipmaps.gateway.service.FlightService;
import app.wingtipmaps.gateway.service.FlightShareService;
import app.wingtipmaps.gateway.service.SubscriptionService;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** A pilot's own filed flights -- list, save a new one (answered with
 *  its nav log), rename or note it, delete. Pilot-scoped the same way {@link AircraftController}
 *  is, for the same reason. */
@RestController
@RequestMapping("/api/flights")
public class FlightController {

    private final FlightService flightService;
    private final SubscriptionService subscriptions;
    private final FlightShareService shares;

    public FlightController(FlightService flightService, SubscriptionService subscriptions, FlightShareService shares) {
        this.flightService = flightService;
        this.subscriptions = subscriptions;
        this.shares = shares;
    }

    /** The pilot's flights, each with its link where it is shared, so the
     *  list's menu can say Share or Stop Sharing. */
    @GetMapping
    public ResponseEntity<List<FlightSummaryDto>> list(Pilot pilot) {
        List<Flight> theirs = flightService.list(pilot);
        var shared = shares.sharesOf(theirs);
        String origin = FlightShareController.origin();
        return ResponseEntity.ok(theirs.stream()
                .map(f -> FlightSummaryDto.of(
                        f, shared.containsKey(f.getId()) ? FlightShareDto.of(shared.get(f.getId()), origin) : null))
                .toList());
    }

    @PostMapping
    public ResponseEntity<FlightDto> save(Pilot pilot, @Valid @RequestBody SaveFlightRequest request) {
        return ResponseEntity.ok(toDto(flightService.save(pilot, request)));
    }

    /** One of the pilot's flights, with its nav log: what its debrief
     *  is read against. */
    @GetMapping("/{id}")
    public ResponseEntity<FlightDto> get(Pilot pilot, @PathVariable Long id) {
        return ResponseEntity.of(flightService.get(pilot, id).map(FlightController::toDto));
    }

    /** Renames one of the pilot's flights or changes its notes, as edited
     *  in place on the saved-flights list; 404 where it is not theirs. */
    @PatchMapping("/{id}")
    public ResponseEntity<FlightSummaryDto> update(
            Pilot pilot, @PathVariable Long id, @Valid @RequestBody UpdateFlightRequest request) {
        return ResponseEntity.of(flightService
                .update(pilot, id, request)
                .map(f -> FlightSummaryDto.of(
                        f,
                        shares.shareOf(f.getId())
                                .map(s -> FlightShareDto.of(s, FlightShareController.origin()))
                                .orElse(null))));
    }

    /** The flight's track, where the pilot saved one to their account. */
    @GetMapping("/{id}/track")
    public ResponseEntity<TrackDto> track(Pilot pilot, @PathVariable Long id) {
        return ResponseEntity.of(flightService.track(pilot, id));
    }

    /** A track kept on the account for its debrief, a paid feature: the
     *  debrief itself is measured on the device, so keeping its track is
     *  what the server can hold back (SubscriptionService). Reading one
     *  back, or deleting it, never is: what a pilot saved stays theirs. */
    @PutMapping("/{id}/track")
    public ResponseEntity<Void> saveTrack(
            Authentication authentication, Pilot pilot, @PathVariable Long id, @Valid @RequestBody TrackDto track) {
        var refused = subscriptions.refusal(authentication, PaidFeature.DEBRIEF);
        if (refused.isPresent()) {
            return ResponseEntity.status(refused.get().status()).build();
        }
        return PilotResponses.done(flightService.saveTrack(pilot, id, track));
    }

    @DeleteMapping("/{id}/track")
    public ResponseEntity<Void> deleteTrack(Pilot pilot, @PathVariable Long id) {
        return PilotResponses.done(flightService.deleteTrack(pilot, id));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(Pilot pilot, @PathVariable Long id) {
        return PilotResponses.done(flightService.delete(pilot, id));
    }

    private static RiskAssessmentDto riskOf(Flight f) {
        return f.getRiskScore() == null
                ? null
                : new RiskAssessmentDto(f.getRiskScore(), f.getRiskLevel(), f.getRiskFactors());
    }

    private static FlightDto toDto(Flight f) {
        List<FlightCheckpointDto> checkpoints =
                f.getCheckpoints().stream().map(FlightCheckpointDto::of).toList();
        return new FlightDto(
                f.getId(),
                f.getDepartureIdent(),
                f.getDestinationIdent(),
                f.getStops(),
                f.getAircraft() == null ? null : f.getAircraft().getTailNumber(),
                f.getCruiseAltitudeFt(),
                f.getTotalDistanceNm(),
                f.getTotalEteMin(),
                f.getTotalFuelGal(),
                f.getPlannedFor(),
                f.getCreatedAt(),
                riskOf(f),
                checkpoints,
                f.getOwnAltitudes(),
                f.getPicks(),
                f.getName(),
                f.getNotes());
    }
}
