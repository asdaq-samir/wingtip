package app.wingtipmaps.gateway.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import org.jspecify.annotations.Nullable;

/** Inbound request body for adding or editing one of a pilot's own
 *  aeroplanes -- POST/PUT /api/aircraft. The cruise power, the climb's
 *  speed and burn and `usableFuelGal` may be left out, and so may the
 *  flight plan's items (FAA Form 7233-4: item 10a's equipment, 10b's
 *  surveillance, 19's colour and markings). Blank is none.
 *
 *  <p>What each field may be is the engine's aircraft_problems, the one
 *  statement of the limits the apps check the form with too, which
 *  AircraftLimits asks before a save: this record states none of them.
 *
 *  <p>Its own handbook figures (OwnFigures) go with the rest; left out
 *  altogether, as a client from before them sends, they stay as they were. */
public record AircraftRequest(
        String tailNumber,
        String typeDesignator,
        double cruiseTasKt,
        double fuelBurnGph,
        @Nullable Double cruisePowerPct,
        @Nullable Double climbTasKt,
        @Nullable Double climbFuelBurnGph,
        @Nullable Double descentIasKt,
        @Nullable Double descentFuelBurnGph,
        @Nullable Double usableFuelGal,
        @Nullable String equipment,
        @Nullable String surveillance,
        @Nullable String colour,

        @Schema(
                description = "Its own handbook figures, all at once (null in it clears one); left out, they stay as "
                        + "they were")
        @Valid
        @Nullable
        OwnFigures figures) {}
