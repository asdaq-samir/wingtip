package app.wingtipmaps.gateway.service;

import app.wingtipmaps.gateway.domain.Aircraft;
import app.wingtipmaps.gateway.domain.AircraftDueItem;
import app.wingtipmaps.gateway.domain.Pilot;
import app.wingtipmaps.gateway.dto.PaperworkDto;
import app.wingtipmaps.gateway.planner.model.PlannerPaperworkDue;
import app.wingtipmaps.gateway.repository.AircraftRepository;
import app.wingtipmaps.gateway.repository.LogbookRepository;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;

/**
 * What falls due for a pilot and their airplanes, each with the rule that
 * asks for it: the app's "Coming up" list (GET /api/paperwork) and the
 * reminder emails (ReminderService) read the same list.
 *
 * <p>Nothing here is decided in Java: each item, its name and the rule it
 * cites come from the engine's pilot_currency and inspections_due (through
 * the planner, PaperworkClient), with their days and hours. What this adds
 * is the list: the reminders' keys, the days and hours left to each, and
 * which are emailed.
 */
@Service
public class PaperworkService {

    /**
     * One thing that falls due. `key` is the reminder's, unique for the
     * pilot ("flight-review", "aircraft-12-annual", "item-40"); `lead` the
     * reminder sentence's start, to which the day is added; `emailed`
     * whether a reminder is sent for it -- only for one that falls due on a
     * day, and not for the VOR check, which runs out every 30 days for an
     * IFR airplane and is checked before a flight, not planned for.
     */
    public record Due(
            String what,
            String key,
            String title,
            String rule,
            Long aircraftId,
            String tailNumber,
            Long itemId,
            LocalDate dueOn,
            Double dueAtHours,
            Double hoursNow,
            String lead,
            boolean emailed) {}

    private final LogbookRepository logbook;
    private final AircraftRepository aircraft;
    private final DueItemService items;
    private final PaperworkClient planner;

    public PaperworkService(
            LogbookRepository logbook, AircraftRepository aircraft, DueItemService items, PaperworkClient planner) {
        this.logbook = logbook;
        this.aircraft = aircraft;
        this.items = items;
        this.planner = planner;
    }

    /** Everything that falls due for the pilot, as of `today`. */
    public List<Due> of(Pilot pilot, LocalDate today) {
        List<Due> out = new ArrayList<>(ofPilot(planner.pilot(
                logbook.findByPilotIdOrderByFlownOnDescIdDesc(pilot.getId()),
                pilot.getFlightReviewOn(),
                pilot.getMedicalExpiresOn(),
                pilot.getIpcOn(),
                today)));
        List<Aircraft> theirs = aircraft.findByPilotIdOrderByTailNumberAsc(pilot.getId());
        Map<Long, List<AircraftDueItem>> kept =
                items.of(theirs.stream().map(Aircraft::getId).toList());
        // Every airplane asked in one call, its answers in the same order.
        List<List<PlannerPaperworkDue>> due = planner.aircraft(theirs, kept);
        for (int i = 0; i < theirs.size() && i < due.size(); i++) {
            out.addAll(ofAircraft(theirs.get(i), due.get(i)));
        }
        return out;
    }

    /** The pilot's own, as the engine lists them (pilot_currency's `due`). */
    public static List<Due> ofPilot(List<PlannerPaperworkDue> due) {
        return due.stream().map(d -> due(d, null)).toList();
    }

    /** An airplane's, as the engine lists them (inspections_due's `due`):
     *  its inspections and checks as recorded, then the owner's items. */
    public static List<Due> ofAircraft(Aircraft a, List<PlannerPaperworkDue> due) {
        return due.stream().map(d -> due(d, a)).toList();
    }

    private static Due due(PlannerPaperworkDue d, Aircraft a) {
        Long itemId = d.getItemId() == null ? null : d.getItemId().longValue();
        String key = a == null
                ? d.getWhat()
                : itemId != null ? "item-" + itemId : "aircraft-" + a.getId() + "-" + d.getWhat();
        Double hours = PlannerAsks.number(d.getDueAtHours());
        return new Due(
                d.getWhat(),
                key,
                d.getLabel(),
                d.getRule(),
                a == null ? null : a.getId(),
                a == null ? null : a.getTailNumber(),
                itemId,
                d.getUntil(),
                hours,
                hours == null || a == null ? null : a.getHoursNow(),
                d.getLead(),
                d.getUntil() != null && !"vor-check".equals(d.getWhat()));
    }

    /** The list as the app reads it: by day, soonest first, then by hours
     *  left, then those whose hours now are not known. */
    public static PaperworkDto toDto(List<Due> due, LocalDate today) {
        List<PaperworkDto.DueDto> out = due.stream()
                .map(d -> new PaperworkDto.DueDto(
                        d.what(),
                        d.title(),
                        d.rule(),
                        d.aircraftId(),
                        d.tailNumber(),
                        d.itemId(),
                        d.dueOn(),
                        d.dueOn() == null ? null : ChronoUnit.DAYS.between(today, d.dueOn()),
                        d.dueAtHours(),
                        d.dueAtHours() == null || d.hoursNow() == null
                                ? null
                                : Math.round((d.dueAtHours() - d.hoursNow()) * 10) / 10.0))
                .sorted(Comparator.comparing(
                                PaperworkDto.DueDto::daysLeft, Comparator.nullsLast(Comparator.naturalOrder()))
                        .thenComparing(PaperworkDto.DueDto::hoursLeft, Comparator.nullsLast(Comparator.naturalOrder())))
                .toList();
        return new PaperworkDto(today, out);
    }
}
