package app.wingtipmaps.android.brief

import app.wingtipmaps.android.api.Course
import app.wingtipmaps.android.api.generated.AircraftProfile
import app.wingtipmaps.android.api.generated.Briefing
import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.engine.generated.gonogoRunwayChecks
import app.wingtipmaps.android.engine.generated.gonogoRunwayNumber
import app.wingtipmaps.android.strip.Finding
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.encodeToJsonElement
import kotlin.math.roundToInt

/**
 * The Brief's Depart and Arrive rows, as the web's buildGlance gives its
 * FieldGlance: the departure's and the destination's runway flown, its
 * length, the takeoff or landing over a 50 ft obstacle on it from the
 * airplane's POH (14 CFR 91.103(b): runway lengths and the takeoff and
 * landing distance data), and its flight category by the field's METAR.
 * Every figure is the engine's `gonogo_runway_checks`, asked with the
 * briefing's METARs and runways, the airplane's tables as the planner sent
 * them with the nav log (its altitude line's profile) and the runways the
 * pilot picked; only the finding's colour is read off its flags here, as
 * the web reads it.
 */
data class FieldGlance(
    val ident: String,
    /** The METAR's flight category (VFR, MVFR, IFR, LIFR); null where none says. */
    val category: String?,
    /** When the flight leaves or lands there, epoch ms; null where not known. */
    val atMs: Long?,
    val runway: String?,
    val runwayFt: Int?,
    /** The takeoff or the landing over a 50 ft obstacle, ft; null without the POH's tables. */
    val overFiftyFt: Int?,
    val finding: Finding,
)

object BriefFields {
    private val coder = Json { ignoreUnknownKeys = true; explicitNulls = false }

    /** The planner's model as the engine's own type of the same JSON (the same snake case). */
    private inline fun <reified A, reified B> recast(a: A): B = coder.decodeFromJsonElement(coder.encodeToJsonElement(a))

    /** The departure's and the destination's glance; null for either without a course. */
    fun of(
        briefing: Briefing?,
        course: Course?,
        aircraft: AircraftProfile?,
        picks: Pair<Map<String, String>, Map<String, String>>,
        departMs: Long?,
        eteMin: Double?,
    ): Pair<FieldGlance?, FieldGlance?> {
        course ?: return null to null
        val fields = listOf(course.departure) + course.stops.orEmpty().filter { it.kind != "fix" } + course.destination
        val checks = checks(briefing, fields, aircraft, picks)
        fun at(ident: String, departure: Boolean, atMs: Long?): FieldGlance {
            val check = checks.firstOrNull { c -> fields.getOrNull(c.field)?.ident == ident && c.role == (if (departure) "Departure" else "Destination") }
            val distance = check?.distances?.firstOrNull { it.kind == (if (departure) "takeoff" else "landing") }
            val runway = check?.runway?.let { briefing?.airports?.get(ident)?.runways?.getOrNull(it) }
            return FieldGlance(
                ident = ident,
                category = briefing?.metars?.get(ident)?.flightCategory,
                atMs = atMs,
                runway = check?.end?.let { Engine.gonogoRunwayNumber(it).getOrNull() },
                runwayFt = runway?.lengthFt,
                overFiftyFt = distance?.totalFt?.roundToInt(),
                finding = finding(check, distance),
            )
        }
        val arriveMs = if (departMs != null && eteMin != null) departMs + (eteMin * 60_000).toLong() else null
        return at(course.departure.ident, true, departMs) to at(course.destination.ident, false, arriveMs)
    }

    /**
     * A field's finding as the web reads the engine's check: not known
     * where it was not checked (no elevation, no runway length, no table),
     * never fine; stop where the distance is past the runway; caution past
     * the demonstrated crosswind or beyond the POH's table.
     */
    fun finding(check: EngineContract.GonogoRunwayChecksAnswerItem?, distance: EngineContract.GonogoRunwayChecksAnswerItemDistancesItem?): Finding = when {
        check == null || check.unchecked != null || distance == null || distance.unknown -> Finding.UNKNOWN
        distance.over -> Finding.STOP
        check.crosswindOver || distance.beyond -> Finding.CAUTION
        else -> Finding.OK
    }

    private fun checks(
        briefing: Briefing?,
        fields: List<app.wingtipmaps.android.api.CourseEnd>,
        aircraft: AircraftProfile?,
        picks: Pair<Map<String, String>, Map<String, String>>,
    ): List<EngineContract.GonogoRunwayChecksAnswerItem> {
        briefing ?: return emptyList()
        val takeoff = aircraft?.takeoff ?: return emptyList()
        val landing = aircraft.landing ?: return emptyList()
        val idents = fields.map { it.ident }.toSet()
        return runCatching {
            Engine.gonogoRunwayChecks(
                aircraft = EngineContract.GonogoRunwayChecksInputAircraft(
                    takeoff = recast<_, EngineContract.ShortFieldTable>(takeoff),
                    landing = recast<_, EngineContract.ShortFieldTable>(landing),
                    crosswind = aircraft.crosswind?.let { EngineContract.GonogoRunwayChecksInputAircraftCrosswind(it.demonstratedKt) },
                ),
                fields = fields.map { EngineContract.GonogoRunwayChecksInputFieldsItem(it.ident, it.elevationFt) },
                metars = briefing.metars.filterKeys { it in idents }.mapValues { (_, m) -> m?.let { recast<_, EngineContract.GonogoMetar>(it) } },
                airports = briefing.airports.filterKeys { it in idents }.mapValues { (_, a) ->
                    EngineContract.GonogoRunwayChecksInputAirportsValue(a.runways.map { recast<_, EngineContract.Runway>(it) })
                },
                picks = EngineContract.GonogoPicks(pattern = pairs(picks.first), takeoff = pairs(picks.second)),
            ).getOrThrow()
        }.getOrDefault(emptyList())
    }

    /** The picks as the engine reads them, an object of field to end. */
    private fun pairs(picks: Map<String, String>) = JsonObject(picks.mapValues { JsonPrimitive(it.value) })
}
