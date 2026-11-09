package app.wingtipmaps.android.live

import app.wingtipmaps.android.api.generated.DepartureEvent
import app.wingtipmaps.android.api.generated.FlowProgram
import app.wingtipmaps.android.api.generated.RunwayRvr
import app.wingtipmaps.android.api.generated.SaaStatus
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.format.Format
import java.time.Instant

/** A D-ATIS broadcast's figures, the engine's read_datis (read_atis's shape). */
typealias AtisReading = EngineContract.ReadDatisAnswer

/** One row of a broadcast's table: what it is, and the figure. */
data class LiveRow(val label: String, val value: String)

/**
 * The live reports in words, as the web's lib/atis, lib/rvrRows,
 * lib/liveReports and lib/departureWords write them: pure, so the
 * writing is held to the web's own cases on the JVM (LiveWordsTest).
 * Every figure is the planner's or the engine's -- whether the wind is
 * calm (wind_calm), which layer is the ceiling (ceiling_visibility),
 * whether a runway's RVR is under the pilot's minimum (rvr_check) --
 * passed in; nothing here judges one.
 */
object LiveWords {
    /** A time in Zulu from UNIX seconds: "2130Z". */
    fun zulu(unixS: Double): String = Format.zulu(Instant.ofEpochMilli((unixS * 1000).toLong()))

    /** Whether anything of a broadcast was read at all. */
    fun heardAny(r: AtisReading): Boolean =
        r.information != null || r.timeZ != null || r.wind != null || r.visibilitySm != null || r.sky.isNotEmpty() ||
            r.altimeterInhg != null || r.approach != null || r.runways.landing.isNotEmpty() || r.runways.departing.isNotEmpty()

    /** The wind as a pilot says it back: "210° at 12 kt, gusts 18";
     *  "Calm" where the engine's wind_calm says so (AIM 7-1-28). */
    fun windWords(w: EngineContract.ReadDatisAnswerWind, calm: Boolean): String {
        if (calm) return "Calm"
        val speed = w.kt?.let { "$it kt" }
        val gusts = w.gustKt?.let { "gusts $it" }
        val head = when {
            w.fromDeg != null -> Format.heading(w.fromDeg.toDouble()) + if (w.variable) " variable" else ""
            w.variable -> if (speed != null) "Variable" else "Light and variable"
            else -> null
        }
        val first = if (head != null && speed != null) "$head at $speed" else head ?: speed
        return listOfNotNull(first, gusts).joinToString(", ")
    }

    /** The layers as said, the ceiling marked: the engine's ceiling
     *  (ceiling_visibility, 14 CFR 1.1: the lowest broken or overcast
     *  layer, or an obscuration), `ceilingFt` here. */
    fun skyWords(sky: List<EngineContract.ReadDatisAnswerSkyItem>, ceilingFt: Double?): String {
        if (sky.isEmpty()) return Format.NONE
        val ceiling = if (ceilingFt == null) null else sky.lastOrNull { it.baseFt?.toDouble() == ceilingFt }
        return sky.joinToString(" · ") { l ->
            val cover = l.cover.replaceFirstChar { it.uppercase() }
            val base = l.baseFt?.let { " " + Format.altitude(it.toDouble()) }.orEmpty()
            "$cover$base${if (l === ceiling) " (ceiling)" else ""}"
        }
    }

    /** The METAR's code for each of the ATIS's covers, for the engine's
     *  ceiling (the web's METAR_COVER). */
    fun metarCover(cover: String): String = when (cover) {
        "clear" -> "CLR"
        "few" -> "FEW"
        "scattered" -> "SCT"
        "broken" -> "BKN"
        "overcast" -> "OVC"
        "obscured" -> "VV"
        else -> cover
    }

    /** The runways as said: both ways, or landing and departing apart. */
    fun runwayWords(r: EngineContract.ReadDatisAnswerRunways): String? {
        if (r.landing.isNotEmpty() && r.landing == r.departing) return r.landing.joinToString(", ")
        val parts = listOfNotNull(
            r.landing.takeIf { it.isNotEmpty() }?.let { "Landing ${it.joinToString(", ")}" },
            r.departing.takeIf { it.isNotEmpty() }?.let { "Departing ${it.joinToString(", ")}" },
        )
        return parts.takeIf { it.isNotEmpty() }?.joinToString(" · ")
    }

    /** The line that matters at the hold-short line: the runway in use
     *  and the altimeter. */
    fun glanceWords(r: AtisReading): String {
        val runways = runwayWords(r.runways)
        val parts = listOfNotNull(
            runways?.let { "Runway $it" } ?: r.approach,
            r.altimeterInhg?.let(Format::altimeter),
        )
        return parts.joinToString(" · ").ifEmpty { "Nothing of a broadcast was read" }
    }

    /** The table under the line, a row a figure, only the figures read. */
    fun atisRows(r: AtisReading, calm: Boolean, ceilingFt: Double?): List<LiveRow> = buildList {
        when {
            r.information != null -> add(LiveRow("Information", r.information + (r.timeZ?.let { " · $it" } ?: "")))
            r.timeZ != null -> add(LiveRow("Observed", r.timeZ))
        }
        r.wind?.let { add(LiveRow("Wind", windWords(it, calm))) }
        r.visibilitySm?.let { add(LiveRow("Visibility", Format.visibility(it))) }
        if (r.sky.isNotEmpty()) add(LiveRow("Sky", skyWords(r.sky, ceilingFt)))
        r.tempC?.let { t -> add(LiveRow("Temperature", Format.temperature(t.toDouble()) + (r.dewpointC?.let { ", dew point ${Format.temperature(it.toDouble())}" } ?: ""))) }
        r.altimeterInhg?.let { add(LiveRow("Altimeter", Format.altimeter(it))) }
        r.approach?.let { add(LiveRow("Approach", it)) }
        runwayWords(r.runways)?.let { add(LiveRow("Runways", it)) }
        r.remarks.forEach { add(LiveRow("Remarks", it)) }
    }

    /** A broadcast's heading: "Arrival D-ATIS, information K". */
    fun atisTitle(which: String?, letter: String?): String {
        val name = which?.let { "${it.replaceFirstChar { c -> c.uppercase() }} D-ATIS" } ?: "D-ATIS"
        return name + (letter?.let { ", information $it" } ?: "")
    }

    /** One RVR reading: "6000+" at the system's most (AIM 7-1-13), "—"
     *  where none. */
    fun readingWords(ft: Int?, more: Boolean?): String = when {
        ft == null -> Format.NONE
        more == true -> "$ft+"
        else -> ft.toString()
    }

    /** A visibility as a pilot says a minimum: "1/2", "1 1/4", "3". */
    fun smWords(sm: Double): String {
        val whole = kotlin.math.floor(sm).toInt()
        val eighths = Math.round((sm - whole) * 8).toInt()
        val fraction = when {
            eighths == 0 -> ""
            eighths % 4 == 0 -> "1/2"
            eighths % 2 == 0 -> "${eighths / 2}/4"
            else -> "$eighths/8"
        }
        return listOfNotNull(whole.takeIf { it != 0 }?.toString(), fraction.ifEmpty { null }).joinToString(" ").ifEmpty { "0" }
    }

    /** A runway end's RVR as its row shows it: touchdown, midpoint and
     *  rollout, and the engine's word on it against the pilot's minimum
     *  (rvr_check, 14 CFR 91.175(h)(2)), where one is set. */
    data class RvrRow(val runway: String, val readings: String, val under: String?)

    fun rvrRows(runways: List<RunwayRvr>, under: List<Boolean?>, minimumSm: Double?): List<RvrRow> = runways.mapIndexed { i, r ->
        RvrRow(
            runway = r.runway,
            readings = listOf(readingWords(r.touchdownFt, r.touchdownMore), readingWords(r.midpointFt, r.midpointMore), readingWords(r.rolloutFt, r.rolloutMore)).joinToString(" · "),
            under = if (under.getOrNull(i) == true && minimumSm != null) "Under your ${smWords(minimumSm)} SM minimum (14 CFR 91.175(h))" else null,
        )
    }

    /** A program in a line: "Ground stop at EWR until 2130Z, delays
     *  average 45 min"; a restriction is no program and gives none. */
    fun programLine(p: FlowProgram): String? {
        val program = p.program
        if (p.restriction == true || program.isNullOrEmpty()) return null
        val name = program.replaceFirstChar { it.uppercase() }
        val until = p.ends?.let { " until ${zulu(it)}" }.orEmpty()
        val delay = p.averageDelayMin?.let { ", delays average $it min" }.orEmpty()
        return "$name at ${p.airport}$until$delay"
    }

    /** An area's status for its card: "Active now until 2130Z (FAA
     *  SFDPS)", "Cold now; next active 1400Z (FAA SFDPS)". */
    fun saaWords(status: SaaStatus?): String? {
        val active = status?.active ?: return null
        val until = status.until?.let { " until ${zulu(it)}" }.orEmpty()
        val next = if (!active && status.next != null) "; next active ${zulu(status.next)}" else ""
        return "${if (active) "Active" else "Cold"} now$until$next (FAA SFDPS)"
    }

    /** A flight's latest tower departure event: "Cleared 0457Z at KIND,
     *  gate B20, to KRSW (FAA TDES)". The clearance's delivery is no
     *  takeoff, and is never called one. */
    fun departureLine(e: DepartureEvent?): String? {
        e ?: return null
        val cleared = e.times?.get("clearance_delivery")
        val head = listOfNotNull(cleared?.let { "Cleared ${zulu(it)}" } ?: "Departure event", e.departure?.let { "at $it" }).joinToString(" ")
        val rest = listOfNotNull(e.gate?.let { "gate $it" }, e.destination?.let { "to $it" })
        return (listOf(head) + rest).joinToString(", ") + " (FAA TDES)"
    }
}
