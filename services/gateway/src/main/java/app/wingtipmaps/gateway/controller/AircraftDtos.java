package app.wingtipmaps.gateway.controller;

import app.wingtipmaps.gateway.domain.Aircraft;
import app.wingtipmaps.gateway.domain.AircraftDueItem;
import app.wingtipmaps.gateway.dto.AircraftDto;
import app.wingtipmaps.gateway.dto.AirplaneKind;
import app.wingtipmaps.gateway.dto.SquawkDto;
import app.wingtipmaps.gateway.planner.model.PlannerInspections;
import app.wingtipmaps.gateway.service.AircraftService;
import app.wingtipmaps.gateway.service.DueItemService;
import app.wingtipmaps.gateway.service.PaperworkClient;
import app.wingtipmaps.gateway.service.PlannerClient;
import app.wingtipmaps.gateway.service.SquawkService;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.IntStream;

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
        return of(List.of(a)).get(0);
    }

    /** The airplanes in order, their open squawks and due items read in
     *  one query each for them all, not two an airplane, and when their
     *  inspections fall due asked of the planner in one call for them all
     *  (the engine's inspections_due: 14 CFR 91.409(a), (b), 91.207(d),
     *  91.411(a), 91.413(a), 91.171), not one an airplane: the web asks
     *  the list again every 60 s (waste-server audit C). */
    List<AircraftDto> of(List<Aircraft> all) {
        List<Long> ids =
                all.stream().map(Aircraft::getId).filter(Objects::nonNull).toList();
        Map<Long, List<SquawkDto>> open = squawks.openOf(ids);
        Map<Long, List<AircraftDueItem>> kept = dueItems.of(ids);
        List<List<AircraftDueItem>> keptOf = all.stream()
                .map(a -> a.getId() == null ? List.<AircraftDueItem>of() : kept.getOrDefault(a.getId(), List.of()))
                .toList();
        List<PlannerInspections> due = planner.inspections(IntStream.range(0, all.size())
                .mapToObj(i -> PaperworkClient.askOf(all.get(i), keptOf.get(i)))
                .toList());
        return IntStream.range(0, all.size())
                .mapToObj(i -> {
                    Aircraft a = all.get(i);
                    return of(
                            a,
                            due.get(i),
                            a.getId() == null ? List.of() : open.getOrDefault(a.getId(), List.of()),
                            keptOf.get(i));
                })
                .toList();
    }

    private AircraftDto of(Aircraft a, PlannerInspections due, List<SquawkDto> open, List<AircraftDueItem> kept) {
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
                open,
                a.getEquipment(),
                a.getSurveillance(),
                a.getColour(),
                kept.stream().map(DueItemService::toDto).toList(),
                AircraftService.handbookOf(a),
                AircraftService.figuresOf(a),
                new AirplaneKind(a.getCategory(), a.getAircraftClass(), a.getTailwheel()));
    }
}
