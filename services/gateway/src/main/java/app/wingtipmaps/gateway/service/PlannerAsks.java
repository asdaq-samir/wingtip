package app.wingtipmaps.gateway.service;

import app.wingtipmaps.gateway.domain.LogbookEntry;
import app.wingtipmaps.gateway.dto.ExperienceItemDto;
import app.wingtipmaps.gateway.dto.ReviewCheckDto;
import app.wingtipmaps.gateway.planner.model.PlannerExperienceAsk;
import app.wingtipmaps.gateway.planner.model.PlannerExperienceItem;
import app.wingtipmaps.gateway.planner.model.PlannerHeldEndorsement;
import app.wingtipmaps.gateway.planner.model.PlannerLogbookEntry;
import app.wingtipmaps.gateway.planner.model.PlannerReviewCheck;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/**
 * The planner's asks made from this app's records, and its answers made
 * into this app's own: what PlannerClient, PaperworkClient and the
 * services that batch their asks (InstructorService, the aircraft list)
 * share, with no call of their own.
 */
public final class PlannerAsks {

    private PlannerAsks() {}

    /** The ask of {@link PlannerClient#experience}, for a batch ({@link PlannerClient#records}). */
    public static PlannerExperienceAsk experienceAsk(List<LogbookEntry> entries, LocalDate today) {
        return new PlannerExperienceAsk(entriesOf(entries), today);
    }

    /** 61.109(a)'s items as the planner answers them, as this app's own. */
    public static List<ExperienceItemDto> experienceOf(List<PlannerExperienceItem> items) {
        return items.stream()
                .map(i -> new ExperienceItemDto(
                        i.getKey(),
                        i.getRule(),
                        i.getLabel(),
                        i.getHave().doubleValue(),
                        i.getNeed().doubleValue(),
                        i.getUnit().getValue(),
                        i.getMet()))
                .toList();
    }

    /** The columns the planner's rules read, as its LogbookEntry has them. */
    public static List<PlannerLogbookEntry> entriesOf(List<LogbookEntry> entries) {
        return entries.stream()
                .map(e -> new PlannerLogbookEntry(e.getFlownOn())
                        .totalHours(decimal(e.getTotalHours()))
                        .nightHours(decimal(e.getNightHours()))
                        .crossCountryHours(decimal(e.getCrossCountryHours()))
                        .dayLandings(e.getDayLandings())
                        .nightLandings(e.getNightLandings())
                        .dualHours(decimal(e.getDualHours()))
                        .soloHours(decimal(e.getSoloHours()))
                        .instrumentHours(decimal(e.getInstrumentHours()))
                        .toweredLandings(e.getToweredLandings())
                        .distanceNm(decimal(e.getDistanceNm()))
                        .longestLegNm(decimal(e.getLongestLegNm()))
                        .approaches(e.getApproaches())
                        .holding(e.isHolding())
                        .tracking(e.isTracking())
                        // 14 CFR 61.57(a)(1)(ii): the category, class and
                        // tailwheel passenger currency is judged by, null
                        // where the pilot didn't say (the engine then says
                        // it can't tell, never current).
                        .category(e.getCategory())
                        .propertyClass(e.getAircraftClass())
                        .tailwheel(e.getTailwheel())
                        .fullStopLandings(fullStops(e)))
                .toList();
    }

    /** The landings to a full stop, as the pilot gave them; for an entry
     *  drawn from the app's own track, whose touch-and-goes the engine
     *  counted among the day landings, the rest of them; else none said. */
    static Integer fullStops(LogbookEntry e) {
        if (e.getFullStopLandings() != null) {
            return e.getFullStopLandings();
        }
        return e.isFromTrack() ? Math.max(0, e.getDayLandings() - e.getTouchAndGoes()) + e.getNightLandings() : null;
    }

    /** An endorsement held, as the engine reads one: its code, the day it
     *  was given, and the make and model it names where it says. */
    public static PlannerHeldEndorsement held(String code, LocalDate on, String makeModel) {
        return new PlannerHeldEndorsement(code, on).makeModel(makeModel);
    }

    /** One of 61.93(d)'s checks, as this app sends it on. */
    public static ReviewCheckDto checkOf(PlannerReviewCheck c) {
        return new ReviewCheckDto(c.getRule(), c.getLabel(), c.getMet(), c.getDetail());
    }

    /** A JSON number, which the generated types hold as BigDecimal (the
     *  pom says why), as the Double this app keeps; null where none. */
    public static Double number(BigDecimal n) {
        return n == null ? null : n.doubleValue();
    }

    public static BigDecimal decimal(Double d) {
        return d == null ? null : BigDecimal.valueOf(d);
    }
}
