package app.wingtipmaps.gateway.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.Positive;
import org.jspecify.annotations.Nullable;

/** An airplane's own performance figures from its handbook, as its pilot
 *  gives them (V37): with them an airplane of a type the planner has no
 *  stock profile for is planned on its own figures alone, never another
 *  airplane's (the owner, 2026-11-09). Each may be left out, and is then
 *  missing: the app asks for it where it is needed. The service ceiling,
 *  climb rate, taxi fuel and glide ratio are held to the engine's ranges
 *  (airplane_figure_ranges), which AircraftLimits asks before a save, as
 *  the planner builds its own bounds from them: no copy here. Kept as sent:
 *  the gateway works none of it out. */
@Schema(description = "An airplane's own performance figures from its handbook; each null where not given")
public record OwnFigures(
        @Schema(description = "Its service ceiling, ft (the altitude where its best climb is 100 fpm)") @Nullable
        Double serviceCeilingFt,

        @Schema(description = "Its best rate of climb at sea level, fpm") @Nullable
        Double climbRateFpm,

        @Schema(description = "Its fuel for engine start, taxi and takeoff, gal") @Nullable
        Double taxiFuelGal,

        @Schema(description = "Its still-air glide ratio, propeller windmilling, flaps up (its handbook's Section 3)")
        @Nullable
        Double glideRatio,

        @Schema(description = "Its basic empty weight, lb, from its weight and balance record")
        @Positive(message = "emptyWeightLb must be a positive number")
        @DecimalMax(value = "20000", message = "emptyWeightLb must be at most 20,000 lb")
        @Nullable
        Double emptyWeightLb,

        @Schema(description = "Its basic empty moment, lb-in, from its weight and balance record")
        @Positive(message = "emptyMomentLbIn must be a positive number")
        @Nullable
        Double emptyMomentLbIn) {

    /** None given. */
    public static final OwnFigures NONE = new OwnFigures(null, null, null, null, null, null);

    /** These, with `more`'s given ones over them: what an inline ask
     *  saves, one figure at a time, leaving the rest as they were. */
    public OwnFigures with(OwnFigures more) {
        return new OwnFigures(
                more.serviceCeilingFt != null ? more.serviceCeilingFt : serviceCeilingFt,
                more.climbRateFpm != null ? more.climbRateFpm : climbRateFpm,
                more.taxiFuelGal != null ? more.taxiFuelGal : taxiFuelGal,
                more.glideRatio != null ? more.glideRatio : glideRatio,
                more.emptyWeightLb != null ? more.emptyWeightLb : emptyWeightLb,
                more.emptyMomentLbIn != null ? more.emptyMomentLbIn : emptyMomentLbIn);
    }
}
