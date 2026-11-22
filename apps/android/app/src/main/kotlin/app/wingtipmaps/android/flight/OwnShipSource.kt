package app.wingtipmaps.android.flight

import android.content.Context
import android.location.Location
import androidx.core.location.LocationCompat
import androidx.core.location.altitude.AltitudeConverterCompat
import app.wingtipmaps.android.AppClock
import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.engine.generated.receiverPosition
import app.wingtipmaps.android.format.Units
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext

/**
 * Whose position own ship is: the device's (the fused provider) or the
 * cockpit receiver's GPS, as the engine's `receiver_position` weighs them;
 * the twin of the iOS app's OwnShipSource. A tablet with no GPS has only
 * the receiver's in the air; a phone keeps its own unless the receiver's
 * is clearly better, and takes its own back the moment the receiver's
 * goes stale. Nothing is judged here: the NIC and NACp floor, the three
 * seconds and the margin are the engine's.
 */
class OwnShipSource(private val context: Context) {
    enum class Kind { DEVICE, RECEIVER, NONE }

    /** The engine's answer: which fix is own ship, and "good" or why the
     *  receiver's is not used ("none", "no_gps", "stale", "weak"). */
    data class Weighed(val kind: Kind, val receiver: String)

    /** What own ship does with the answer. */
    sealed interface Next {
        data class Show(val fix: OwnShip.Fix) : Next
        data object Clear : Next
        data object Keep : Next
    }

    private val _weighed = MutableStateFlow<Weighed?>(null)
    /** Null until a receiver has been heard, when own ship is the device's
     *  alone, as it always was. */
    val weighed: StateFlow<Weighed?> = _weighed.asStateFlow()

    private var device: OwnShip.Fix? = null
    private var heard: Pair<EngineContract.ReceiverOwnship?, EngineContract.ReceiverState>? = null
    private var shownAtMs: Long? = null

    /** The device's fix: own ship as before while no receiver is heard. */
    suspend fun device(fix: OwnShip.Fix): Next {
        // A fix converted late can be overtaken by a newer one that needed
        // no conversion; time does not go backwards for the trail.
        if (device.let { it != null && fix.atMs <= it.atMs }) return Next.Keep
        device = fix
        return if (heard == null) show(fix) else weigh()
    }

    /** The receiver's own ship after a read; nulls with the receiver off,
     *  when the device's fix is own ship again. */
    suspend fun receiver(own: EngineContract.ReceiverOwnship?, state: EngineContract.ReceiverState?): Next {
        if (state == null) {
            heard = null
            val was = _weighed.value?.kind
            _weighed.value = null
            if (was == Kind.DEVICE || was == null) return Next.Keep
            return device?.let { show(it) } ?: clear()
        }
        heard = own to state
        return weigh()
    }

    private fun show(fix: OwnShip.Fix): Next {
        if (fix.atMs == shownAtMs) return Next.Keep
        shownAtMs = fix.atMs
        return Next.Show(fix)
    }

    private fun clear(): Next {
        shownAtMs = null
        return Next.Clear
    }

    /** The engine's choice applied: the receiver's fix when it is the
     *  source, the device's when that is, none where neither has one (AC
     *  120-76D 11.17.2.3: no airplane drawn from a stale fix). */
    private suspend fun weigh(nowMs: Long = AppClock.nowMs()): Next {
        val (own, state) = heard ?: return Next.Keep
        val was = _weighed.value?.kind ?: Kind.DEVICE
        val deviceIn = device?.takeIf { !it.accuracyM.isNaN() }?.let { EngineContract.ReceiverPositionInputDevice(accuracyM = it.accuracyM, at = it.atMs / 1000.0) }
        val answer = Engine.receiverPosition(own, state, deviceIn, was.name.lowercase(), nowMs / 1000.0).getOrNull() ?: return Next.Keep
        val kind = Kind.entries.firstOrNull { it.name.equals(answer.source, ignoreCase = true) } ?: Kind.DEVICE
        val next = Weighed(kind, answer.receiver)
        if (next != _weighed.value) _weighed.value = next
        return when (kind) {
            Kind.RECEIVER -> answer.fix?.let { show(fixOf(it)) } ?: Next.Keep
            Kind.DEVICE -> device?.let { show(it) } ?: Next.Keep
            Kind.NONE -> if (shownAtMs != null) clear() else Next.Keep
        }
    }

    /** The receiver's fix as own ship's. Its height is the GPS's MSL where
     *  the receiver gives one; above the ellipsoid it is put on the geoid
     *  as the device's own fixes are (AltitudeConverterCompat, OwnShip's
     *  callback), else none rather than a height 30 to 115 ft out. */
    private suspend fun fixOf(f: EngineContract.ReceiverPositionAnswerFix): OwnShip.Fix {
        val altitude = f.altitudeFt ?: f.ellipsoidFt?.let { mslOf(f.lat, f.lon, it) }
        return OwnShip.Fix(
            lat = f.lat, lon = f.lon, altitudeFt = altitude, trackDeg = f.trackDeg, groundspeedKt = f.groundspeedKt,
            accuracyM = f.accuracyM, atMs = (f.at * 1000).toLong(),
        )
    }

    private suspend fun mslOf(lat: Double, lon: Double, ellipsoidFt: Double): Double? = withContext(Dispatchers.Default) {
        val at = Location("receiver").apply {
            latitude = lat
            longitude = lon
            altitude = ellipsoidFt / Units.FT_PER_M
        }
        try {
            AltitudeConverterCompat.addMslAltitudeToLocation(context, at)
            if (LocationCompat.hasMslAltitude(at)) OwnShip.mslFeet(LocationCompat.getMslAltitudeMeters(at)) else null
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            null
        }
    }
}
