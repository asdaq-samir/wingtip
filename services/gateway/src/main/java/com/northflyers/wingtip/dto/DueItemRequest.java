package com.northflyers.wingtip.dto;

import com.northflyers.wingtip.domain.DueItemKind;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import org.springframework.lang.Nullable;

/** A due item as its form sends it -- POST and PUT
 *  /api/aircraft/{id}/due-items. An AD's status as 14 CFR
 *  91.417(a)(2)(v) asks it kept: its number and revision date
 *  (`reference`), the method of compliance, and when the next action is
 *  required, by day, by time in service, both or neither. */
public record DueItemRequest(
        @NotNull(message = "kind is required") DueItemKind kind,
        @NotBlank(message = "title is required") @Size(max = 120, message = "title must be at most 120 characters")
        String title,
        @Nullable @Size(max = 60, message = "reference must be at most 60 characters") String reference,
        @Nullable @Size(max = 200, message = "method must be at most 200 characters") String method,
        @Nullable LocalDate dueOn,
        @Nullable @PositiveOrZero(message = "dueAtHours cannot be negative") Double dueAtHours) {
}
