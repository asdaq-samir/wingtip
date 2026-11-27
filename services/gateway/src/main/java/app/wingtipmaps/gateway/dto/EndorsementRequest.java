package app.wingtipmaps.gateway.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import org.jspecify.annotations.Nullable;

/** The day an endorsement was given, and the make and model it names where
 *  it names one (a solo's or a solo cross-country's: 14 CFR 61.87(n),
 *  61.93(c)(2)) -- PUT /api/training/endorsements/{code}. */
public record EndorsementRequest(
        @NotNull(message = "endorsedOn is required") LocalDate endorsedOn,

        @Size(max = 80, message = "makeModel is at most 80 characters") @Nullable
        String makeModel) {}
