package app.wingtipmaps.gateway.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import java.util.List;
import org.jspecify.annotations.Nullable;

/** An airplane's handbook figures in the app's units, as its pilot
 *  confirmed them from a photographed page: the engine contract's
 *  HandbookFigures (handbook_read_check's `handbook`, asked with only the
 *  confirmed items), member for member, so the apps' generated models
 *  type them. Kept as sent: the engine checked them, and the gateway
 *  works none of it out. The lists' most are far past a handbook's
 *  tables, only so a body cannot grow without end. */
@Schema(description = "An airplane's handbook figures in the app's units (the engine contract's HandbookFigures)")
public record HandbookFigures(
        @Size(max = 60) @Valid List<Cruise> cruise,
        @Nullable Double climb_speed_kias,
        @Nullable Double climb_rate_fpm,
        @Nullable Double climb_burn_gph,
        @Nullable Double glide_speed_kias,
        @Nullable Double glide_ratio,
        @Size(max = 60) @Valid List<Distance> takeoff,
        @Size(max = 60) @Valid List<Distance> landing,
        @Nullable Double empty_weight_lb,
        @Nullable Double empty_arm_in,
        @Nullable Double max_takeoff_weight_lb,
        @Size(max = 30) @Valid List<Corner> envelope,
        @Nullable Double fuel_total_gal,
        @Nullable Double usable_fuel_gal) {

    @Schema(description = "A cruise performance table's row: pressure altitude, power, RPM, true airspeed, fuel burn")
    public record Cruise(
            double altitude_ft,
            @Nullable Double power_pct,
            @Nullable Double rpm,
            double tas_kt,
            double burn_gph) {}

    @Schema(description = "A takeoff or landing distance table's row: ground roll and total over a 50 ft obstacle")
    public record Distance(
            double pressure_altitude_ft, double temp_c, double ground_roll_ft, double over_obstacle_ft) {}

    @Schema(description = "A corner of the CG envelope: arm aft of the datum and weight")
    public record Corner(double arm_in, double weight_lb) {}
}
