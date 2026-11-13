package app.wingtipmaps.android.flight

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.location.Location
import android.os.Looper
import androidx.core.content.ContextCompat
import androidx.core.location.LocationCompat
import androidx.core.location.altitude.AltitudeConverterCompat
import androidx.datastore.preferences.core.longPreferencesKey
import app.wingtipmaps.android.Kept
import app.wingtipmaps.android.api.AheadAlert
import app.wingtipmaps.android.api.Planner
import app.wingtipmaps.android.api.ahead
import app.wingtipmaps.android.engine.CyclePacks
import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.generated.underway
import app.wingtipmaps.android.logbook.FlightRecorder
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Own ship: where the phone is, which way it is going and how fast, from
 * the fused location provider at one fix a second while the map is
 * shown, as the web app's useOwnShip and the iOS app's OwnShip keep it.
 * Nothing is worked out from the fix here but the figures of flying it:
 * what is ahead on the track, which the planner is asked for
 * (/api/airspace/ahead), or the packs on the phone when it cannot be
 * reached (CyclePacks.ahead).
 *
 * Kept going with the screen off or the app put away while flying, once
 * the pilot says so: Android's equivalent of iOS's background location
 * is a foreground service of the location type (OwnShipService), which
 * the system keeps alive, with the persistent notification Android
 * requires for one (Notifications.ownShip). It starts only on the pilot's
 * tap, never by itself: at flying speed the map asks Start Flight
 * (`offer`, StartFlightAsk), as Google Play's policy for a location
 * foreground service has it (a use the user starts: Play Console Help,
 * "Understanding foreground service and full-screen intent
 * requirements", answer 13392821), and it stops as the airplane slows
 * below flying speed. On the ground the reading stops with the app, as
 * any map's does.
 *
 * The permission is the screen's to ask through the system's request,
 * precise and approximate together as Android 12 and later require;
 * `start` reads `denied` from whether neither is held, and `approximate`
 * from whether only the approximate one is. An approximate position
 * (to within about three square kilometres, Android's
 * "approximate location") is no position to fly by:
 * the alerts ahead, the ground alert and the traffic near would all be
 * worked out from the wrong place, so no fixes are read from it at all
 * and the screen says why and asks again.
 */
class OwnShip(private val context: Context, private val trail: OwnTrail) {
    /** A fix as the flight pieces read it: feet, knots, degrees true,
     *  ms since 1970. Null where the provider did not send a figure. */
    data class Fix(
        val lat: Double,
        val lon: Double,
        val altitudeFt: Double?,
        val trackDeg: Double?,
        val groundspeedKt: Double?,
        val accuracyM: Double,
        val atMs: Long,
    )

    private val _fix = MutableStateFlow<Fix?>(null)
    val fix: StateFlow<Fix?> = _fix.asStateFlow()

    private val _denied = MutableStateFlow(false)
    val denied: StateFlow<Boolean> = _denied.asStateFlow()

    /** Only approximate location allowed (Android 12 and later let the
     *  pilot pick it): nothing is read, and the screen asks for precise. */
    private val _approximate = MutableStateFlow(false)
    val approximate: StateFlow<Boolean> = _approximate.asStateFlow()

    /** What the track runs into in the next minutes, from the planner or
     *  the packs. */
    private val _ahead = MutableStateFlow<List<AheadAlert>>(emptyList())
    val ahead: StateFlow<List<AheadAlert>> = _ahead.asStateFlow()

    /** The ground under the airplane from the packs kept on the phone,
     *  asked with what is ahead: the glide ring's ground (InFlight). */
    private val _groundFt = MutableStateFlow<Double?>(null)
    val groundFt: StateFlow<Double?> = _groundFt.asStateFlow()

    private val provider: FusedLocationProviderClient = LocationServices.getFusedLocationProviderClient(context)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var asking: Job? = null
    private var aheadEvery: Ticker.Registration? = null
    private var reading = false
    private var serving = false
    /** Whether the pilot has said Start Flight, or Not Now, this flight. */
    private val asked = StartFlight()

    /** At flying speed with the service not started: Start Flight asked. */
    private val _offer = MutableStateFlow(false)
    val offer: StateFlow<Boolean> = _offer.asStateFlow()

    /** Where the airplane last was, kept across launches so the map opens
     *  on it (the web's useOwnShip lastFix): written at most once a
     *  minute, the position alone. */
    private val kept = Kept.of(context, "own-ship")
    private var keptAtMs = 0L

    /** The last position kept, latitude and longitude; null before the
     *  first fix the phone ever read. */
    val lastPosition: Pair<Double, Double>?
        get() = if (KEPT_LAT !in kept) {
            null
        } else {
            Double.fromBits(kept[KEPT_LAT] ?: 0) to Double.fromBits(kept[KEPT_LON] ?: 0)
        }

    /** The last position forgotten: signed out, or the account deleted. */
    fun forgetLastPosition() {
        kept.edit { it.clear() }
        keptAtMs = 0L
    }

    /** The geoid's conversion, one fix at a time and in order, off the
     *  main thread: its first call reads the model from disk. */
    private val converting = Dispatchers.Default.limitedParallelism(1)

    private val callback = object : LocationCallback() {
        override fun onLocationResult(result: LocationResult) {
            val last = result.lastLocation ?: return
            // The fix's own altitude (Location.getAltitude) is height above
            // the WGS84 ellipsoid, not above mean sea level: over the US the
            // geoid lies 30 to 115 ft below it, and the ground alert, the
            // traffic near and the track are all MSL. Android 14 and later
            // may give MSL with the fix (Location.getMslAltitudeMeters);
            // otherwise the geoid model adds it (AltitudeConverterCompat,
            // androidx.core:core-location-altitude, Android's own
            // AltitudeConverter on 14 and later). Where neither can, the
            // fix has no altitude rather than the ellipsoid's.
            // developer.android.com/reference/android/location/Location#getAltitude()
            if (!last.hasAltitude() || LocationCompat.hasMslAltitude(last)) {
                took(fixOf(last))
                return
            }
            scope.launch {
                withContext(converting) {
                    try {
                        AltitudeConverterCompat.addMslAltitudeToLocation(context, last)
                    } catch (e: CancellationException) {
                        throw e
                    } catch (e: Exception) {
                        // No conversion: the fix goes without an altitude.
                    }
                }
                took(fixOf(last))
            }
        }
    }

    /** Whether precise location is allowed: what the dot, the alerts and
     *  the track need. */
    val permitted: Boolean
        get() = held(Manifest.permission.ACCESS_FINE_LOCATION)

    private fun held(permission: String): Boolean =
        ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED

    /** The fixes started, one a second: the map is shown. Nothing without
     *  the permission, and `denied` says so for the screen. */
    fun start() {
        // Checked here, in the method that asks the provider, so lint's
        // MissingPermission sees the check beside the call it guards.
        val precise = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
        val coarse = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
        _approximate.value = !precise && coarse
        _denied.value = !precise && !coarse
        if (!precise) {
            // Downgraded to approximate (or off) while reading: the
            // fixes stop with the permission.
            stop()
            return
        }
        if (!reading) {
            reading = true
            // One fix a second at the best accuracy, as the iOS app asks
            // Core Location: what the alerts ahead and the path need.
            val request = com.google.android.gms.location.LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, EVERY_MS)
                .setMinUpdateIntervalMillis(EVERY_MS)
                .build()
            try {
                provider.requestLocationUpdates(request, callback, Looper.getMainLooper())
            } catch (e: SecurityException) {
                reading = false
                _denied.value = true
                return
            }
        }
        if (aheadEvery == null) aheadEvery = Ticker.shared.every(AHEAD_EVERY_MS) { askAhead() }
    }

    /** The fixes stopped: the map is put away on the ground. In the air
     *  the service keeps the reading (stopService is `landed`'s). */
    fun stop() {
        if (!reading) return
        reading = false
        provider.removeLocationUpdates(callback)
        aheadEvery?.cancel()
        aheadEvery = null
        asking?.cancel()
        // Own ship turned off ends the flight's service; on again in the
        // air, Start Flight is asked again.
        asked.off()
        _offer.value = false
        serve(false)
    }

    private fun took(fix: Fix) {
        // A fix converted after the reading stopped is left out.
        if (!reading) return
        // A fix converted late can be overtaken by a newer one that needed
        // no conversion; time does not go backwards for the trail and the
        // alerts.
        if (_fix.value.let { it != null && fix.atMs <= it.atMs }) return
        _fix.value = fix
        if (fix.atMs - keptAtMs >= KEEP_EVERY_MS) {
            keptAtMs = fix.atMs
            kept.edit {
                it[KEPT_LAT] = fix.lat.toRawBits()
                it[KEPT_LON] = fix.lon.toRawBits()
            }
        }
        // The path flown, and the phone's position kept with the screen
        // off only while flying and only once the pilot has said Start
        // Flight: offered as the airplane reaches flying speed, stopped as
        // it slows below it, when the next flight asks again.
        flying(trail.took(fix))
        // The track the logbook is drawn from, ground and air alike.
        FlightRecorder.of(context).took(fix)
    }

    private fun flying(now: Boolean) {
        val (offer, serveNow) = asked.took(now)
        _offer.value = offer
        serve(serveNow)
    }

    /** Start Flight tapped: the service on until the airplane slows below
     *  flying speed. A tap in the app's own window, so Android 12 and
     *  later let the service start. */
    fun startFlight() {
        asked.start()
        _offer.value = false
        if (reading) serve(true)
    }

    /** Not Now: not asked again until this flight is over. */
    fun notNow() {
        asked.notNow()
        _offer.value = false
    }

    /** The foreground service on while flying, off otherwise. Android 12
     *  and later refuse to start a foreground service from the
     *  background in most states; a start refused is tried again at the
     *  next fix, which only comes while the app is in front anyway. */
    private fun serve(flying: Boolean) {
        if (flying == serving) return
        val intent = Intent(context, OwnShipService::class.java)
        if (flying) {
            try {
                ContextCompat.startForegroundService(context, intent)
                serving = true
            } catch (e: IllegalStateException) {
                serving = false
            }
        } else {
            context.stopService(intent)
            serving = false
        }
    }

    /** What is ahead, asked of the latest fix every ten seconds while the
     *  airplane is at flying speed (the clock's, Ticker): the planner looks
     *  five minutes along the track (wingtip.alerts). Flying speed is the
     *  engine's `underway`, the speed the engine's own look ahead starts
     *  at, so a taxiing airplane asks nothing it would not answer. The
     *  asking is a job of its own, so the next question cancels one still
     *  unanswered. */
    private fun askAhead() {
        val fix = _fix.value ?: return
        val track = fix.trackDeg ?: return
        val gs = fix.groundspeedKt ?: return
        // Where the engine cannot say, what is ahead is asked anyway: an
        // alert asked for nothing costs less than one missed.
        if (!underway(gs).getOrDefault(true)) return
        asking?.cancel()
        asking = scope.launch {
            // The packs' answer is asked either way, for the ground under
            // the airplane the glide ring stands on, network or none: off
            // the main thread, as the engine reads nine regions' packs.
            val offline = withContext(Dispatchers.Default) { CyclePacks.of(context).ahead(fix.lat, fix.lon, track, gs, fix.altitudeFt) }
            _groundFt.value = offline?.groundFt
            val alerts = try {
                Planner.ahead(fix.lat, fix.lon, track, gs, fix.altitudeFt)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                // No planner in the air: the same alerts from the packs
                // kept for the route (CyclePacks.ahead).
                offline?.alerts ?: return@launch
            }
            _ahead.value = alerts
        }
    }

    companion object {
        /** A fix as the flight pieces read it, its altitude above mean sea
         *  level or none (the callback's comment says why). */
        fun fixOf(location: Location): Fix =
            Fix(
                lat = location.latitude, lon = location.longitude,
                altitudeFt = mslFeet(if (LocationCompat.hasMslAltitude(location)) LocationCompat.getMslAltitudeMeters(location) else null),
                trackDeg = if (location.hasBearing()) location.bearing.toDouble() else null,
                groundspeedKt = if (location.hasSpeed()) location.speed * KT_PER_MPS else null,
                accuracyM = if (location.hasAccuracy()) location.accuracy.toDouble() else Double.NaN,
                atMs = location.time,
            )

        /** Feet above mean sea level from metres above it; none stays none,
         *  never the ellipsoid's height in its place. */
        fun mslFeet(mslMeters: Double?): Double? = mslMeters?.let { it * FT_PER_M }

        /** How often the position is kept for the next launch's map. */
        const val KEEP_EVERY_MS = 60_000L

        /** The last position's latitude and longitude, kept as their bits. */
        private val KEPT_LAT = longPreferencesKey("lat")
        private val KEPT_LON = longPreferencesKey("lon")
        /** One fix a second. */
        const val EVERY_MS = 1000L
        /** How often what is ahead is asked while moving; the planner looks
         *  five minutes along the track, so twice this with the app put
         *  away still leaves minutes. */
        const val AHEAD_EVERY_MS = 10_000L
        /** Whether a ground speed is flying speed: the engine's
         *  `underway` (motion/glide.rs, AIRBORNE_KT), which the trail and
         *  the strip go by too. Below it nothing ahead is asked: taxiing,
         *  or a fix wandering while parked. */
        fun underway(speedKt: Double?): Result<Boolean> = Engine.underway(speedKt)
        const val FT_PER_M = 3.28084
        const val KT_PER_MPS = 1.943844
    }
}
