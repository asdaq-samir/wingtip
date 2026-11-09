package app.wingtipmaps.gateway.dto;

import app.wingtipmaps.gateway.domain.Flight;
import app.wingtipmaps.gateway.domain.FlightShare;
import java.time.Instant;
import java.util.List;
import org.jspecify.annotations.Nullable;

/**
 * A flight another pilot shared, as whoever has its link reads it
 * (GET /api/shared-flights/{token}): the plan -- its route, stops,
 * altitudes, departure time and airplane type -- and the nav log filed
 * for it, to preview before using it.
 *
 * <p>Nothing of the pilot's own: no name, email, notes, risk assessment
 * or the flight's own name (which a pilot may write anything in), and
 * the N-number only where they turned it on for this share. Built here,
 * field by field, so a field added to {@link Flight} is never shared by
 * accident.
 */
public record SharedFlightDto(
        String departureIdent,
        String destinationIdent,
        /* The airports it lands at on the way, in order. */
        List<String> stops,
        /* The airplane's type designator ("C172"); null where none was flown. */
        @Nullable String aircraftType,
        /* The airplane's N-number, only where the pilot chose to share it. */
        @Nullable String aircraftTailNumber,
        @Nullable Integer cruiseAltitudeFt,
        @Nullable Double totalDistanceNm,
        @Nullable Double totalEteMin,
        @Nullable Double totalFuelGal,
        /* The departure time it was planned for; null for "about now". */
        @Nullable Instant plannedFor,
        /* The altitudes the pilot set at its points ("VPBNG:4500"). */
        @Nullable String altitudes,
        /* The other picks it was planned with, as the planner's address
         *  writes them (runways, procedures, holds, the alternate). */
        @Nullable String picks,
        List<FlightCheckpointDto> checkpoints,
        Instant sharedAt) {

    public static SharedFlightDto of(Flight f, FlightShare share) {
        return new SharedFlightDto(
                f.getDepartureIdent(),
                f.getDestinationIdent(),
                f.getStops(),
                f.getAircraft() == null ? null : f.getAircraft().getTypeDesignator(),
                share.isIncludeTail() && f.getAircraft() != null
                        ? f.getAircraft().getTailNumber()
                        : null,
                f.getCruiseAltitudeFt(),
                f.getTotalDistanceNm(),
                f.getTotalEteMin(),
                f.getTotalFuelGal(),
                f.getPlannedFor(),
                f.getOwnAltitudes(),
                f.getPicks(),
                f.getCheckpoints().stream().map(FlightCheckpointDto::of).toList(),
                share.getSharedAt());
    }
}
