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
        PlannerCurrencyAsk ask = new PlannerCurrencyAsk(PlannerClient.entriesOf(entries), today)
                .flightReviewOn(review)
                .medicalExpiresOn(medical)
                .ipcOn(ipc);
        return PlannerClient.rule("the currency", () -> planner.currency(ask), c -> List.copyOf(c.getDue()));
    }

    /**
     * An airplane's: its recorded inspections and checks, the ELT battery's
     * marked date, and the owner's items with a day or hours.
     *
     * @throws PlannerUnavailableException when the planner cannot be reached or refuses
     */
    public List<PlannerPaperworkDue> aircraft(Aircraft a, List<AircraftDueItem> kept) {
        PlannerInspectionsAsk ask = new PlannerInspectionsAsk()
                .tailNumber(a.getTailNumber())
                .forHire(a.isForHire())
                .annualOn(a.getAnnualOn())
                .eltOn(a.getEltInspectedOn())
                .eltBatteryDueOn(a.getEltBatteryDueOn())
                .staticCheckOn(a.getStaticCheckOn())
                .transponderCheckOn(a.getTransponderCheckOn())
                .hundredHourAtHours(PlannerClient.decimal(a.getHundredHourAtHours()))
                .kept(kept.stream().map(PaperworkClient::kept).toList());
        // As PlannerClient.inspections: the VOR check only with its day,
        // kind and error all recorded.
        if (a.getVorCheckOn() != null && a.getVorCheckKind() != null && a.getVorCheckErrorDeg() != null) {
            ask.vorCheck(new PlannerVorCheckAsk(
                    PlannerClient.decimal(a.getVorCheckErrorDeg()),
                    PlannerVorCheckAsk.KindEnum.fromValue(a.getVorCheckKind().name()),
                    a.getVorCheckOn()));
        }
        return PlannerClient.rule("the paperwork", () -> planner.inspections(ask), i -> List.copyOf(i.getDue()));
    }

    private static PlannerKeptItem kept(AircraftDueItem i) {
        return new PlannerKeptItem(
                        Math.toIntExact(i.getId()),
                        PlannerKeptItem.KindEnum.fromValue(i.getKind().name()),
                        i.getTitle())
                .reference(i.getReference())
                .dueOn(i.getDueOn())
                .dueAtHours(PlannerClient.decimal(i.getDueAtHours()));
    }
}
