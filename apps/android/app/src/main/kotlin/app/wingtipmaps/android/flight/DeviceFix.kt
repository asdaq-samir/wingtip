package app.wingtipmaps.android.flight

import android.content.Context
import android.location.Location
import androidx.core.location.LocationCompat
import androidx.core.location.altitude.AltitudeConverterCompat
import app.wingtipmaps.android.format.Units
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * The phone's own fix as own ship reads it (OwnShip.Fix): feet, knots,
 * degrees true, its altitude above mean sea level or none.
 *
 * The fix's own altitude (Location.getAltitude) is height above the WGS84
 * ellipsoid, not above mean sea level: over the US the geoid lies 30 to
 * 115 ft below it, and the ground alert, the traffic near and the track
 * are all MSL. Android 14 and later may give MSL with the fix
 * (Location.getMslAltitudeMeters); otherwise the geoid model adds it
 * (AltitudeConverterCompat, androidx.core:core-location-altitude,
 * Android's own AltitudeConverter on 14 and later). Where neither can, the
 * fix has no altitude rather than the ellipsoid's.
 * developer.android.com/reference/android/location/Location#getAltitude()
 */
object DeviceFix {
    /** The geoid's conversion, one fix at a time and in order, off the
     *  main thread: its first call reads the model from disk. */
    private val converting = Dispatchers.Default.limitedParallelism(1)

    /** Whether the fix wants the geoid's conversion before it is read:
     *  it has an altitude, but not one above sea level. */
    fun needsConverting(location: Location): Boolean = location.hasAltitude() && !LocationCompat.hasMslAltitude(location)

    /** The fix with its MSL altitude added where the geoid model can; left
     *  as it is where it cannot, when it goes without an altitude. */
    suspend fun converted(context: Context, location: Location): Location {
        withContext(converting) {
            try {
                AltitudeConverterCompat.addMslAltitudeToLocation(context, location)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                // No conversion: the fix goes without an altitude.
            }
        }
        return location
    }

    /** A fix as the flight pieces read it, its altitude above mean sea
     *  level or none. */
    fun of(location: Location): OwnShip.Fix =
        OwnShip.Fix(
            lat = location.latitude, lon = location.longitude,
            altitudeFt = mslFeet(
                location.hasAltitude(), LocationCompat.hasMslAltitude(location),
                if (LocationCompat.hasMslAltitude(location)) LocationCompat.getMslAltitudeMeters(location) else 0.0,
            ),
            trackDeg = if (location.hasBearing()) location.bearing.toDouble() else null,
            groundspeedKt = if (location.hasSpeed()) location.speed * Units.KT_PER_M_S else null,
            accuracyM = if (location.hasAccuracy()) location.accuracy.toDouble() else Double.NaN,
            atMs = location.time,
        )

    /** Feet above mean sea level from metres above it; none stays none,
     *  never the ellipsoid's height in its place. */
    fun mslFeet(mslMeters: Double?): Double? = mslMeters?.let { it * Units.FT_PER_M }

    /** The fix's altitude: MSL only when the fix has an altitude and an
     *  MSL one (Location.getMslAltitudeMeters on Android 14 and later,
     *  else the geoid model's conversion). The WGS-84 height is about 80 to
     *  115 ft off sea level over the lower 48 and the FAA calls uncorrected
     *  GPS altitude WGS-84 (AIM 1-1-17), so without MSL the answer is none. */
    fun mslFeet(hasAltitude: Boolean, hasMsl: Boolean, mslMeters: Double): Double? =
        if (hasAltitude && hasMsl) mslFeet(mslMeters) else null
}
