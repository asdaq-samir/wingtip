package app.wingtipmaps.android.flight

import android.content.Context
import app.wingtipmaps.android.AppClock
import app.wingtipmaps.android.api.FlightStatus
import app.wingtipmaps.android.api.PathPoint
import app.wingtipmaps.android.api.Planner
import app.wingtipmaps.android.api.TrafficAircraft
import app.wingtipmaps.android.api.flightStatus
import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.generated.airborneNow
import app.wingtipmaps.android.engine.generated.alertFires
import app.wingtipmaps.android.notify.Notifications
import app.wingtipmaps.android.records.AirplaneWatch
import app.wingtipmaps.android.records.Keeping
import app.wingtipmaps.android.records.KeptAirplane
import app.wingtipmaps.android.records.Records
import app.wingtipmaps.android.records.RecordsDao
import app.wingtipmaps.android.records.WatchKind
import app.wingtipmaps.android.records.id
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

/**
 * An airplane being tracked, as FlightAware and ForeFlight track one (the
 * web app's lib/map/tracking): which, whether the map keeps it in the
 * middle, its last report and the path flown since its trace was read.
 * With the airplanes kept as Favorites and Recents, and the watches set
 * on them, from the records store (Records); whether a watch goes off is
 * the engine's (`airborne_now`, `alert_fires`), the words are the app's.
 * The twin of the iOS app's Tracking.swift, with Room's flows in place
 * of SwiftData's fetches: the lists are read whole as the store changes.
 */
class Tracking(
    private val context: Context,
    private val dao: RecordsDao,
    private val ticker: Ticker,
    private val scope: CoroutineScope,
) {
    private val _hex = MutableStateFlow<String?>(null)
    val hex: StateFlow<String?> = _hex.asStateFlow()

    /** The map keeps it in the middle until the pilot drags the map. */
    val follow = MutableStateFlow(true)

    private val _latest = MutableStateFlow<TrafficAircraft?>(null)
    val latest: StateFlow<TrafficAircraft?> = _latest.asStateFlow()
    private var latestAtMs: Long? = null

    private val _path = MutableStateFlow<List<PathPoint>>(emptyList())
    val path: StateFlow<List<PathPoint>> = _path.asStateFlow()

    /** The last watch that went off, for the banner over the map. */
    val fired = MutableStateFlow<String?>(null)

    /** The engine's words where a watch's rules failed, shown on an
     *  airplane's card; the watch is kept for the next answer. */
    val problem = MutableStateFlow<String?>(null)

    private val kept: StateFlow<List<KeptAirplane>> =
        dao.keptAirplanes().stateIn(scope, SharingStarted.Eagerly, emptyList())

    /** The Favorites in the order added. */
    val favorites: StateFlow<List<KeptAirplane>> =
        kept.map { Keeping.favorites(it) }.stateIn(scope, SharingStarted.Eagerly, emptyList())

    /** The Recents, newest first. */
    val recents: StateFlow<List<KeptAirplane>> =
        kept.map { Keeping.recents(it) }.stateIn(scope, SharingStarted.Eagerly, emptyList())

    val watches: StateFlow<List<AirplaneWatch>> =
        dao.watches().stateIn(scope, SharingStarted.Eagerly, emptyList())

    /** Whether each watched airplane was in the air, where known. */
    private val airborne = HashMap<String, Boolean>()

    private var tracked: Ticker.Registration? = null
    private var watched: Ticker.Registration? = null

    /** A flight tracked from now, the map following it; its report where
     *  the one picking it has it, so its card and the map have it at once. */
    fun track(hex: String?, plane: TrafficAircraft? = null) {
        val low = hex?.lowercase()
        if (low == _hex.value) return
        _hex.value = low
        follow.value = true
        _path.value = emptyList()
        _latest.value = plane
        latestAtMs = plane?.let { AppClock.nowMs() - ((it.seenS ?: 0.0) * 1000).toLong() }
    }

    /** Today's trace, read once its card has it: the path before the
     *  reports heard since. */
    fun seed(trail: List<PathPoint>, hex: String) {
        if (hex.lowercase() != _hex.value || trail.isEmpty()) return
        val first = _path.value.firstOrNull()?.t ?: Double.POSITIVE_INFINITY
        _path.value = (trail.filter { it.t < first } + _path.value).takeLast(PATH_POINTS)
    }

    /** A report of the tracked airplane: its latest, and a point of its path. */
    fun reported(plane: TrafficAircraft, atMs: Long) {
        if (plane.hex.lowercase() != _hex.value) return
        val had = latestAtMs
        if (had != null && atMs <= had && _latest.value != null && _path.value.isNotEmpty()) return
        _latest.value = plane
        latestAtMs = atMs
        _path.value = (_path.value + PathPoint(t = atMs / 1000.0, lat = plane.lat, lon = plane.lon, altFt = plane.altitudeFt)).takeLast(PATH_POINTS)
    }

    /** The map's airplanes, each answer: the tracked one's report among them. */
    fun heard(planes: List<TrafficAircraft>) {
        val hex = _hex.value ?: return
        val plane = planes.firstOrNull { it.hex.lowercase() == hex } ?: return
        reported(plane, AppClock.nowMs() - ((plane.seenS ?: 0.0) * 1000).toLong())
    }

    // Favorites and Recents

    fun isFavorite(hex: String): Boolean = favorites.value.any { it.hex == hex.lowercase() }

    fun toggleFavorite(hex: String, name: String, type: String?) {
        scope.launch {
            val low = hex.lowercase()
            val had = dao.keptAirplane(low)
            val now = AppClock.nowMs()
            val row = (had ?: KeptAirplane(hex = low, name = name, type = type, addedAt = now))
                .let { it.copy(favorite = !it.favorite, addedAt = if (!it.favorite) now else it.addedAt) }
            keep(row)
            Records.sync?.changed("favorites")
        }
    }

    fun remember(hex: String, name: String, type: String?) {
        scope.launch {
            // The airplane's row with the recent flag; the oldest beyond a
            // dozen leave the Recents, and the store where they were only
            // recent (Keeping.remembered has the rule).
            for ((before, after) in Keeping.remembered(kept.value, hex.lowercase(), name, type, AppClock.nowMs())) {
                if (after == null) dao.forgetAirplane(before.hex) else dao.putAirplane(after)
            }
            Records.sync?.changed("recents")
        }
    }

    /** Signing out: the Favorites are the pilot's own, the Recents the
     *  device's. */
    fun forgetFavorites() {
        scope.launch {
            for (row in dao.favorites()) keep(row.copy(favorite = false))
        }
    }

    /** A row in neither list is no row. */
    private suspend fun keep(row: KeptAirplane) {
        val pruned = Keeping.pruned(row)
        if (pruned == null) dao.forgetAirplane(row.hex) else dao.putAirplane(pruned)
    }

    // Watches

    fun watching(hex: String, kind: WatchKind): Boolean =
        watches.value.any { it.hex == hex.lowercase() && it.kind == kind.word }

    fun toggleWatch(hex: String, name: String, kind: WatchKind) {
        scope.launch {
            val low = hex.lowercase()
            if (watching(low, kind)) {
                dao.removeWatch(low, kind.word)
            } else {
                dao.putWatch(AirplaneWatch(hex = low, name = name, kind = kind.word, setAt = AppClock.nowMs()))
                // A watch is asked for so as to be told: the moment to ask
                // for notifications, where the pilot sees what they are for.
                Notifications.allow()
            }
            Records.sync?.changed("watches")
        }
    }

    /** While the map is shown: the tracked airplane's state every five
     *  seconds, where the map's own answers do not have it (it is out of
     *  their radius), and each watched airplane's every fifteen; both on
     *  the app's one clock, twice as slow with the app put away. */
    fun start() {
        if (tracked == null) tracked = ticker.every(5_000) { askTracked() }
        if (watched == null) watched = ticker.every(15_000) { askWatched() }
    }

    fun stop() {
        tracked?.cancel()
        watched?.cancel()
        tracked = null
        watched = null
    }

    /** The tracked airplane's report, where none has come in ten seconds. */
    private suspend fun askTracked() {
        val hex = _hex.value ?: return
        val had = latestAtMs
        if (had != null && AppClock.nowMs() - had <= 10_000) return
        val status = try {
            Planner.flightStatus(hex)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            return
        }
        val plane = status.aircraft ?: return
        reported(plane, AppClock.nowMs() - ((plane.seenS ?: 0.0) * 1000).toLong())
    }

    /** Each watched airplane's state, and any watch that goes off on it. */
    private suspend fun askWatched() {
        for (hex in watches.value.map { it.hex }.toSet()) {
            val status = try {
                Planner.flightStatus(hex)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                continue
            }
            val before = airborne[hex]
            // Where the engine cannot say, what was known stands and the
            // watch waits; the card says why (problem).
            val asked = airborneNow(before, status)
            asked.exceptionOrNull()?.let { problem.value = "Watching $hex failed: ${it.message}" }
            val now = asked.getOrDefault(before)
            for (watch in watches.value.filter { it.hex == hex }) {
                val kind = WatchKind.of(watch.kind) ?: continue
                val goes = fired(watch.name, kind, before, now, status)
                goes.exceptionOrNull()?.let { problem.value = "Watching ${watch.name} failed: ${it.message}" }
                val words = goes.getOrNull() ?: continue
                // The banner over the map; a heads-up notification with the
                // app put away.
                fired.value = words
                Notifications.tell(context, Notifications.CHANNEL_WATCHES, if (kind == WatchKind.TAKEOFF) "Took off" else "Landed", words, watch.id)
                dao.removeWatch(watch.hex, watch.kind)
            }
            if (now != null) airborne[hex] = now
        }
    }

    companion object {
        /** At most this many points of a tracked flight's path, as the web
         *  app's PATH_POINTS. */
        const val PATH_POINTS = 2000

        /** Whether the airplane is in the air (the engine's `airborne_now`,
         *  the web app's airborneNow): in the air where heard there; on the
         *  ground where it has landed, or where nothing was known and it
         *  has not been heard for half an hour or ever; else what was
         *  known. */
        fun airborneNow(before: Boolean?, now: FlightStatus): Result<Boolean?> =
            Engine.airborneNow(before, now.airborne == true, now.arrived != null, now.heardS)

        /** The words a watch goes off with, or null where it has not: "N654FL
         *  took off from 10C", "N654FL landed at KDAW". Whether it goes off
         *  is the engine's (`alert_fires`); the words are the app's. */
        fun fired(name: String, kind: WatchKind, before: Boolean?, now: Boolean?, status: FlightStatus): Result<String?> =
            Engine.alertFires(kind.word, beforeAirborne = before, airborne = now, arrived = status.arrived != null).map { go ->
                if (!go.fires) {
                    null
                } else {
                    when (kind) {
                        WatchKind.TAKEOFF -> status.departed?.let { "$name took off from ${it.ident}" } ?: "$name took off"
                        WatchKind.LAND -> status.arrived?.let { "$name landed at ${it.ident}" }
                    }
                }
            }
    }
}
