package app.wingtipmaps.gateway.service;

import app.wingtipmaps.gateway.domain.Aircraft;
import app.wingtipmaps.gateway.domain.AircraftDueItem;
import app.wingtipmaps.gateway.domain.LogbookEntry;
import app.wingtipmaps.gateway.planner.model.PlannerCurrencyAsk;
import app.wingtipmaps.gateway.planner.model.PlannerInspectionsAsk;
import app.wingtipmaps.gateway.planner.model.PlannerKeptItem;
import app.wingtipmaps.gateway.planner.model.PlannerPaperworkDue;
import app.wingtipmaps.gateway.planner.model.PlannerVorCheckAsk;
import app.wingtipmaps.gateway.upstream.PlannerApi;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Component;

/**
 * What falls due, as the planner names and cites each item: the engine's
 * pilot_currency and inspections_due answer a `due` list with their dates
 * (engine/crates/pilot/src/pilot/paperwork.rs), so which regulation an
 * item cites (61.56(c), 91.409(b), an AD's number with 14 CFR 39.7) and
 * what it is called are the engine's, not this app's (CLAUDE.md: Spring
 * Boot holds no aviation logic). PaperworkService lists what this gives.
 * Asked as PlannerClient asks every rule (its `rule`: sent once more where
 * the planner could not be reached).
 */
@Component
public class PaperworkClient {

    private final PlannerApi planner;

    public PaperworkClient(PlannerApi planner) {
        this.planner = planner;
    }

    /**
     * The pilot's: the flight review, the medical, passengers by day and at
     * night and instrument currency, each where it can be had.
     *
     * @throws PlannerUnavailableException when the planner cannot be reached or refuses
     */
    public List<PlannerPaperworkDue> pilot(
            List<LogbookEntry> entries, LocalDate review, LocalDate medical, LocalDate ipc, LocalDate today) {
        PlannerCurrencyAsk ask = new PlannerCurrencyAsk(PlannerAsks.entriesOf(entries), today)
                .flightReviewOn(review)
                .medicalExpiresOn(medical)
                .ipcOn(ipc);
        return PlannerRules.rule("the currency", () -> planner.currency(ask), c -> List.copyOf(c.getDue()));
    }

    /**
     * Each airplane's, in order, in one round trip: its recorded
     * inspections and checks, the ELT battery's marked date, and the
     * owner's items with a day or hours ({@code kept}, by airplane id).
     * One ask an airplane was 1 + A calls a pilot in the daily reminders
     * (waste-server audit C).
     *
     * @throws PlannerUnavailableException when the planner cannot be reached or refuses
     */
    public List<List<PlannerPaperworkDue>> aircraft(List<Aircraft> all, Map<Long, List<AircraftDueItem>> kept) {
        if (all.isEmpty()) {
            return List.of();
        }
        List<PlannerInspectionsAsk> asks = all.stream()
                .map(a -> askOf(a, kept.getOrDefault(a.getId(), List.of())))
                .toList();
        return PlannerClient.inspectionsOf(planner, "the paperwork", asks).stream()
                .map(i -> List.copyOf(i.getDue()))
                .toList();
    }

    /**
     * What the engine's inspections_due is asked of an airplane: its
     * registration and whether it is flown for hire, the days its
     * inspections and checks were done and the hours of its last
     * 100-hour, the ELT battery's marked date and the owner's items. The
     * aircraft list (AircraftDtos) and the paperwork list ask the same.
     */
    public static PlannerInspectionsAsk askOf(Aircraft a, List<AircraftDueItem> kept) {
        PlannerInspectionsAsk ask = new PlannerInspectionsAsk()
                .tailNumber(a.getTailNumber())
                .forHire(a.isForHire())
                .annualOn(a.getAnnualOn())
                .eltOn(a.getEltInspectedOn())
                .eltBatteryDueOn(a.getEltBatteryDueOn())
                .staticCheckOn(a.getStaticCheckOn())
                .transponderCheckOn(a.getTransponderCheckOn())
                .hundredHourAtHours(PlannerAsks.decimal(a.getHundredHourAtHours()))
                .kept(kept.stream().map(PaperworkClient::kept).toList());
        // The VOR check only with its day, kind and error all recorded.
        if (a.getVorCheckOn() != null && a.getVorCheckKind() != null && a.getVorCheckErrorDeg() != null) {
            ask.vorCheck(new PlannerVorCheckAsk(
                    PlannerAsks.decimal(a.getVorCheckErrorDeg()),
                    PlannerVorCheckAsk.KindEnum.fromValue(a.getVorCheckKind().name()),
                    a.getVorCheckOn()));
        }
        return ask;
    }

    private static PlannerKeptItem kept(AircraftDueItem i) {
        return new PlannerKeptItem(
                        Math.toIntExact(i.getId()),
                        PlannerKeptItem.KindEnum.fromValue(i.getKind().name()),
                        i.getTitle())
                .reference(i.getReference())
                .dueOn(i.getDueOn())
                .dueAtHours(PlannerAsks.decimal(i.getDueAtHours()));
    }
}
