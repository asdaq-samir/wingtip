package app.wingtipmaps.android.logbook

import android.content.Context
import app.wingtipmaps.android.AppClock
import app.wingtipmaps.android.api.Gateway
import app.wingtipmaps.android.api.generated.DraftTrackPoint
import app.wingtipmaps.android.flight.OwnShip
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import java.io.File

/** The track recorded and the end of the flight last offered (the web's
 *  recorder's Recorded). `askedTo` is the engine's block end, ms. */
@Serializable
data class Recorded(val points: List<DraftTrackPoint> = emptyList(), val askedTo: Double? = null)

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
 * logged or let go. It rides on own ship's reading, which its foreground
 * service keeps with the screen off while flying, so nothing new runs.
 * Nothing of it leaves the phone until the pilot asks for the entry.
 */
class FlightRecorder(private val file: File, private val nowMs: () -> Long = AppClock::nowMs) : RecordedFlight {
    private val _recorded = MutableStateFlow(
        runCatching { Gateway.json.decodeFromString<Recorded>(file.readText()) }.getOrNull() ?: Recorded(),
    )
    override val recorded: StateFlow<Recorded> = _recorded.asStateFlow()
    private var writtenAtMs: Long? = null

    /** A fix into the track, at most one each EVERY_MS and MOST in all. */
    fun took(fix: OwnShip.Fix) {
        val had = _recorded.value
        val last = had.points.lastOrNull()
        if (last != null && fix.atMs - last.t < EVERY_MS) return
        if (had.points.size >= MOST) return
        _recorded.value = had.copy(points = had.points + DraftTrackPoint(altFt = fix.altitudeFt, lat = fix.lat, lon = fix.lon, t = fix.atMs.toDouble()))
        val written = writtenAtMs
        if (written == null || nowMs() - written > WRITE_EVERY_MS) write()
    }

    override fun asked(to: Double) {
        _recorded.value = _recorded.value.copy(askedTo = to)
        write()
    }

    /** The recording and its file gone: signed out, or the account deleted. */
    fun wipe() {
        _recorded.value = Recorded()
        file.delete()
    }

    override fun forget() {
        _recorded.value = Recorded()
        write()
    }

    private fun write() {
        writtenAtMs = nowMs()
        val _ = runCatching {
            file.parentFile?.mkdirs()
            val part = File(file.path + ".part")
            part.writeText(Gateway.json.encodeToString(_recorded.value))
            if (!part.renameTo(file)) part.delete()
        }
    }

    companion object {
        /** A point every 5 s: four hours are under 3,000 points, and the
         *  track keeps a light airplane's shape (the web's EVERY_MS). */
        const val EVERY_MS = 5_000L
        /** The most points kept: the planner takes 5,000 at most. */
        const val MOST = 5_000
        const val WRITE_EVERY_MS = 30_000L

        @Volatile
        private var shared: FlightRecorder? = null

        /** The app's one recording, in filesDir/flight-recorded.json. */
        fun of(context: Context): FlightRecorder =
            shared ?: synchronized(this) {
                shared ?: FlightRecorder(File(context.applicationContext.filesDir, "flight-recorded.json")).also { shared = it }
            }
    }
}
