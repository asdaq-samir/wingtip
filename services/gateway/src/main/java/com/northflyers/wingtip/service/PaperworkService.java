package com.northflyers.wingtip.service;

import com.northflyers.wingtip.domain.Aircraft;
import com.northflyers.wingtip.domain.AircraftDueItem;
import com.northflyers.wingtip.domain.DueItemKind;
import com.northflyers.wingtip.domain.Pilot;
import com.northflyers.wingtip.dto.CurrencyDto;
import com.northflyers.wingtip.dto.PaperworkDto;
import com.northflyers.wingtip.repository.AircraftRepository;
import com.northflyers.wingtip.repository.LogbookRepository;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import org.springframework.stereotype.Service;

/**
 * What falls due for a pilot and their airplanes, each with the rule that
 * asks for it: the app's "Coming up" list (GET /api/paperwork) and the
 * reminder emails (ReminderService) read the same list.
 *
 * <p>No day here is worked out in Java: the pilot's come from the engine's
 * pilot_currency, the airplane's from its inspections_due (both through
 * the planner, PlannerClient), the ELT battery's is the date marked on the
 * transmitter (91.207(c)) and an owner's item's is the owner's. What this
 * adds is the list: which there are, in what words, and the days and
 * hours left to each.
 */
@Service
public class PaperworkService {

    /**
     * One thing that falls due. `key` is the reminder's, unique for the
     * pilot ("flight-review", "aircraft-12-annual", "item-40"); `lead` the
     * reminder sentence's start, to which the day is added; `emailed`
     * whether a reminder is sent for it -- not for the VOR check, which
     * runs out every 30 days for an IFR airplane and is checked before a
     * flight, not planned for.
     */
    public record Due(String what, String key, String title, String rule, Long aircraftId, String tailNumber, Long itemId,
                      LocalDate dueOn, Double dueAtHours, Double hoursNow, String lead, boolean emailed) {
    }

    private final LogbookRepository logbook;
    private final AircraftRepository aircraft;
    private final DueItemService items;
    private final PlannerClient planner;

    public PaperworkService(LogbookRepository logbook, AircraftRepository aircraft, DueItemService items,
                            PlannerClient planner) {
        this.logbook = logbook;
        this.aircraft = aircraft;
        this.items = items;
        this.planner = planner;
    }

    /** Everything that falls due for the pilot, as of `today`. */
    public List<Due> of(Pilot pilot, LocalDate today) {
        CurrencyDto c = planner.currency(logbook.findByPilotIdOrderByFlownOnDescIdDesc(pilot.getId()),
                pilot.getFlightReviewOn(), pilot.getMedicalExpiresOn(), pilot.getIpcOn(), today);
        List<Due> out = new ArrayList<>(ofPilot(c));
        for (Aircraft a : aircraft.findByPilotIdOrderByTailNumberAsc(pilot.getId())) {
            out.addAll(ofAircraft(a, planner.inspections(a.getAnnualOn(), a.getEltInspectedOn(), a.getStaticCheckOn(),
                    a.getTransponderCheckOn(), a.getHundredHourAtHours(), a.getVorCheckOn(),
                    a.getVorCheckKind() == null ? null : a.getVorCheckKind().name(), a.getVorCheckErrorDeg()),
                    items.of(a.getId())));
        }
        return out;
    }

    /** The pilot's own: the flight review (14 CFR 61.56(c)), the medical
     *  (61.23), passengers by day and at night (61.57(a), (b)) and
     *  instrument currency (61.57(c)), each where it can be had. */
    public static List<Due> ofPilot(CurrencyDto c) {
        List<Due> out = new ArrayList<>();
        pilot(out, "flight-review", "Flight review", "14 CFR 61.56(c)", c.flightReviewUntil(), "Your flight review runs out");
        pilot(out, "medical", "Medical certificate", "14 CFR 61.23", c.medicalExpiresOn(), "Your medical certificate runs out");
        pilot(out, "day-passengers", "Passengers by day", "14 CFR 61.57(a)", c.dayPassengersUntil(),
                "You may carry passengers by day until");
        pilot(out, "night-passengers", "Passengers at night", "14 CFR 61.57(b)", c.nightPassengersUntil(),
                "You may carry passengers at night until");
        pilot(out, "instrument", "Instrument currency", "14 CFR 61.57(c)", c.instrumentCurrentUntil(),
                "Your instrument currency runs out");
        return out;
    }

    private static void pilot(List<Due> out, String what, String title, String rule, LocalDate until, String lead) {
        if (until != null) {
            out.add(new Due(what, what, title, rule, null, null, null, until, null, null, lead, true));
        }
    }

    /**
     * An airplane's: the annual (14 CFR 91.409(a)), the 100-hour where it is
     * flown for hire (91.409(b)), the ELT's inspection (91.207(d)) and its
     * battery (91.207(c)), the altimeter and static system (91.411(a)), the
     * transponder (91.413(a)) and the VOR check (91.171(a)(2)) -- each as
     * recorded, so one never recorded is not listed -- and the owner's
     * items. `due` may be null where no answer was had.
     */
    public static List<Due> ofAircraft(Aircraft a, PlannerClient.Inspections due, List<AircraftDueItem> kept) {
        List<Due> out = new ArrayList<>();
        String tail = a.getTailNumber();
        if (due != null) {
            plane(out, a, "annual", "Annual inspection", "14 CFR 91.409(a)", due.annualUntil(), tail + "'s annual inspection runs out");
            if (a.isForHire() && due.hundredHourDueAtHours() != null) {
                out.add(new Due("hundred-hour", "aircraft-" + a.getId() + "-hundred-hour", "100-hour inspection",
                        "14 CFR 91.409(b)", a.getId(), tail, null, null, due.hundredHourDueAtHours(), a.getHoursNow(),
                        tail + "'s 100-hour inspection is due", false));
            }
            plane(out, a, "elt", "ELT inspection", "14 CFR 91.207(d)", due.eltUntil(), tail + "'s ELT inspection runs out");
        }
        plane(out, a, "elt-battery", "ELT battery", "14 CFR 91.207(c)", a.getEltBatteryDueOn(),
                tail + "'s ELT battery is to be replaced by");
        if (due != null) {
            plane(out, a, "static", "Altimeter and static system", "14 CFR 91.411(a)", due.staticCheckUntil(),
                    tail + "'s altimeter and static system test runs out");
            plane(out, a, "transponder", "Transponder", "14 CFR 91.413(a)", due.transponderCheckUntil(),
                    tail + "'s transponder test runs out");
            if (due.vorCheck() != null && due.vorCheck().within()) {
                out.add(new Due("vor-check", "aircraft-" + a.getId() + "-vor-check", "VOR check for IFR",
                        "14 CFR 91.171(a)(2)", a.getId(), tail, null, due.vorCheck().until(), null, null,
                        tail + "'s VOR check runs out", false));
            }
        }
        for (AircraftDueItem i : kept) {
            if (i.getDueOn() == null && i.getDueAtHours() == null) {
                continue;
            }
            // An AD's own number is its rule; part 39 makes it binding
            // (14 CFR 39.7).
            String rule = i.getKind() == DueItemKind.AD
                    ? (i.getReference() == null ? "14 CFR 39.7" : i.getReference() + ", 14 CFR 39.7")
                    : i.getReference();
            String named = i.getKind() == DueItemKind.AD && i.getReference() != null
                    ? i.getReference() + " (" + i.getTitle() + ")" : i.getTitle();
            out.add(new Due("item", "item-" + i.getId(), i.getTitle(), rule, a.getId(), tail, i.getId(), i.getDueOn(),
                    i.getDueAtHours(), a.getHoursNow(), tail + ": " + named + " is due", i.getDueOn() != null));
        }
        return out;
    }

    private static void plane(List<Due> out, Aircraft a, String what, String title, String rule, LocalDate until,
                              String lead) {
        if (until != null) {
            out.add(new Due(what, "aircraft-" + a.getId() + "-" + what, title, rule, a.getId(), a.getTailNumber(), null,
                    until, null, null, lead, true));
        }
    }

    /** The list as the app reads it: by day, soonest first, then by hours
     *  left, then those whose hours now are not known. */
    public static PaperworkDto toDto(List<Due> due, LocalDate today) {
        List<PaperworkDto.DueDto> out = due.stream().map(d -> new PaperworkDto.DueDto(d.what(), d.title(), d.rule(),
                d.aircraftId(), d.tailNumber(), d.itemId(), d.dueOn(),
                d.dueOn() == null ? null : ChronoUnit.DAYS.between(today, d.dueOn()),
                d.dueAtHours(),
                d.dueAtHours() == null || d.hoursNow() == null ? null
                        : Math.round((d.dueAtHours() - d.hoursNow()) * 10) / 10.0))
                .sorted(Comparator.comparing(PaperworkDto.DueDto::daysLeft, Comparator.nullsLast(Comparator.naturalOrder()))
                        .thenComparing(PaperworkDto.DueDto::hoursLeft, Comparator.nullsLast(Comparator.naturalOrder())))
                .toList();
        return new PaperworkDto(today, out);
    }
}
