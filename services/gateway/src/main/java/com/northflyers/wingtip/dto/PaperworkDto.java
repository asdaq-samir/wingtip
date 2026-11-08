package com.northflyers.wingtip.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDate;
import java.util.List;
import org.springframework.lang.Nullable;

/** What falls due for the pilot and their airplanes, soonest first, each
 *  with the rule that asks for it -- GET /api/paperwork. The days come
 *  from the engine (pilot_currency, inspections_due, through the planner)
 *  and the owner's own items; the days and hours left are counted from
 *  `today`. */
public record PaperworkDto(
        @Schema(description = "The day the days left are counted from") LocalDate today,
        List<DueDto> items) {

    @Schema(description = "One thing that falls due: the pilot's currency, an airplane's inspection, or an item its "
            + "owner keeps")
    public record DueDto(
            @Schema(description = "What it is, as a key: flight-review, medical, day-passengers, night-passengers, "
                    + "instrument; annual, hundred-hour, elt, elt-battery, static, transponder, vor-check; item",
                    example = "annual")
            String what,
            @Schema(example = "Annual inspection") String title,
            @Schema(description = "The rule that asks for it, or an AD's number", example = "14 CFR 91.409(a)")
            @Nullable String rule,
            @Schema(description = "The airplane's, for an airplane's") @Nullable Long aircraftId,
            @Nullable String tailNumber,
            @Schema(description = "The due item's, for an owner's item") @Nullable Long itemId,
            @Schema(description = "The last day it is good for, or the day it is due") @Nullable LocalDate dueOn,
            @Schema(description = "Days from today to dueOn: 0 today, below 0 past") @Nullable Long daysLeft,
            @Schema(description = "The time in service it is due at") @Nullable Double dueAtHours,
            @Schema(description = "Hours from the time in service now, where the owner gave it") @Nullable Double hoursLeft) {
    }
}
