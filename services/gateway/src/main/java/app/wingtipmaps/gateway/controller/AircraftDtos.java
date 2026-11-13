package app.wingtipmaps.gateway.controller;

import app.wingtipmaps.gateway.domain.Aircraft;
import app.wingtipmaps.gateway.dto.AircraftDto;
import app.wingtipmaps.gateway.planner.model.PlannerInspections;
import app.wingtipmaps.gateway.service.AircraftService;
import app.wingtipmaps.gateway.service.DueItemService;
import app.wingtipmaps.gateway.service.PlannerClient;
import app.wingtipmaps.gateway.service.SquawkService;
import java.util.List;

/**
 * An airplane as the API answers it, with when its inspections fall due
 * (the engine's, through the planner): one mapping for the app's own
 * {@link AircraftController} and the connector's
 * {@link InternalRecordsController}, so a pilot's Claude reads the same
 * airplane their app shows.
 *
 * <p>A plain class each controller builds from its own collaborators, not
 * a bean: a {@code @WebMvcTest} slice of either controller loads no
 * components, and one here would have to be imported into every such test.
 */
final class AircraftDtos {

    private final SquawkService squawks;
    private final PlannerClient planner;
    private final DueItemService dueItems;

    AircraftDtos(SquawkService squawks, PlannerClient planner, DueItemService dueItems) {
        this.squawks = squawks;
        this.planner = planner;
        this.dueItems = dueItems;
    }

    AircraftDto of(Aircraft a) {
        PlannerInspections due = dueOf(a);
        return new AircraftDto(
                a.getId(),
                a.getTailNumber(),
                a.getTypeDesignator(),
                a.getCruiseTasKt(),
                a.getFuelBurnGph(),
                a.getCruisePowerPct(),
                a.getClimbTasKt(),
                a.getClimbFuelBurnGph(),
                a.getDescentIasKt(),
                a.getDescentFuelBurnGph(),
                a.getUsableFuelGal(),
                a.getCreatedAt(),
                AircraftController.vorCheckOf(a, due),
                AircraftController.inspectionsOf(a, due),
                a.getId() == null ? List.of() : squawks.open(a.getId()),
                a.getEquipment(),
                a.getSurveillance(),
                a.getColour(),
                a.getId() == null
                        ? List.of()
                        : dueItems.of(a.getId()).stream()
                                .map(DueItemService::toDto)
                                .toList(),
                AircraftService.handbookOf(a),
                AircraftService.figuresOf(a));
    }

    /** When the airplane's inspections and checks fall due, and its VOR
     *  check's standing: the engine's (inspections_due, through the
     *  planner: 14 CFR 91.409(a), (b), 91.207(d), 91.411(a), 91.413(a),
     *  91.171). */
    private PlannerInspections dueOf(Aircraft a) {
        return planner.inspections(
                a.getAnnualOn(),
                a.getEltInspectedOn(),
                a.getStaticCheckOn(),
                a.getTransponderCheckOn(),
                a.getHundredHourAtHours(),
                a.getVorCheckOn(),
                a.getVorCheckKind() == null ? null : a.getVorCheckKind().name(),
                a.getVorCheckErrorDeg());
    }
}
