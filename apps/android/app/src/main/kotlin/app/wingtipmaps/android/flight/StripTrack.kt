package app.wingtipmaps.android.flight

import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.generated.magneticVariation
import kotlin.math.roundToLong

/**
 * The figures strip's Track and GPS Alt, as the web's trackFigure and
 * gpsFigure give them (the owner, 2026-11-21: "replace Fuel with Track";
 * 2026-11-20: "The figures don't show gps altitude").
 */
object StripTrack {
    /**
     * The airplane's track over the ground in degrees magnetic, as a pilot
     * flies and ATC assigns headings by the compass: the engine's own on
     * the route (`in_flight`'s track_mag_deg), else the fix's true course
     * less the engine's WMM variation there (`magnetic_variation`; "east
     * is least", FAA-H-8083-25C, ch. 16). Null with no fix, no course in
     * it (a GPS gives none while stationary), or below flying speed (the
     * engine's `underway`): a course at a walk is noise. `variation` is
     * the engine's, a parameter so a test can give one.
     */
    fun of(
        fix: OwnShip.Fix?,
        underway: Boolean,
        magneticDeg: Double?,
        variation: (Double, Double) -> Double? = { lat, lon -> Engine.magneticVariation(lat, lon).getOrNull() },
    ): Double? {
        val trueDeg = fix?.trackDeg?.takeIf { it.isFinite() } ?: return null
        if (!underway) return null
        if (magneticDeg != null) return magneticDeg
        val east = variation(fix.lat, fix.lon) ?: return null
        return ((trueDeg - east) % 360 + 360) % 360
    }

    /** The GPS's height to the nearest 10 ft, no finer than a GPS gives
     *  it: the fix's altitude over mean sea level (OwnShip), never the
     *  altimeter's, which is set to the local pressure (14 CFR 91.121). */
    fun tens(feet: Double): Double = (feet / 10).roundToLong() * 10.0
}
