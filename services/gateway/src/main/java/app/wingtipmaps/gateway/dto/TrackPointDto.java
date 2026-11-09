package app.wingtipmaps.gateway.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import org.jspecify.annotations.Nullable;

/** One point of a flown track: when (ms since the epoch), where, and its
 *  GPS altitude in feet above sea level where the file had one. The time
 *  and the position are boxed and required: a point sent without them is
 *  refused, not kept at the epoch or at 0 N 0 E. */
public record TrackPointDto(
        @NotNull(message = "t is required") Long t,

        @NotNull(message = "lat is required")
        @DecimalMin(value = "-90", message = "lat must be at least -90")
        @DecimalMax(value = "90", message = "lat must be at most 90")
        Double lat,

        @NotNull(message = "lon is required")
        @DecimalMin(value = "-180", message = "lon must be at least -180")
        @DecimalMax(value = "180", message = "lon must be at most 180")
        Double lon,

        @Nullable Double altFt) {}
