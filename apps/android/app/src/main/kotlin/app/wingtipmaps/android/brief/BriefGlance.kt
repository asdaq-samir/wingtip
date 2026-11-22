package app.wingtipmaps.android.brief

import app.wingtipmaps.android.api.Course
import app.wingtipmaps.android.api.Leg
import app.wingtipmaps.android.api.NavLogTotals
import app.wingtipmaps.android.api.generated.Briefing
import app.wingtipmaps.android.api.generated.OnRoute
import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.engine.generated.gairmetTitle
import app.wingtipmaps.android.engine.generated.gonogoAdverseRows
import app.wingtipmaps.android.engine.generated.gonogoRouteFigures
import app.wingtipmaps.android.engine.generated.pirepConditions
import app.wingtipmaps.android.engine.generated.routeAdiz
import app.wingtipmaps.android.engine.generated.routeHeadwind
import app.wingtipmaps.android.engine.generated.routeJurisdiction
import app.wingtipmaps.android.engine.generated.sigmetHazard

/**
 * The Brief as the web's opens it under the findings (the owner's pick of
 * the Brief audit's option 2, 2026-11-21; the web's buildGlance): the
 * Adverse Conditions the flight meets on the route, a briefer's first
 * element (AIM 7-1-5(b)(1)), the En Route figures -- the lowest ceiling
 * any TAF near the route forecasts over the flight, its lowest
 * visibility and the strongest headwind on any leg -- and Before You
 * Go's fuel beyond the reserve (14 CFR 91.151(a), 91.167(a)); what the
 * briefing could not check; and where the route meets an Air Defense
 * Identification Zone (14 CFR part 99) or leaves the United States
 * (14 CFR 91.1, 91.703; decision 0053); the departure's and the
 * destination's runway checks (BriefFields) and FAA data out of its cycle
 * (DataCycles). Every rule is the engine's; this
 * only gathers what it is asked from the planner's briefing and the plan.
 */
data class BriefGlance(
    val adverse: EngineContract.GonogoAdverseRowsAnswer = NONE,
    val ceilingFt: Double? = null,
    val visibilitySm: Double? = null,
    /** The strongest headwind on a leg, kt, a tailwind negative; null where no leg has a wind. */
    val headwindKt: Double? = null,
    val eteMin: Double? = null,
    /** The least fuel beyond the reserve of any flight of the route, gal; null with no airplane. */
    val beyondReserveGal: Double? = null,
    /** What the briefing could not check, in words ("SIGMETs", "pilot reports"). */
    val unchecked: List<String> = emptyList(),
    /** The engine's lines for an ADIZ met and for leaving the United States. */
    val adiz: String? = null,
    val outside: String? = null,
    /** The departure's and the destination's runway, distance and category (BriefFields). */
    val depart: FieldGlance? = null,
    val arrive: FieldGlance? = null,
    /** The FAA data out of its cycle, in a line (DataCycles), for the caution row. */
    val outOfCycle: String? = null,
) {
    companion object {
        val NONE = EngineContract.GonogoAdverseRowsAnswer(rows = emptyList(), more = 0)

        /** The briefing's sources by the planner's names, as the web's
         *  WEATHER_SOURCE_LABEL says them in a sentence. */
        private val SOURCES = mapOf(
            "hazards" to "SIGMETs",
            "forecast" to "the TAF forecast",
            "metars" to "current METARs",
            "tfrs" to "TFRs",
            "pireps" to "pilot reports",
            "gairmets" to "G-AIRMETs",
        )

        /** The glance for a planned route: the briefing's parts (none
         *  where it could not be had) and the plan's legs, course and totals. */
        fun of(
            briefing: Briefing?,
            course: Course?,
            legs: List<Leg>,
            totals: NavLogTotals?,
            airplane: Boolean,
            fields: Pair<FieldGlance?, FieldGlance?> = null to null,
            outOfCycle: String? = null,
        ): BriefGlance {
            val line = course?.courseLine.orEmpty().filter { it.size == 2 }
            return BriefGlance(
                depart = fields.first,
                arrive = fields.second,
                outOfCycle = outOfCycle,
                adverse = briefing?.let(::adverse) ?: NONE,
                ceilingFt = briefing?.forecast?.minCeilingFt,
                visibilitySm = briefing?.forecast?.minVisibilitySm,
                headwindKt = headwind(legs),
                eteMin = totals?.eteMin,
                beyondReserveGal = if (airplane) beyondReserve(totals) else null,
                unchecked = briefing?.weatherUnavailable.orEmpty().mapNotNull { SOURCES[it] },
                adiz = line.takeIf { it.isNotEmpty() }?.let { pts ->
                    Engine.routeAdiz(pts.map { EngineContract.RouteAdizInputPointsItem(it[0], it[1]) }).getOrNull()?.brief?.line
                },
                outside = line.takeIf { it.isNotEmpty() }?.let { pts ->
                    Engine.routeJurisdiction(pts.map { EngineContract.RouteJurisdictionInputPointsItem(it[0], it[1]) }).getOrNull()?.brief?.line
                },
            )
        }

        /** The engine's route_headwind over the nav log's legs. */
        fun headwind(legs: List<Leg>): Double? = Engine.routeHeadwind(
            legs.map { leg ->
                EngineContract.RouteHeadwindInputLegsItem(
                    from = leg.from, to = leg.to, trueCourseDeg = leg.trueCourseDeg,
                    wind = leg.wind?.let { EngineContract.RouteHeadwindInputLegsItemWind(it.windDirTrueDeg, it.windSpeedKt) },
                )
            },
        ).getOrNull()?.headwindKt

        /** The least margin of the route's flights, the engine's
         *  gonogo_route_figures, as the web's verdict reads it. */
        private fun beyondReserve(totals: NavLogTotals?): Double? {
            totals ?: return null
            val given = EngineContract.GonogoRouteFiguresInputTotals(
                fuelMarginGal = totals.fuelMarginGal, fuelRequiredGal = totals.fuelRequiredGal, reserveMin = totals.reserveMin,
                hops = totals.hops?.map { hop ->
                    EngineContract.GonogoRouteFiguresInputTotalsHopsItem(
                        EngineContract.GonogoRouteFiguresInputTotalsHopsItemTotals(hop.totals.fuelMarginGal, hop.totals.fuelRequiredGal, hop.totals.reserveMin),
                    )
                },
            )
            return Engine.gonogoRouteFigures(totals = given, crossed = emptyList()).getOrNull()?.leastMarginGal
        }

        /** What the briefing holds that the flight meets on the route, one
         *  list for the engine to choose from, order and cap
         *  (gonogo_adverse_rows), named as every page names them (the
         *  engine's sigmet_hazard, gairmet_title and pirep_conditions). */
        fun adverse(briefing: Briefing): EngineContract.GonogoAdverseRowsAnswer {
            fun item(source: String, name: String?, on: OnRoute?, issued: String? = null, crosses: Boolean = false, urgent: Boolean = false) =
                EngineContract.GonogoAdverseRowsInputAdvisoriesItem(
                    source = source, name = name, `when` = on?.onRouteWhen, enter = on?.enter, validTo = on?.validTo,
                    issued = issued, fromNm = on?.fromNm, legs = on?.legs.orEmpty().map(Int::toDouble), crosses = crosses, urgent = urgent,
                )
            val advisories = briefing.hazards.map { h ->
                item(h.onRoute?.source ?: h.type ?: "SIGMET", Engine.sigmetHazard(h.hazard, h.type).getOrNull(), h.onRoute)
            } + briefing.gairmets.orEmpty().map { g ->
                item("G-AIRMET", Engine.gairmetTitle(g.hazard, g.severity).getOrNull(), g.onRoute)
            } + briefing.tfrs.orEmpty().map { t ->
                item("TFR", listOfNotNull(t.notamId, t.title).joinToString(" "), t.onRoute, crosses = t.crosses)
            } + briefing.pireps.orEmpty().map { p ->
                item("PIREP", Engine.pirepConditions(p.turbulence, p.icing).getOrNull(), p.onRoute, issued = p.onRoute?.issued ?: p.observedAt, urgent = p.urgent == true)
            }
            if (advisories.isEmpty()) return NONE
            return Engine.gonogoAdverseRows(advisories).getOrDefault(NONE)
        }
    }
}
