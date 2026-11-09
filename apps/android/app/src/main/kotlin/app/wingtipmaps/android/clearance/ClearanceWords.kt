package app.wingtipmaps.android.clearance

import app.wingtipmaps.android.api.generated.ClearancePlaces
import app.wingtipmaps.android.api.generated.SpokenPlace
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.format.Format

/**
 * The clearance card's words, each a plain function on what the engine
 * said, so the card lays them out and nothing is judged in a view: the
 * iPhone's ClearanceStep.swift and ClearanceSheet's lines, the web's
 * ClearanceCard. The figures are the engine's; only the wording is here.
 */
object ClearanceWords {
    /** One line under the read back: a tick for what was read back, a
     *  mark for each part missed or said differently. */
    data class Line(val ok: Boolean, val words: String)

    /** The parts of a clearance in the order they are read back (AIM
     *  4-4-7 b), with each one's name on the screen. */
    private val PARTS = listOf(
        "limit" to "limit", "route" to "route", "altitude" to "altitude", "expect" to "expected altitude",
        "frequency" to "frequency", "squawk" to "squawk",
    )

    /** The parts a clearance has, for the tick to name. */
    fun parts(c: Clearance): List<String> = buildList {
        if (c.read.limit != null || c.read.classB) add("limit")
        if (c.route.isNotEmpty() || c.read.asFiled) add("route")
        if (c.read.maintainFt != null) add("altitude")
        if (c.read.expectFt != null) add("expect")
        if (c.read.frequency != null) add("frequency")
        if (c.read.squawk != null) add("squawk")
    }

    private fun capital(s: String) = s.replaceFirstChar { it.uppercase() }

    /** The lines for a read back of `c` by the engine's readback_check:
     *  the parts read back in one tick ("Limit, route and squawk read
     *  back"), then one line for each part missed ("Squawk 4512 not read
     *  back") or said differently ("Altitude: 4,000 ft said, 5,000 ft
     *  cleared"). */
    fun readbackLines(c: Clearance, check: EngineContract.ReadbackCheckAnswer): List<Line> {
        val missed = check.items.map { it.item }.toSet()
        val has = parts(c)
        val read = PARTS.filter { it.first in has && it.first !in missed }.map { it.second }
        val lines = mutableListOf<Line>()
        if (read.isNotEmpty()) {
            val list = if (read.size == 1) read[0] else read.dropLast(1).joinToString(", ") + " and " + read.last()
            lines += Line(true, capital(list) + " read back")
        }
        for (item in check.items) {
            val named = capital(PARTS.firstOrNull { it.first == item.item }?.second ?: item.item)
            lines += if (item.said != null) Line(false, "$named: ${item.said} said, ${item.cleared} cleared") else Line(false, "$named ${item.cleared} not read back")
        }
        return lines
    }

    /** The route cleared against the one filed: only the points that
     *  differ (the cleared points are idents with no positions until they
     *  are planned), or that nothing does. */
    data class Difference(val same: Boolean, val words: String)

    fun compare(plannedStops: List<String>, plannedDest: String, cleared: Cleared): Difference {
        val parts = mutableListOf<String>()
        if (cleared.dest != plannedDest && cleared.dest.isNotEmpty()) {
            parts += if (plannedDest.isEmpty()) "to ${cleared.dest}" else "to ${cleared.dest} instead of $plannedDest"
        }
        val added = cleared.stops.filter { it !in plannedStops }
        val dropped = plannedStops.filter { it !in cleared.stops }
        when {
            added.isNotEmpty() && dropped.isNotEmpty() -> parts += "${added.joinToString(" ")} instead of ${dropped.joinToString(" ")}"
            added.isNotEmpty() -> parts += "adds ${added.joinToString(" ")}"
            dropped.isNotEmpty() -> parts += "leaves out ${dropped.joinToString(" ")}"
            cleared.stops != plannedStops && parts.isEmpty() -> parts += "the same points in another order"
        }
        if (cleared.typed.isNotEmpty()) parts += "with the ${cleared.typed.joinToString(" and ") { it.name }}"
        return if (parts.isEmpty()) Difference(true, "The same route as you filed.") else Difference(false, parts.joinToString("; ") + ".")
    }

    /** A place as found: its ident, "KDLH?" where found by its sound
     *  alone, "“duluth”?" where nothing near was like it. */
    fun place(p: SpokenPlace): String = when {
        p.ident == null -> "“${p.said}”?"
        p.sure == true -> p.ident
        else -> "${p.ident}?"
    }

    /** The route in one line, "Radar vectors → GEP → V2 → as filed", its
     *  places as found where they are. */
    fun route(c: Clearance, found: ClearancePlaces?): String {
        var run = 0
        val parts = c.route.flatMap { item ->
            when (item.kind) {
                "vectors" -> listOf("Radar vectors")
                "heading" -> listOf("Heading ${Format.heading((item.degrees ?: 0).toDouble())}")
                "airway" -> listOf(item.ident.orEmpty())
                "places" -> {
                    val places = found?.route?.getOrNull(run) ?: listOf(SpokenPlace(said = item.said.orEmpty(), ident = item.said?.uppercase(), sure = true))
                    run += 1
                    places.map(::place)
                }
                else -> {
                    val picked = if (item.kind == "departure") found?.departure else found?.arrival
                    listOf(picked?.let { it.id + (it.transition?.let { t -> ".$t" } ?: "") } ?: "${capitalWords(item.name.orEmpty())} ${item.number.orEmpty()} ${item.kind}".trim())
                }
            }
        } + if (c.read.asFiled) listOf("as filed") else emptyList()
        return parts.joinToString(" → ")
    }

    /** "Maintain 5,000 ft, expect 9,000 ft 10 min after departure". */
    fun altitudes(c: Clearance, said: (Int) -> String): String? {
        val r = c.read
        val parts = listOfNotNull(
            r.maintainFt?.let { "Maintain " + (if (r.vfr) "VFR " else "") + (r.maintainLimit?.let { l -> "$l " } ?: "") + said(it) },
            r.expectFt?.let { "expect " + said(it) + (r.expectMin?.let { m -> " $m min after departure" } ?: "") },
        )
        return if (parts.isEmpty()) null else capital(parts.joinToString(", "))
    }

    /** "Chicago Departure 125.0", the facility in words where said. */
    fun frequency(c: Clearance): String? = c.read.frequency?.let { "${capitalWords(c.read.facility.orEmpty())} $it".trim() }

    private fun capitalWords(s: String) = s.split(" ").joinToString(" ") { capital(it) }
}
