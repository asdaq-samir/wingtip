package app.wingtipmaps.android.flight

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Looper
import androidx.core.content.ContextCompat
import app.wingtipmaps.android.api.AheadAlert
import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.engine.generated.underway
import app.wingtipmaps.android.logbook.FlightRecorder
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * Own ship: where the phone is, which way it is going and how fast, from
 * the fused location provider while the map is shown (one fix a second
 * at its best when flying, following or on a diagram; `request`), as the web app's useOwnShip and the iOS app's OwnShip keep it.
 * Nothing is worked out from the fix here but the figures of flying it:
 * what is ahead on the track (AheadAsking). The fix itself is DeviceFix's,
 * the position kept for the next launch KeptPosition's.
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

    private val provider: FusedLocationProviderClient = LocationServices.getFusedLocationProviderClient(context)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val aheadAsking = AheadAsking(context, scope)

    /** What the track runs into in the next minutes (AheadAsking). */
    val ahead: StateFlow<List<AheadAlert>> get() = aheadAsking.ahead

    /** The ground under the airplane from the packs kept on the phone:
     *  the glide ring's ground (InFlight). */
    val groundFt: StateFlow<Double?> get() = aheadAsking.groundFt

    private var aheadEvery: Ticker.Registration? = null
    private var reading = false
    private var serving = false
    /** Whether the pilot has said Start Flight, or Not Now, this flight. */
    private val asked = StartFlight()

    /** At flying speed with the service not started: Start Flight asked. */
    private val _offer = MutableStateFlow(false)
    val offer: StateFlow<Boolean> = _offer.asStateFlow()

    private val kept = KeptPosition(context)

    /** The last position kept, latitude and longitude; null before the
     *  first fix the phone ever read. */
    val lastPosition: Pair<Double, Double>? get() = kept.last

    /** The last position forgotten: signed out, or the account deleted. */
    fun forgetLastPosition() = kept.forget()

    private val callback = object : LocationCallback() {
        override fun onLocationResult(result: LocationResult) {
            val last = result.lastLocation ?: return
            // The altitude above sea level, the geoid's where the fix has
            // none of its own (DeviceFix says why).
            if (!DeviceFix.needsConverting(last)) {
                fromDevice(DeviceFix.of(last))
                return
            }
            scope.launch { fromDevice(DeviceFix.of(DeviceFix.converted(context, last))) }
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
        val fine = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
        val coarse = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
        _approximate.value = !fine && coarse
        _denied.value = !fine && !coarse
        if (!fine) {
            // Downgraded to approximate (or off) while reading: the
            // fixes stop with the permission.
            stop()
            return
        }
        if (!reading) {
            reading = true
            if (!request()) return
        }
        if (aheadEvery == null) aheadEvery = Ticker.shared.every(AHEAD_EVERY_MS) { aheadAsking.ask(_fix.value, routeLine) }
    }

    /** Whether the map follows the airplane (the location button's second
     *  tap): every fix at its best, as the map is moved by each. */
    var mapFollows: Boolean = false
        set(value) { field = value; tune() }

    /** Whether an airport diagram with own ship on it is up: AC 120-76D
     *  11.17.2.3 takes the airplane off once its fix is three seconds old,
     *  which a ten-metre filter would do to an airplane holding short. */
    var diagramShown: Boolean = false
        set(value) { field = value; tune() }

    /** At flying speed at the last fix (the trail's `underway`). */
    private var flying = false

    /** Whether the provider is asked for its best each second. */
    private var precise = false

    private fun tune() {
        val want = flying || mapFollows || diagramShown
        if (want == precise) return
        precise = want
        if (reading) request()
    }

    /**
     * The provider asked in the accuracy `precise` says, as the iOS app
     * picks Core Location's airborne or default configuration: one fix a
     * second at the best accuracy in the air, following, or on a diagram
     * (what the alerts ahead, the path and the runway advisor need); on
     * the ground otherwise the balanced accuracy, and nothing new until
     * the phone has moved 10 m, which leaves the GPS off while parked.
     * Asking again with the same callback replaces the last request.
     */
    private fun request(): Boolean {
        val request = if (precise) {
            com.google.android.gms.location.LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, EVERY_MS)
                .setMinUpdateIntervalMillis(EVERY_MS)
                .build()
        } else {
            com.google.android.gms.location.LocationRequest.Builder(Priority.PRIORITY_BALANCED_POWER_ACCURACY, EVERY_MS)
                .setMinUpdateIntervalMillis(EVERY_MS)
                .setMinUpdateDistanceMeters(GROUND_MOVE_M)
                .build()
        }
        // Checked here, beside the call it guards, for lint's MissingPermission.
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            reading = false
            return false
        }
        return try {
            provider.requestLocationUpdates(request, callback, Looper.getMainLooper())
            true
        } catch (e: SecurityException) {
            reading = false
            _denied.value = true
            false
        }
    }

    /** The fixes stopped: the map is put away on the ground. In the air
     *  the service keeps the reading (stopService is `landed`'s). */
    fun stop() {
        if (!reading) return
        reading = false
        provider.removeLocationUpdates(callback)
        aheadEvery?.cancel()
        aheadEvery = null
        aheadAsking.cancel()
        // Own ship turned off ends the flight's service; on again in the
        // air, Start Flight is asked again.
        asked.off()
        _offer.value = false
        serve(false)
    }

    /** Whose fix own ship is: the device's, or the cockpit receiver's GPS
     *  once one is heard (OwnShipSource, the engine's receiver_position). */
    private val source = OwnShipSource(context)
    val weighed: StateFlow<OwnShipSource.Weighed?> get() = source.weighed

    private fun fromDevice(fix: Fix) {
        scope.launch { next(source.device(fix)) }
    }

    /** The receiver's own ship after each read (Receiver.onOwnship). */
    fun fromReceiver(own: EngineContract.ReceiverOwnship?, state: EngineContract.ReceiverState?) {
        scope.launch { next(source.receiver(own, state)) }
    }

    private fun next(next: OwnShipSource.Next) {
        when (next) {
            is OwnShipSource.Next.Show -> took(next.fix)
            OwnShipSource.Next.Clear -> if (reading) _fix.value = null
            OwnShipSource.Next.Keep -> Unit
        }
    }

    private fun took(fix: Fix) {
        // A fix converted after the reading stopped is left out. One
        // converted late and overtaken is OwnShipSource's to leave out; a
        // device fix handed back after the receiver's may be older than
        // the receiver's last, and is own ship again all the same.
        if (!reading) return
        _fix.value = fix
        kept.took(fix)
        // The path flown, and the phone's position kept with the screen
        // off only while flying and only once the pilot has said Start
        // Flight: offered as the airplane reaches flying speed, stopped as
        // it slows below it, when the next flight asks again.
        flying(trail.took(fix))
        // The track the logbook is drawn from, ground and air alike.
        FlightRecorder.of(context).took(fix)
    }

    private fun flying(now: Boolean) {
        if (now != flying) {
            flying = now
            tune()
        }
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

    companion object {
        /** The planned route's course line, [lat, lon] pairs, for the packs
         *  ahead to follow as well as the track (the map's, as it draws it). */
        @Volatile
        var routeLine: List<List<Double>>? = null

        /** One fix a second. */
        const val EVERY_MS = 1000L
        /** On the ground, no new fix until the phone has moved this far, m. */
        const val GROUND_MOVE_M = 10f
        /** How often what is ahead is asked while moving; the planner looks
         *  five minutes along the track, so twice this with the app put
         *  away still leaves minutes. */
        const val AHEAD_EVERY_MS = 10_000L
        /** Whether a ground speed is flying speed: the engine's
         *  `underway` (motion/glide.rs, AIRBORNE_KT), which the trail and
         *  the strip go by too. Below it nothing ahead is asked: taxiing,
         *  or a fix wandering while parked. */
        fun underway(speedKt: Double?): Result<Boolean> = Engine.underway(speedKt)
    }
}
