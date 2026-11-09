package app.wingtipmaps.gateway.dto;

import app.wingtipmaps.gateway.domain.FlightCheckpoint;
import org.jspecify.annotations.Nullable;

/** One line of a filed nav log -- see {@link app.wingtipmaps.gateway.domain.FlightCheckpoint}
 *  for why the leg fields are nullable (the destination row has none,
 *  and an unflyable leg has no groundspeed/ETE/fuel answer), and why
 *  each row carries its own altitude. */
public record FlightCheckpointDto(
        int sequenceNo,
        String name,
        String category,
        double lat,
        double lon,
        double alongTrackNm,
        @Nullable Double legDistanceNm,
        @Nullable Double trueCourseDeg,
        @Nullable Double magneticHeadingDeg,
        @Nullable Double groundspeedKt,
        @Nullable Double eteMin,
        @Nullable Double fuelGal,
        @Nullable Double altitudeFt) {

    /** The row as the pilot's own flight and a flight shared with them read it. */
    public static FlightCheckpointDto of(FlightCheckpoint c) {
        return new FlightCheckpointDto(
                c.getSequenceNo(),
                c.getName(),
                c.getCategory(),
                c.getLat(),
                c.getLon(),
                c.getAlongTrackNm(),
                c.getLegDistanceNm(),
                c.getTrueCourseDeg(),
                c.getMagneticHeadingDeg(),
                c.getGroundspeedKt(),
                c.getEteMin(),
                c.getFuelGal(),
                c.getAltitudeFt());
    }
}
