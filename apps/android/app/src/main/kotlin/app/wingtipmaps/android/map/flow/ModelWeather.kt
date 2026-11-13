package app.wingtipmaps.android.map.flow

import android.annotation.SuppressLint
import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import app.wingtipmaps.android.api.Planner
import app.wingtipmaps.android.api.generated.FlowFrame
import app.wingtipmaps.android.api.generated.FlowLayer
import app.wingtipmaps.android.api.planned
import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.generated.flowLevels
import app.wingtipmaps.android.settings
import app.wingtipmaps.android.ui.A11y
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

/** The precipitation's span, as Apple Weather's precipitation map has it:
 *  the hour past, the radar's (1h), or the forecast hours (12h). */
enum class FlowSpan { ONE_HOUR, TWELVE_HOURS }

/** Where the model weather is: the field shown (null for off), the level
 *  picked, the timeline the planner listed, the hour shown (null follows
 *  now), playing, the span, the point the value is read at, and the grid
 *  of the picture drawn, which the value is read from. */
data class FlowState(
    val field: FlowKind? = null,
    val picked: String = "sfc",
    val layer: FlowLayer? = null,
    val index: Int? = null,
    val playing: Boolean = false,
    val span: FlowSpan = FlowSpan.TWELVE_HOURS,
    val failed: Boolean = false,
    val point: Pair<Double, Double>? = null,
    val grid: FlowGrid? = null,
) {
    val frames: List<FlowFrame> get() = layer?.frames.orEmpty()
    val shown: Int get() = if (frames.isEmpty()) -1 else minOf(index ?: FlowTimeline.nowIndex(frames), frames.lastIndex)
    val frame: FlowFrame? get() = frames.getOrNull(shown)
    val level: String? get() = this.field?.let { FlowTimeline.levelShown(layer, it, picked) }
    val file: String? get() = this.field?.let { FlowTimeline.fileOf(it.key, level) }

    /** The frames the timeline runs over (FlowTimeline.windowOf). */
    val steps: List<Int> get() = this.field?.let { FlowTimeline.windowOf(frames, it, span) }.orEmpty()

    /** The hour past's radar in place of the model's rain: precipitation's 1h span. */
    val radar: String? get() = frame?.radarTiles?.takeIf { this.field == FlowKind.PRECIP && span == FlowSpan.ONE_HOUR && frame?.past == true }
}

/**
 * The model weather on the map (the owner, 2026-11-11, Apple Weather's
 * wind and weather maps; the web's features/weather-flow): the field
 * picked in Map Settings' Weather, the hours the planner lists
 * (/api/weather/flow, wingtip.weather_flow, asked again every ten
 * minutes), the one shown -- now until the pilot scrubs or plays -- and
 * play, which steps through the hours once and stops on the last (WCAG
 * 2.2.2), never by itself and never with the system's animations off,
 * and pauses while the app is in the background. The pick kept in the
 * settings file.
 */
class ModelWeather private constructor(private val context: Context, private val scope: CoroutineScope) {
    private val _state = MutableStateFlow(FlowState())
    val state: StateFlow<FlowState> = _state.asStateFlow()
    private var fetching: Job? = null
    private var clock: Job? = null
    private var resume = false

    init {
        scope.launch {
            val kept = context.settings.data.first()
            val field = FlowKind.entries.firstOrNull { it.key == kept[FIELD] }
            val level = kept[LEVEL]
            if (level != null) _state.update { it.copy(picked = level) }
            if (field != null && _state.value.field == null) pick(field)
        }
    }

    /** A field picked, or off (null). */
    fun pick(field: FlowKind?) {
        _state.update { it.copy(field = field, playing = false, grid = if (field == it.field) it.grid else null) }
        clock?.cancel()
        scope.launch { context.settings.edit { if (field == null) it.remove(FIELD) else it[FIELD] = field.key } }
        if (field == null) {
            fetching?.cancel()
            fetching = null
        } else if (fetching?.isActive != true) {
            fetching = scope.launch { fetchForever() }
        }
    }

    fun pickLevel(level: String) {
        _state.update { it.copy(picked = level) }
        scope.launch { context.settings.edit { it[LEVEL] = level } }
    }

    /** The precipitation's span: now is in both, so it is where each starts. */
    fun pickSpan(span: FlowSpan) {
        pause()
        _state.update { it.copy(span = span, index = null) }
    }

    fun seek(i: Int) {
        pause()
        _state.update { it.copy(index = i) }
    }

    fun toggle() {
        if (_state.value.playing) {
            pause()
            return
        }
        val s = _state.value
        val first = s.steps.firstOrNull() ?: return
        val last = s.steps.last()
        if (s.shown >= last || s.shown < first) _state.update { it.copy(index = first) }
        play()
    }

    /** Where the pilot tapped the map with nothing else under it: the value is read there. */
    fun tap(lat: Double, lon: Double) {
        _state.update { it.copy(point = lat to lon) }
    }

    /** The grid of the picture now drawn (ModelWeatherLayer), the value's source. */
    fun drawn(grid: FlowGrid?) {
        _state.update { it.copy(grid = grid) }
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
        if (A11y.reducedMotion(context)) return
        _state.update { it.copy(playing = true) }
        clock?.cancel()
        clock = scope.launch {
            while (_state.value.playing) {
                delay(FRAME_MS)
                val s = _state.value
                val next = s.shown + 1
                if (next <= (s.steps.lastOrNull() ?: -1)) _state.update { it.copy(index = next) } else pause()
            }
        }
    }

    private fun pause() {
        _state.update { it.copy(playing = false) }
        clock?.cancel()
    }

    private suspend fun fetchForever() {
        while (true) {
            try {
                val layer = Planner.api.flowLayer().planned()
                _state.update { it.copy(layer = layer, failed = false) }
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                // No signal, or none held yet: what was heard stands.
                _state.update { it.copy(failed = it.layer == null) }
            }
            delay(REFRESH_MS)
        }
    }

    companion object {
        private val FIELD = stringPreferencesKey("model_weather")
        private val LEVEL = stringPreferencesKey("model_weather_level")

        /** The weather service looks for new AWC cycles and model runs four
         *  times an hour (the web's REFRESH_MS). */
        const val REFRESH_MS = 10 * 60_000L

        /** How long each hour is shown while the timeline plays (the web's FRAME_MS). */
        const val FRAME_MS = 1_200L

        /** A level's feet by its id, the engine's (flow_levels): the wind's,
         *  the icing's and the turbulence's levels; null where it has none. */
        fun levelFt(id: String): Double? = Engine.flowLevels().getOrNull()?.let { l ->
            (l.wind.map { it.id to it.ft } + l.icing.map { it.id to it.ft } + l.turbulence.map { it.id to it.ft }).firstOrNull { it.first == id }?.second
        }

        // The application's context alone (of), which lives as long as the process.
        @SuppressLint("StaticFieldLeak")
        @Volatile
        private var shared: ModelWeather? = null

        fun of(context: Context): ModelWeather =
            shared ?: synchronized(this) {
                shared ?: ModelWeather(context.applicationContext, CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)).also { shared = it }
            }
    }
}
