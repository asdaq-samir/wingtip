package app.wingtipmaps.android.map.flow

import app.wingtipmaps.android.api.generated.FlowFrame
import app.wingtipmaps.android.api.generated.FlowLayer
import java.time.Duration
import java.time.Instant
import kotlin.math.roundToInt

/**
 * The model weather's timeline and its pictures' names, the web's
 * useWeatherFlow.ts, flowLevels.ts and flowSource.ts. Pure, so it is
 * tested without a phone.
 */
object FlowTimeline {
    /** The frame that is now: the newest whose hour has come. */
    fun nowIndex(frames: List<FlowFrame>): Int = frames.indexOfLast { it.past }.coerceAtLeast(0)

    /** A frame's hours from now, 0 for now (the bar's "Now", "+2 h", "-1 h"). */
    fun hoursFromNow(frames: List<FlowFrame>, i: Int): Int {
        val now = frames.getOrNull(nowIndex(frames)) ?: return 0
        val at = frames.getOrNull(i) ?: return 0
        if (i == nowIndex(frames)) return 0
        val a = runCatching { Instant.parse(at.valid) }.getOrNull() ?: return 0
        val n = runCatching { Instant.parse(now.valid) }.getOrNull() ?: return 0
        return (Duration.between(n, a).toMinutes() / 60.0).roundToInt()
    }

    /** The frames the timeline runs over, as indices: on the
     *  precipitation's 1h span the hours already past, whose rain is the
     *  radar's where it has its mosaic; otherwise every frame. */
    fun windowOf(frames: List<FlowFrame>, field: FlowKind, span: FlowSpan): List<Int> {
        val all = frames.indices.toList()
        if (field != FlowKind.PRECIP || span != FlowSpan.ONE_HOUR) return all
        return all.filter { frames[it].past }.ifEmpty { all }
    }

    /** The levels a field is drawn at, by AWC's names ("sfc", "060",
     *  "max"), as the weather service lists them (the engine's
     *  flow_levels): the wind's and, at the same levels but Max, the
     *  temperature's; the icing's and the turbulence's; none for the others. */
    fun levelsOf(layer: FlowLayer?, field: FlowKind): List<String> {
        val levels = layer?.levels.orEmpty()
        return when (field) {
            FlowKind.WIND -> levels["wind"].orEmpty()
            FlowKind.TEMP -> levels["wind"].orEmpty().filter { it != "max" }
            FlowKind.ICING -> levels["icing"].orEmpty()
            FlowKind.TURB -> levels["turbulence"].orEmpty()
            else -> emptyList()
        }
    }

    /** The level shown: the pilot's pick where the field has it, else the
     *  field's first (the surface, for the wind); null for a field without. */
    fun levelShown(layer: FlowLayer?, field: FlowKind, picked: String): String? {
        val levels = levelsOf(layer, field)
        return if (picked in levels) picked else levels.firstOrNull()
    }

    /** A field's picture at a level, as the planner names it: the surface's
     *  under the field's own name ("wind"), a level's after a dash ("wind-060"). */
    fun fileOf(key: String, level: String?): String = if (level == null || level == "sfc") key else "$key-$level"

    /** The planner's path of a frame's picture, and its version, the run
     *  that made it, which the planner keeps for good at that version. */
    fun picture(frame: FlowFrame, file: String): Pair<String, String?> = "/api/weather/flow/${frame.id}/$file.png" to frame.versions?.get(file)

    /** A run's hour as a forecaster says it: "12Z". */
    private fun zulu(iso: String?): String? = iso?.takeIf { it.length >= 13 }?.let { "${it.substring(11, 13)}Z" }

    /** The legend's source line's parts: whose the picture is ("AWC winds"),
     *  whether NOAA's model stands in for AWC's, when its run was made
     *  ("12Z"), and whether that is older than its source's cadence. */
    data class Source(val label: String, val fallback: Boolean, val zulu: String?, val stale: Boolean)

    fun source(frame: FlowFrame?, file: String): Source? {
        val s = frame?.sources?.get(file) ?: return null
        return Source(s.label, s.fallback, zulu(s.issued), s.stale)
    }
}
