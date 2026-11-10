package app.wingtipmaps.android.ai

import app.wingtipmaps.android.api.AirportPlace
import app.wingtipmaps.android.api.AssistantSource
import app.wingtipmaps.android.api.Leg
import app.wingtipmaps.android.api.NavLogTotals
import app.wingtipmaps.android.api.generated.VerdictItem
import app.wingtipmaps.android.format.Format

/**
 * What each screen hands AI to put in words (AiWordsRow): its own
 * figures, as the screen shows them -- the engine's verdict and findings,
 * the planner's decoded METAR beside the report as sent, the nav log's
 * legs and totals, the NOTAMs as the FAA sent them -- each a source with
 * an id the words may cite, and the only figures FigureGuard lets
 * through. Pure, for a unit test (AiSourcesTest).
 */
object AiSources {
    fun brief(verdict: String?, risk: String?, items: List<VerdictItem>): List<AssistantSource> =
        listOfNotNull(
            verdict?.let { AssistantSource("verdict", "Verdict", it) },
            risk?.let { AssistantSource("risk", "Risk", it) },
        ) + items.map { AssistantSource(it.key, it.label, it.detail) }

    /** A field's report as sent, the planner's reading of it, and its TAF. */
    fun weather(place: AirportPlace): List<AssistantSource> {
        val m = place.metar
        val read = m?.let {
            listOfNotNull(
                it.flightCategory,
                it.windDirTrueDeg?.let { d -> "wind ${Format.heading(d)} true at ${Format.speed(it.windSpeedKt)}" + (it.windGustKt?.let { g -> ", gusts ${Format.speed(g)}" } ?: "") },
                it.visibilitySm?.let { v -> "visibility ${Format.visibility(v)}" },
                it.ceilingFt?.let { c -> "ceiling ${Format.altitude(c)} above the field" },
                it.tempC?.let { t -> "temperature ${Format.temperature(t)}" },
                it.dewpointC?.let { d -> "dew point ${Format.temperature(d)}" },
                it.altimeterInHg?.let { a -> "altimeter ${Format.altimeter(a)}" },
            ).joinToString(", ")
        }
        return listOfNotNull(
            m?.raw?.let { AssistantSource("metar", "${place.ident} METAR", it) },
            read?.takeIf { it.isNotEmpty() }?.let { AssistantSource("metar-read", "${place.ident} METAR read", it) },
            place.taf?.let { AssistantSource("taf", "${place.ident} TAF", it) },
            place.elevationFt?.let { AssistantSource("elevation", "${place.ident} elevation", Format.altitude(it)) },
        )
    }

    fun notams(raw: List<String>): List<AssistantSource> = raw.mapIndexed { i, text -> AssistantSource("notam-${i + 1}", "NOTAM", text) }

    /** The nav log: each leg's figures and the totals, as the planner gave them. */
    fun route(legs: List<Leg>, totals: NavLogTotals?, airplane: String): List<AssistantSource> {
        val each = legs.mapIndexed { i, l ->
            val figures = listOfNotNull(
                "${l.from} to ${l.to}",
                Format.distance(l.distanceNm),
                Format.altitude(l.altitudeFt),
                "course ${Format.heading(l.magneticCourseDeg)} magnetic",
                l.eteMin?.let(Format::duration),
                l.fuelGal?.let(Format::fuel),
            )
            AssistantSource("leg-${i + 1}", "Leg ${i + 1}", figures.joinToString(", "))
        }
        val total = totals?.let { t ->
            listOfNotNull(
                Format.distance(t.distanceNm),
                t.eteMin?.let(Format::duration),
                t.fuelGal?.let(Format::fuel),
                t.fuelRequiredGal?.let { "${Format.fuel(it)} required" },
            ).joinToString(", ")
        }
        return each + listOfNotNull(
            total?.let { AssistantSource("totals", "Totals", it) },
            AssistantSource("airplane", "Airplane", airplane.ifEmpty { "none chosen" }),
        )
    }

    /** The coach's weak areas, each with the flights it was seen on. */
    fun debrief(areas: List<Pair<String, List<String>>>): List<AssistantSource> =
        areas.mapIndexed { i, (title, evidence) -> AssistantSource("area-${i + 1}", title, evidence.joinToString(" ")) }

    /** A logbook entry's facts as the pilot typed them (14 CFR 61.51(b)'s columns). */
    fun logbook(date: String, route: String, airplane: String, total: String, night: String, day: String, nightLandings: String, approaches: Int): List<AssistantSource> =
        listOf(
            AssistantSource("entry", "Logbook entry", "flown $date, route ${route.ifBlank { "not written" }}, airplane ${airplane.ifBlank { "not written" }}"),
            AssistantSource("times", "Times", "total $total h, night $night h"),
            AssistantSource("landings", "Landings", "day $day, night $nightLandings, approaches $approaches"),
        )
}
