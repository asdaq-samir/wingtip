package app.wingtipmaps.gateway.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Size;
import org.jspecify.annotations.Nullable;

/** A saved airplane's category, class and gear (V59), which passenger
 *  currency is judged by (14 CFR 61.57(a)(1)(ii)): each null where its
 *  owner hasn't said, a blank word none. */
@Schema(description = "Its category, class and gear (14 CFR 61.5(b), 61.57(a)(1)(ii)); each null where not said")
public record AirplaneKind(
        @Schema(description = "14 CFR 61.5(b)(1) category, \"Airplane\"")
        @Size(max = 20, message = "category must be at most 20 characters")
        @Nullable
        String category,

        @Schema(description = "14 CFR 61.5(b)(2) class, \"Single-engine land\"")
        @Size(max = 24, message = "aircraftClass must be at most 24 characters")
        @Nullable
        String aircraftClass,

        @Schema(description = "A tailwheel airplane; null where not said, judged as one (61.57(a)(1)(ii))") @Nullable
        Boolean tailwheel) {}
