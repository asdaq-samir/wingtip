package app.wingtipmaps.gateway.controller;

import app.wingtipmaps.gateway.domain.Aircraft;
import app.wingtipmaps.gateway.domain.Pilot;
import app.wingtipmaps.gateway.dto.AircraftDto;
import app.wingtipmaps.gateway.dto.AircraftRequest;
import app.wingtipmaps.gateway.dto.DueItemDto;
import app.wingtipmaps.gateway.dto.DueItemRequest;
import app.wingtipmaps.gateway.dto.HandbookRequest;
import app.wingtipmaps.gateway.dto.InspectionsRequest;
import app.wingtipmaps.gateway.dto.OwnFigures;
import app.wingtipmaps.gateway.dto.SquawkDto;
import app.wingtipmaps.gateway.dto.SquawkRequest;
import app.wingtipmaps.gateway.dto.VorCheckRequest;
import app.wingtipmaps.gateway.planner.model.PlannerInspections;
import app.wingtipmaps.gateway.planner.model.PlannerVorCheckOutput;
import app.wingtipmaps.gateway.service.AircraftService;
import app.wingtipmaps.gateway.service.DueItemService;
import app.wingtipmaps.gateway.service.PilotService;
import app.wingtipmaps.gateway.service.PlannerClient;
import app.wingtipmaps.gateway.service.SquawkService;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * CRUD for a pilot's own aeroplanes. Every method starts the same way
 * -- resolve the signed-in pilot or answer 401 -- because unlike
 * {@link PlannerProxyController} (public, shared data), everything here is
 * pilot-scoped; {@link app.wingtipmaps.gateway.security.SecurityConfig} already refuses an
 * unauthenticated caller before a request reaches here, but that
 * refusal is a redirect-avoiding 401 with no body, and {@code
 * Authentication} can still carry a principal Spring Security accepted
 * that {@link PilotService} doesn't recognise as OIDC -- so this
 * layer resolves the pilot itself rather than assuming one exists.
 */
@RestController
@RequestMapping("/api/aircraft")
public class AircraftController {

    private final AircraftService aircraftService;
    private final SquawkService squawks;
    private final DueItemService dueItems;
    private final AircraftDtos dtos;

    public AircraftController(
            AircraftService aircraftService, SquawkService squawks, PlannerClient planner, DueItemService dueItems) {
        this.aircraftService = aircraftService;
        this.squawks = squawks;
        this.dueItems = dueItems;
        this.dtos = new AircraftDtos(squawks, planner, dueItems);
    }

    @GetMapping
    public ResponseEntity<List<AircraftDto>> list(Pilot pilot) {
        return ResponseEntity.ok(
                aircraftService.list(pilot).stream().map(this::toDto).toList());
    }

    @PostMapping
    public ResponseEntity<AircraftDto> add(Pilot pilot, @Valid @RequestBody AircraftRequest request) {
        return ResponseEntity.ok(toDto(aircraftService.add(
                pilot,
                request.tailNumber(),
                request.typeDesignator(),
                request.cruiseTasKt(),
                request.fuelBurnGph(),
                request.cruisePowerPct(),
                request.climbTasKt(),
                request.climbFuelBurnGph(),
                request.usableFuelGal(),
                request.equipment(),
                request.surveillance(),
                request.colour(),
                request.figures())));
    }

    @PutMapping("/{id}")
    public ResponseEntity<AircraftDto> update(
            Pilot pilot, @PathVariable Long id, @Valid @RequestBody AircraftRequest request) {
        return ResponseEntity.of(aircraftService
                .update(
                        pilot,
                        id,
                        request.tailNumber(),
                        request.typeDesignator(),
                        request.cruiseTasKt(),
                        request.fuelBurnGph(),
                        request.cruisePowerPct(),
                        request.climbTasKt(),
                        request.climbFuelBurnGph(),
                        request.usableFuelGal(),
                        request.equipment(),
                        request.surveillance(),
                        request.colour(),
                        request.figures())
                .map(this::toDto));
    }

    /** Its own handbook figures, those given added to the rest: what the
     *  apps' inline ask saves, one figure at a time, where a plan needs it
     *  (the owner, 2026-11-09: "just ask for it at the time it's needed"). */
    @PutMapping("/{id}/figures")
    public ResponseEntity<AircraftDto> figures(
            Pilot pilot, @PathVariable Long id, @Valid @RequestBody OwnFigures request) {
        return ResponseEntity.of(aircraftService.addFigures(pilot, id, request).map(this::toDto));
    }

    /** The airplane's VOR check for IFR, recorded (14 CFR 91.171(d)). */
    @PutMapping("/{id}/vor-check")
    public ResponseEntity<AircraftDto> vorCheck(
            Pilot pilot, @PathVariable Long id, @Valid @RequestBody VorCheckRequest request) {
        return ResponseEntity.of(aircraftService
                .recordVorCheck(pilot, id, request.checkedOn(), request.kind(), request.place(), request.errorDeg())
                .map(this::toDto));
    }

    /** The airplane's inspections and tests, recorded all at once. */
    @PutMapping("/{id}/inspections")
    public ResponseEntity<AircraftDto> inspections(
            Pilot pilot, @PathVariable Long id, @Valid @RequestBody InspectionsRequest request) {
        return ResponseEntity.of(
                aircraftService.recordInspections(pilot, id, request).map(this::toDto));
    }

    /** The airplane's handbook figures, as its pilot confirmed them from a
     *  photographed page; kept as sent. */
    @PutMapping("/{id}/handbook")
    public ResponseEntity<AircraftDto> handbook(
            Pilot pilot, @PathVariable Long id, @Valid @RequestBody HandbookRequest request) {
        return ResponseEntity.of(
                aircraftService.keepHandbook(pilot, id, request.figures()).map(this::toDto));
    }

    /** The airplane's squawks, newest first. */
    @GetMapping("/{id}/squawks")
    public ResponseEntity<List<SquawkDto>> squawks(Pilot pilot, @PathVariable Long id) {
        return ResponseEntity.of(squawks.list(pilot, id));
    }

    @PostMapping("/{id}/squawks")
    public ResponseEntity<SquawkDto> addSquawk(
            Pilot pilot, @PathVariable Long id, @Valid @RequestBody SquawkRequest request) {
        return ResponseEntity.of(squawks.add(pilot, id, request));
    }

    /** A squawk changed, or fixed. */
    @PutMapping("/{id}/squawks/{squawkId}")
    public ResponseEntity<SquawkDto> updateSquawk(
            Pilot pilot,
            @PathVariable Long id,
            @PathVariable Long squawkId,
            @Valid @RequestBody SquawkRequest request) {
        return ResponseEntity.of(squawks.update(pilot, id, squawkId, request));
    }

    @DeleteMapping("/{id}/squawks/{squawkId}")
    public ResponseEntity<Void> deleteSquawk(Pilot pilot, @PathVariable Long id, @PathVariable Long squawkId) {
        return PilotResponses.done(squawks.delete(pilot, id, squawkId));
    }

    /** An item due on the airplane, as its owner keeps it: an AD's status
     *  (14 CFR 91.417(a)(2)(v)) or another. */
    @PostMapping("/{id}/due-items")
    public ResponseEntity<DueItemDto> addDueItem(
            Pilot pilot, @PathVariable Long id, @Valid @RequestBody DueItemRequest request) {
        return ResponseEntity.of(dueItems.add(pilot, id, request));
    }

    @PutMapping("/{id}/due-items/{itemId}")
    public ResponseEntity<DueItemDto> updateDueItem(
            Pilot pilot, @PathVariable Long id, @PathVariable Long itemId, @Valid @RequestBody DueItemRequest request) {
        return ResponseEntity.of(dueItems.update(pilot, id, itemId, request));
    }

    @DeleteMapping("/{id}/due-items/{itemId}")
    public ResponseEntity<Void> deleteDueItem(Pilot pilot, @PathVariable Long id, @PathVariable Long itemId) {
        return PilotResponses.done(dueItems.delete(pilot, id, itemId));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(Pilot pilot, @PathVariable Long id) {
        return PilotResponses.done(aircraftService.delete(pilot, id));
    }

    private AircraftDto toDto(Aircraft a) {
        return dtos.of(a);
    }

    static AircraftDto.InspectionsDto inspectionsOf(Aircraft a, PlannerInspections due) {
        return new AircraftDto.InspectionsDto(
                a.getAnnualOn(),
                due.getAnnualUntil(),
                a.getHundredHourAtHours(),
                a.getHoursNow(),
                PlannerClient.number(due.getHundredHourDueAtHours()),
                a.getStaticCheckOn(),
                due.getStaticCheckUntil(),
                a.getTransponderCheckOn(),
                due.getTransponderCheckUntil(),
                a.getEltInspectedOn(),
                due.getEltUntil(),
                a.getEltBatteryDueOn(),
                a.isForHire());
    }

    static AircraftDto.VorCheckDto vorCheckOf(Aircraft a, PlannerInspections due) {
        PlannerVorCheckOutput vor = due.getVorCheck();
        if (vor == null
                || a.getVorCheckOn() == null
                || a.getVorCheckKind() == null
                || a.getVorCheckErrorDeg() == null) {
            return null;
        }
        return new AircraftDto.VorCheckDto(
                a.getVorCheckOn(),
                a.getVorCheckKind(),
                a.getVorCheckPlace(),
                a.getVorCheckErrorDeg(),
                vor.getLimitDeg().doubleValue(),
                vor.getWithin(),
                vor.getUntil());
    }
}
