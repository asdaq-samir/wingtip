package app.wingtipmaps.gateway.dto;

import org.jspecify.annotations.Nullable;

/** The airplane to be flown, which 14 CFR 61.57(a)(1)(ii) judges passenger
 *  currency for: its category and class ("Airplane", "Single-engine land")
 *  and whether it has a tailwheel (null: not said, judged as one). */
public record AirplaneFlown(
        String category, String aircraftClass, @Nullable Boolean tailwheel) {}
