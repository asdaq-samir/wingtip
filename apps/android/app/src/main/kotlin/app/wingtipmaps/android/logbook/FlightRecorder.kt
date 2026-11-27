package app.wingtipmaps.android.logbook

import android.content.Context
import app.wingtipmaps.android.AppClock
import app.wingtipmaps.android.Kept
import app.wingtipmaps.android.KeptFile
import app.wingtipmaps.android.api.Gateway
import app.wingtipmaps.android.api.generated.DraftTrackPoint
import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.generated.underway
import app.wingtipmaps.android.flight.OwnShip
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import java.io.File

/** The track recorded and the end of the flight last offered (the web's
 *  recorder's Recorded). `askedTo` is the engine's block end, ms; `flown`,
 *  whether the airplane has reached flying speed in these points (the
 *  iPhone's Kept.flown): until it has, there is no flight to read. */
@Serializable
data class Recorded(val points: List<DraftTrackPoint> = emptyList(), val askedTo: Double? = null, val flown: Boolean = false)

/** Where the recorded flight is kept: the phone's file, a fake in the tests. */
interface RecordedFlight {
    val recorded: StateFlow<Recorded>

    /** The flight ending at `to` offered: not again until a later one. */
    fun asked(to: Double)

    /** The track let go: logged, or the pilot does not want it. */
    fun forget()
}

/**
 * The flight the phone's GPS records for the logbook (the web's
 * features/logbook-auto recorder): every own-ship fix OwnShip takes, on
 * the ground as in the air -- the takeoff roll, the landing and coming to
 * rest are what the engine draws the entry from (logbook_from_track) --
 * one point every five seconds, kept in the app's files until it is
 * logged or let go. Before the airplane first reaches flying speed (the
 * engine's `underway`) only the last ten minutes are kept, the taxi and
 * the takeoff roll that 14 CFR 1.1's flight time starts with, as the
 * iPhone's recorder keeps them: a phone left on the ground with own ship
 * on would otherwise fill the 5,000 points in about seven hours and
 * record nothing of the next flight. It rides on own ship's reading, which its foreground
 * service keeps with the screen off while flying, so nothing new runs.
 * Nothing of it leaves the phone until the pilot asks for the entry. The
 * file is written behind, off the main thread (KeptFile).
 */
class FlightRecorder(
    file: File,
    writing: CoroutineDispatcher = Kept.writing,
    // Where the engine cannot say, not yet flying, as the iPhone takes it:
    // ten minutes of ground are kept, and the next fix asks again.
    private val underway: (speedKt: Double?) -> Boolean = { speed -> Engine.underway(speed).getOrDefault(false) },
    private val nowMs: () -> Long = AppClock::nowMs,
) : RecordedFlight {
    private val kept = KeptFile(file, writing)
    private val _recorded = MutableStateFlow(
        kept.read()?.let { runCatching { Gateway.json.decodeFromString<Recorded>(it) }.getOrNull() } ?: Recorded(),
    )
    override val recorded: StateFlow<Recorded> = _recorded.asStateFlow()
    private var writtenAtMs: Long? = null

    /** A fix into the track, at most one each EVERY_MS and MOST in all;
     *  on the ground, only the last GROUND_KEPT_MS. `known` is the
     *  engine's answer already asked for this fix (OwnShip), its failure
     *  taken as not yet flying. */
    fun took(fix: OwnShip.Fix, known: Result<Boolean>? = null) {
        val had = _recorded.value
        val last = had.points.lastOrNull()
        val t = fix.atMs.toDouble()
        if (last != null && t - last.t < EVERY_MS) return
        val takeoff = !had.flown && (known?.getOrDefault(false) ?: underway(fix.groundspeedKt))
        val flown = had.flown || takeoff
        // A file kept from before this rule may hold hours of ground: the
        // first fix on the ground lets it go, so MOST is never reached parked.
        val kept = if (flown) had.points else had.points.filter { t - it.t <= GROUND_KEPT_MS }
        if (kept.size >= MOST) return
        _recorded.value = had.copy(points = kept + DraftTrackPoint(altFt = fix.altitudeFt, lat = fix.lat, lon = fix.lon, t = t), flown = flown)
        // On the ground the file is written each few minutes, not each
        // half minute: what a kill then loses is a little taxi, while the
        // flight itself is written from the takeoff on.
        val every = if (flown) WRITE_EVERY_MS else GROUND_WRITE_EVERY_MS
        val written = writtenAtMs
        if (takeoff || written == null || nowMs() - written > every) write()
    }

    override fun asked(to: Double) {
        _recorded.value = _recorded.value.copy(askedTo = to)
        write()
    }

    /** The recording and its file gone: signed out, or the account deleted. */
    suspend fun wipe() {
        _recorded.value = Recorded()
        kept.delete()
    }

    override fun forget() {
        _recorded.value = Recorded()
        write()
    }

    private fun write() {
        writtenAtMs = nowMs()
        val now = _recorded.value
        kept.write { Gateway.json.encodeToString(now) }
    }

    companion object {
        /** A point every 5 s: four hours are under 3,000 points, and the
         *  track keeps a light airplane's shape (the web's EVERY_MS). */
        const val EVERY_MS = 5_000L
        /** The most points kept: the planner takes 5,000 at most. */
        const val MOST = 5_000
        const val WRITE_EVERY_MS = 30_000L
        /** Before flying speed, the minutes of taxi kept (the iPhone's
         *  groundKeptMs): enough for the run-up and the roll to the runway. */
        const val GROUND_KEPT_MS = 10 * 60 * 1000.0
        /** Before flying speed, how often the file is written. */
        const val GROUND_WRITE_EVERY_MS = 5 * 60_000L

        @Volatile
        private var shared: FlightRecorder? = null

        /** The app's one recording, in filesDir/flight-recorded.json. */
        fun of(context: Context): FlightRecorder =
            shared ?: synchronized(this) {
                shared ?: FlightRecorder(File(context.applicationContext.filesDir, "flight-recorded.json")).also { shared = it }
            }
    }
}
