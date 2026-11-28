package app.wingtipmaps.gateway.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDate;
import org.jspecify.annotations.Nullable;

/**
 * Where the pilot stands, from the logbook and the dates they give, as
 * the engine's pilot_currency works it out (asked through PlannerClient,
 * whose answer has these members): the last day they may carry passengers
 * by day and at night, the last day of their flight review's 24
 * calendar months and of their medical -- each null where it cannot be
 * had -- the logbook's totals, their instrument currency, and what the
 * logbook can't tell of passenger currency's category, class and
 * tailwheel (61.57(a)(1)): the passenger dates are only what it proves.
 */
public record CurrencyDto(
        @Nullable LocalDate dayPassengersUntil,
        @Nullable LocalDate nightPassengersUntil,
        @Nullable LocalDate flightReviewOn,
        @Nullable LocalDate flightReviewUntil,
        @Nullable LocalDate medicalExpiresOn,
        double totalHours,
        double nightHours,
        double crossCountryHours,
        int landings,
        int flights,

        @Schema(
                description = "The last day of instrument currency (14 CFR 61.57(c)(1), or 61.57(d)'s check); in the "
                        + "past where it has lapsed, null where none is logged")
        @Nullable
        LocalDate instrumentCurrentUntil,

        @Schema(
                description =
                        "The first day of an instrument currency not begun yet: approaches flown this month count from the first of "
                                + "next month (14 CFR 61.57(c)(1)), and until then the pilot is not current; null when current now")
        @Nullable
        LocalDate instrumentCurrentFrom,

        @Schema(description = "The last instrument proficiency check, as the pilot gives it") @Nullable
        LocalDate ipcOn,

        @Schema(description = "The day after which only an instrument proficiency check restores it (61.57(d))")
        @Nullable
        LocalDate ipcNeededAfter,

        @Schema(description = "Approaches logged in the 6 calendar months before this one")
        int approachesInWindow,

        @Schema(description = "Holding logged in them") boolean holdingInWindow,

        @Schema(description = "Intercepting and tracking courses logged in them")
        boolean trackingInWindow,

        @Schema(
                description = "The category and class passenger currency was judged in, \"airplane/single-engine land\": "
                        + "the airplane to be flown's, else the newest flight's (14 CFR 61.57(a)(1)); null where neither says")
        @Nullable
        String passengerClass,

        @Schema(description = "Whether the airplane judged has a tailwheel; null where not said, judged as one (61.57(a)(1)(ii))")
        @Nullable
        Boolean passengerTailwheel,

        @Schema(
                description = "A tailwheel's own passenger currency, for a pilot judged in a tricycle who has flown a tailwheel "
                        + "in the class (61.57(a)(1)(ii))")
        @Nullable
        LocalDate tailwheelPassengersUntil,

        @Schema(
                description = "What the logbook doesn't say, where the pilot would be current by day if it were so, "
                        + "\"Can't tell: ...\" (61.57(a)(1)); null where nothing unsaid matters")
        @Nullable
        String dayPassengersUnknown,

        @Schema(description = "The same at night (61.57(b)(1))") @Nullable
        String nightPassengersUnknown) {}
