package app.wingtipmaps.gateway.dto;

import app.wingtipmaps.gateway.domain.DueItemKind;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.LocalDate;
import org.springframework.lang.Nullable;

/** Something due on an airplane, as its owner keeps it: an AD's status
 *  (14 CFR 91.417(a)(2)(v)) or another item. */
public record DueItemDto(
        Long id,
        DueItemKind kind,
        String title,

        @Schema(
                description = "An AD's number and revision date, or the item's own reference",
                example = "AD 2011-10-09")
        @Nullable
        String reference,

        @Schema(description = "The method of compliance (91.417(a)(2)(v))") @Nullable
        String method,

        @Schema(description = "The day the next action is required, if by day") @Nullable
        LocalDate dueOn,

        @Schema(description = "The time in service the next action is required at, if by hours") @Nullable
        Double dueAtHours) {}
