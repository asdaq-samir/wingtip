package app.wingtipmaps.android.atc

import app.wingtipmaps.android.engine.generated.EngineContract
import kotlin.math.roundToInt

/** What a tap can do with an item on this phone: fly direct (the plan's
 *  Direct To), or keep the next frequency or the code in sight. */
enum class ItemAction { DIRECT, FREQUENCY, SQUAWK }

/**
 * How the ATC copilot's card writes a call's items (the figures are the
 * engine's, atc_call; the words are the app's, the web's atcWords and the
 * iPhone's AtcItem.words): "Descend 3,000 ft", "Left heading 270", "Hold
 * NE of GOPHER, 045 radial, left turns, EFC 1430Z". Altitudes as ATC says
 * them (`altitude`, the engine's altitude_said, AIM 4-2-9), headings in
 * three figures (AIM 4-2-10), times in UTC with a Z (AIM 4-2-12).
 */
object AtcWords {
    private fun capital(words: String) = words.replaceFirstChar { it.uppercase() }
    private fun three(deg: Double) = deg.roundToInt().toString().padStart(3, '0')

    /** The eight points a hold is said from, as a chart abbreviates them. */
    private val POINTS = mapOf(
        "north" to "N", "northeast" to "NE", "east" to "E", "southeast" to "SE",
        "south" to "S", "southwest" to "SW", "west" to "W", "northwest" to "NW",
    )

    private val RUNWAY = mapOf(
        "land" to "cleared to land", "takeoff" to "cleared for takeoff", "option" to "cleared for the option", "line up and wait" to "line up and wait",
    )

    fun itemWords(item: AtcItem, altitude: (Double) -> String): String {
        val alt = { ft: Double? -> ft?.let(altitude).orEmpty() }
        return when (item.kind) {
            "altitude" -> "${capital(item.verb ?: "maintain")}${item.limit?.let { " $it" }.orEmpty()} ${alt(item.ft)}"
            "expect" -> "Expect ${alt(item.ft)}" + (item.min?.let { " ${it.roundToInt()} min after departure" }.orEmpty())
            "heading" -> when {
                item.byDeg != null -> listOfNotNull("Turn", item.turn, "${item.byDeg.roundToInt()}°").joinToString(" ")
                item.deg == null -> "Runway heading"
                else -> "${item.turn?.let { "${capital(it)} heading" } ?: "Heading"} ${three(item.deg)}"
            }
            "direct" -> "Direct ${item.said.orEmpty().uppercase()}"
            "route" -> {
                val via = item.places.orEmpty().joinToString(", ") { it.uppercase() }
                (item.limit?.let { "Cleared to ${capital(it)}" } ?: "Cleared") + (if (via.isEmpty()) "" else " via $via") +
                    (if (item.asFiled == true) ", then as filed" else "")
            }
            "class_b" -> "Cleared into Class B"
            "hold" -> hold(item)
            "frequency" -> "${item.facility?.let { "${capital(it)} " } ?: "Contact "}${item.mhz.orEmpty()}"
            "squawk" -> "Squawk ${item.code.orEmpty()}"
            "altimeter" -> "Altimeter ${item.inhg.orEmpty()}"
            "approach" -> "${if (item.cleared == true) "Cleared" else "Expect"} ${item.name.orEmpty()}${item.runway?.let { " $it" }.orEmpty()} approach"
            "runway" ->
                if (item.what == "hold short") "Hold short runway ${item.runway.orEmpty()}"
                else "Runway ${item.runway.orEmpty()}" + (item.what?.let { RUNWAY[it] }?.let { ", $it" }.orEmpty())
            else -> capital(item.kind.replace('_', ' '))
        }
    }

    private fun hold(item: AtcItem): String {
        val at = item.fix.orEmpty().uppercase()
        if (item.published == true) return "Hold at $at as published" + (item.efc?.let { ", EFC ${it}Z" }.orEmpty())
        val parts = mutableListOf("Hold${item.direction?.let { " ${POINTS[it] ?: it}" }.orEmpty()} of $at")
        if (item.on != null && item.onDeg != null) parts += "${three(item.onDeg)} ${item.on}"
        item.turns?.let { parts += "$it turns" }
        item.efc?.let { parts += "EFC ${it}Z" }
        return parts.joinToString(", ")
    }

    /** What a tap can do with an item here; null where nothing. Altitudes
     *  and routes are set on the web, where the plan has them. */
    fun actionOf(item: AtcItem): ItemAction? = when (item.kind) {
        "direct" -> ItemAction.DIRECT
        "frequency" -> ItemAction.FREQUENCY
        "squawk" -> ItemAction.SQUAWK
        else -> null
    }

    /** A readback's lines: complete, else each item missed or said
     *  differently, those AIM 4-4-7 b asks be read back first. */
    fun readbackLines(check: EngineContract.ReadbackCheckAnswer): List<String> {
        if (check.items.isEmpty()) return listOf("Readback complete")
        return check.items.sortedByDescending { it.required }.map { i ->
            i.said?.let { "${capital(i.item)}: $it said, ${i.cleared} given" } ?: "${capital(i.item)} ${i.cleared} not read back"
        }
    }

    /** Whether the readback left out or changed anything. */
    fun readbackShort(check: EngineContract.ReadbackCheckAnswer): Boolean = check.items.isNotEmpty()
}
