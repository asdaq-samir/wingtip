package app.wingtipmaps.gateway.dto;

import jakarta.validation.constraints.PastOrPresent;
import jakarta.validation.constraints.PositiveOrZero;
import java.time.LocalDate;
import org.springframework.lang.Nullable;

/** An airplane's inspections and tests as its owner records them from its
 *  maintenance records, all at once -- PUT /api/aircraft/{id}/inspections.
 *  Each may be left out: an airplane whose owner has not said is not
 *  called overdue, nor current. The ELT battery's date is the one marked on
 *  the transmitter (14 CFR 91.207(c)), and so may be ahead. `forHire` says
 *  whether it carries people or is given for instruction for hire, when
 *  91.409(b)'s 100-hour inspection applies; left out, it stays as it was. */
public record InspectionsRequest(
        @PastOrPresent(message = "annualOn cannot be in the future") @Nullable LocalDate annualOn,
        @PositiveOrZero(message = "hundredHourAtHours cannot be negative") @Nullable Double hundredHourAtHours,
        @PositiveOrZero(message = "hoursNow cannot be negative") @Nullable Double hoursNow,
        @PastOrPresent(message = "staticCheckOn cannot be in the future") @Nullable LocalDate staticCheckOn,
        @PastOrPresent(message = "transponderCheckOn cannot be in the future") @Nullable LocalDate transponderCheckOn,
        @PastOrPresent(message = "eltInspectedOn cannot be in the future") @Nullable LocalDate eltInspectedOn,
        @Nullable LocalDate eltBatteryDueOn,
        @Nullable Boolean forHire) {
}
