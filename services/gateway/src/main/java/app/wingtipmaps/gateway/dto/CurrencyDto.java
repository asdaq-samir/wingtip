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
 * had -- the logbook's totals, and their instrument currency.
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
        boolean trackingInWindow) {}
