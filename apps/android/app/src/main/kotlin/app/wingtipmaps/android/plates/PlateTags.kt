package app.wingtipmaps.android.plates

import app.wingtipmaps.android.engine.generated.EngineContract
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonPrimitive
import java.util.Locale
import kotlin.math.roundToInt

/** A line of a tag's words, barred as the FAA charts an altitude: a bar
 *  under for at or above, over for at or below, both for a mandatory one
 *  (FAA Aeronautical Chart User's Guide, terminal procedures' altitudes;
 *  the engine's ApproachFixTag says the same of its `altitude`). */
data class TagLine(val text: String, val under: Boolean = false, val over: Boolean = false)

/**
 * A tag's words as the map writes them, ForeFlight's way (the owner's
 * screenshot, 2026-11-11), from the engine's approach_fix_tags answer:
 * the fix's name, then its crossing altitude barred as the FAA charts it
 * -- a window two lines, its top over-barred above its bottom
 * under-barred -- then the glideslope's ("GS") or glidepath's ("GP")
 * altitude at the final approach fix, and at the runway its threshold
 * crossing height and touchdown zone elevation. No decision altitude or
 * MDA: those are the plate's alone, and the engine gives none. The
 * figures are the engine's; only their writing is the phone's.
 */
object PlateTagWords {
    fun lines(tag: EngineContract.ApproachFixTag): List<TagLine> = buildList {
        add(TagLine(tag.ident))
        addAll(crossing(tag.altitude))
        tag.vertical?.let { v -> add(TagLine("${if (v.kind == "glidepath") "GP" else "GS"} ${feet(v.ft)}")) }
        tag.runway?.let { r -> add(TagLine(listOfNotNull("TCH ${feet(r.tchFt)}", r.tdzeFt?.let { "TDZE ${feet(it)}" }).joinToString(" · "))) }
    }

    fun crossing(altitude: EngineContract.ApproachFixTagAltitude?): List<TagLine> {
        val min = altitude?.minFt
        val max = altitude?.maxFt
        return when (altitude?.sense) {
            "at_or_above" -> listOfNotNull(min?.let { TagLine(feet(it), under = true) })
            "at_or_below" -> listOfNotNull(max?.let { TagLine(feet(it), over = true) })
            "at" -> listOfNotNull((min ?: max)?.let { TagLine(feet(it), under = true, over = true) })
            "between" -> if (min != null && max != null) listOf(TagLine(feet(max), over = true), TagLine(feet(min), under = true)) else emptyList()
            else -> emptyList()
        }
    }

    /** Feet as the plates write them: "2,700'". */
    fun feet(ft: Double): String = String.format(Locale.US, "%,d'", ft.roundToInt())

    /** The final segment's points, latitude and longitude pairs. */
    fun finalPoints(answer: EngineContract.ApproachFixTagsAnswer): List<Pair<Double, Double>> =
        answer.final?.points.orEmpty().mapNotNull { p ->
            val lat = p.getOrNull(0)?.jsonPrimitive?.doubleOrNull
            val lon = p.getOrNull(1)?.jsonPrimitive?.doubleOrNull
            if (lat != null && lon != null) lat to lon else null
        }
}
