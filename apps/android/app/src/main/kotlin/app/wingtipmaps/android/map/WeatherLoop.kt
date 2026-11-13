package app.wingtipmaps.android.map

import android.annotation.SuppressLint
import android.content.Context
import android.provider.Settings
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import app.wingtipmaps.android.api.Gateway
import app.wingtipmaps.android.api.Planner
import app.wingtipmaps.android.api.generated.LoopFrame
import app.wingtipmaps.android.api.planned
import app.wingtipmaps.android.offline.KeptForAir
import app.wingtipmaps.android.settings
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import app.wingtipmaps.android.api.generated.WeatherLoop as LoopAnswer

/** The loop's five, as the owner listed them (2026-11-09); `kind` is the planner's. */
enum class LoopKind(val kind: String, val label: String) {
    OFF("off", "Off"), RADAR("radar", "Radar"), IR("ir", "Satellite IR"), VISIBLE("visible", "Satellite Visible"), BOTH("both", "Radar and IR"),
}

/** How fast the loop plays, each frame's time (the web's FRAME_MS): a menu, as a discrete setting is here. */
enum class LoopSpeed(val label: String, val frameMs: Long) { SLOW("Slow", 900), NORMAL("Normal", 500), FAST("Fast", 250) }

/** Where the loop is: its frames, the one shown (null follows the newest), playing, loaded. */
data class LoopState(
    val kind: LoopKind = LoopKind.OFF,
    val speed: LoopSpeed = LoopSpeed.NORMAL,
    val frames: List<LoopFrame> = emptyList(),
    val index: Int? = null,
    val playing: Boolean = false,
    val ready: Boolean = false,
    val failed: Boolean = false,
    val oldAfterS: Double = 900.0,
    /** When the frames' list shown was fetched, where it is the one kept
     *  for the air; null when it is the network's own. */
    val keptAtMs: Long? = null,
) {
    val shown: Int get() = if (frames.isEmpty()) -1 else minOf(index ?: frames.lastIndex, frames.lastIndex)
    val frame: LoopFrame? get() = frames.getOrNull(shown)
}

/**
 * The radar and satellite loop on the map (the owner, 2026-11-09, the
 * web's features/weather-loop): the frames the planner lists for the pick
 * in Setup's Map section (/api/weather/loop, wingtip.weather_loop, asked
 * again every two and a half minutes), the one shown, and play, pause and
 * scrub. It plays by itself once the map says the frames' tiles have
 * loaded (WeatherLoopLayer), so nothing flickers in; not with the
 * system's animations removed (Android's Reduce Motion), which keeps the
 * newest frame still; and it pauses while the app is in the background
 * (WeatherLoopBar). The pick and the speed kept in the settings file.
 */
class WeatherLoop private constructor(private val context: Context, private val scope: CoroutineScope) {
    private val _state = MutableStateFlow(LoopState())
    val state: StateFlow<LoopState> = _state.asStateFlow()
    private var started = false
    private var resume = false
    private var fetching: Job? = null
    private var clock: Job? = null

    init {
        scope.launch {
            val kept = context.settings.data.first()
            val kind = LoopKind.entries.firstOrNull { it.kind == kept[KIND] } ?: LoopKind.OFF
            val speed = LoopSpeed.entries.firstOrNull { it.name == kept[SPEED] } ?: LoopSpeed.NORMAL
            _state.update { it.copy(speed = speed) }
            if (kind != LoopKind.OFF && _state.value.kind == LoopKind.OFF) pick(kind)
        }
    }

    /** A new pick starts afresh: its frames asked for, the newest shown. */
    fun pick(kind: LoopKind) {
        fetching?.cancel()
        clock?.cancel()
        started = false
        resume = false
        _state.value = LoopState(kind = kind, speed = _state.value.speed)
        scope.launch { context.settings.edit { it[KIND] = kind.kind } }
        if (kind != LoopKind.OFF) fetching = scope.launch { fetchForever(kind) }
    }

    fun speed(speed: LoopSpeed) {
        _state.update { it.copy(speed = speed) }
        scope.launch { context.settings.edit { it[SPEED] = speed.name } }
    }

    private suspend fun fetchForever(kind: LoopKind) {
        while (true) {
            try {
                // Kept as it comes, and the kept list where the network fails
                // (KeptForAir): its frames' tiles the map's cache may hold.
                val had = KeptForAir.had(KeptForAir.WEATHER_LOOP, kind.kind, LoopAnswer.serializer()) { fetch(kind) }
                // From the kept list, only the frames whose tiles were kept
                // over the route (KeptLoopTiles), where any were: the others
                // would play blank.
                val tiled = if (had.kept) Gateway.loopTiles.frames() else emptySet()
                val answer = had.value.let { a -> if (tiled.isEmpty()) a else a.copy(frames = a.frames.filter { it.valid in tiled }) }
                _state.update {
                    val same = it.frames.map(LoopFrame::valid) == answer.frames.map(LoopFrame::valid)
                    it.copy(
                        frames = answer.frames, oldAfterS = answer.oldAfterS, failed = false, ready = it.ready && same,
                        keptAtMs = had.fetchedAtMs.takeIf { had.kept },
                    )
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                // No signal, or the planner down: what was heard stands.
                _state.update { it.copy(failed = it.frames.isEmpty()) }
            }
            delay(REFRESH_MS)
        }
    }

    /** Told by the map's layer once the frames have loaded: the loop
     *  plays by itself the first time, unless animations are off. */
    fun loaded() {
        val now = _state.value
        if (now.ready) return
        _state.update { it.copy(ready = true) }
        if (started || now.frames.size < 2) return
        started = true
        if (!reduceMotion()) {
            _state.update { it.copy(index = 0) }
            play()
        }
    }

    fun toggle() {
        started = true
        resume = false
        if (_state.value.playing) pause() else play()
    }

    fun seek(i: Int) {
        started = true
        pause()
        _state.update { it.copy(index = i.coerceIn(0, maxOf(0, it.frames.lastIndex))) }
    }

    /** The app gone to the background or back. */
    fun away(away: Boolean) {
        if (away) {
            resume = _state.value.playing
            pause()
        } else if (resume) {
            resume = false
            play()
        }
    }

    private fun play() {
        if (_state.value.frames.size < 2) return
        _state.update { it.copy(playing = true) }
        clock?.cancel()
        clock = scope.launch {
            while (_state.value.playing) {
                val s = _state.value
                delay(if (s.shown == s.frames.lastIndex) NEWEST_HOLD_MS else s.speed.frameMs)
                _state.update { if (it.playing && it.frames.isNotEmpty()) it.copy(index = (it.shown + 1) % it.frames.size) else it }
            }
        }
    }

    private fun pause() {
        _state.update { it.copy(playing = false) }
        clock?.cancel()
    }

    /** "Remove animations" in the system's settings: no autoplay. */
    private fun reduceMotion(): Boolean =
        Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f

    companion object {
        /** The planner's frame list for a pick (/api/weather/loop): the
         *  loop's own ask, and Keep for the Air's. */
        suspend fun fetch(kind: LoopKind): LoopAnswer =
            Planner.api.weatherLoopFrames(kind.kind).planned()

        private val KIND = stringPreferencesKey("weather_loop")
        private val SPEED = stringPreferencesKey("weather_loop_speed")
        /** Half the radar's five minutes. */
        const val REFRESH_MS = 150_000L
        /** The newest frame held this long before the loop starts again. */
        const val NEWEST_HOLD_MS = 1_500L

        // The application's context alone (of), which lives as long as the process.
        @SuppressLint("StaticFieldLeak")
        @Volatile
        private var shared: WeatherLoop? = null

        fun of(context: Context): WeatherLoop =
            shared ?: synchronized(this) {
                shared ?: WeatherLoop(context.applicationContext, CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)).also { shared = it }
            }
    }
}
