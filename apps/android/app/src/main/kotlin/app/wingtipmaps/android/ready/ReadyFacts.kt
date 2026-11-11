package app.wingtipmaps.android.ready

import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.api.AirportPlace
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.offline.OfflineKept
import app.wingtipmaps.android.offline.OfflineStore
import java.time.Instant

/**
 * The facts ready_to_fly is asked with, put together from what the app
 * holds: the plan, what is kept on the phone, how old the weather and the
 * NOTAMs are, and what the phone says of itself. Only facts: what counts
 * as ready, how old is too old, the words and which three come first are
 * the engine's (engine/crates/weather/src/ready.rs), never this file's.
 * Kept apart from Android so it is tested on the JVM.
 */
object ReadyFacts {
    /** What the phone itself holds and says, read by ReadyDevice: each
     *  null where the app cannot tell, which leaves its item out. */
    data class Local(
        val charts: EngineContract.ReadyToFlyInputCharts? = null,
        val packs: EngineContract.ReadyToFlyInputPacks? = null,
        /** When the Brief's Go / No-Go last came in (BriefModel). */
        val briefAtMs: Long? = null,
        val device: EngineContract.ReadyToFlyInputDevice? = null,
        val receiver: EngineContract.ReadyToFlyInputReceiver? = null,
        /** What Keep for the Air holds for the route (KeepForAir.status). */
        val kept: EngineContract.ReadyToFlyInputKept? = null,
    )

    /** A field's weather as the planner's card gave it: the METAR's
     *  observed time (Unix seconds) and whether a TAF came with it. */
    data class FieldWeather(val ident: String, val role: String, val metarObservedS: Double?, val taf: Boolean)

    /** The engine's input. The airplane is the plan's own or none, never
     *  one assumed (decision 0011); the altitude is the cruise the
     *  planner's nav log flies, none until it has one. */
    fun input(
        nowMs: Long,
        plan: Plan.State,
        cruiseFt: Double?,
        local: Local,
        fields: List<FieldWeather>,
        notamsAtMs: Long?,
    ): EngineContract.ReadyToFlyInput = EngineContract.ReadyToFlyInput(
        now = (nowMs / 1000).toDouble(),
        plan = EngineContract.ReadyToFlyInputPlan(
            route = plan.routed,
            airplane = plan.aircraft.ifEmpty { null }?.uppercase(),
            altitudeFt = cruiseFt,
        ),
        charts = local.charts,
        packs = local.packs,
        briefing = EngineContract.ReadyToFlyInputBriefing(fetchedAt = local.briefAtMs?.let { (it / 1000).toDouble() }),
        fields = fields.map { EngineContract.ReadyToFlyInputFieldsItem(ident = it.ident, role = it.role, metarObserved = it.metarObservedS, taf = it.taf) },
        notams = EngineContract.ReadyToFlyInputNotams(fetchedAt = notamsAtMs?.let { (it / 1000).toDouble() }),
        kept = if (plan.routed) local.kept else null,
        device = local.device,
        receiver = local.receiver,
    )

    /** The cruise altitude: the highest the nav log's legs fly, which is
     *  the altitude the planner picked for the route; none before a leg. */
    fun cruise(altitudes: List<Double>): Double? = altitudes.maxOrNull()

    /** The fields whose weather is asked: the departure, the destination
     *  and under IFR the alternate the nav log flies on to (PlanAlternate),
     *  by the roles ready_to_fly reads, as the web's readyFacts sends them. */
    fun fieldRoles(plan: Plan.State): List<Pair<String, String>> =
        if (!plan.routed) emptyList()
        else (listOf(plan.dep to "departure", plan.dest to "destination") + listOfNotNull(plan.totals?.alternate?.ident?.let { it to "alternate" })).distinctBy { it.first }

    /** A field's weather from the planner's card: none where the weather
     *  service could not be asked, since that is not the same as a field
     *  that does not report. */
    fun fieldWeather(ident: String, role: String, place: AirportPlace): FieldWeather? {
        if (place.weatherUnavailable == true) return null
        val observed = place.metar?.observedAt?.let { runCatching { Instant.parse(it).epochSecond.toDouble() }.getOrNull() }
        return FieldWeather(ident, role, observed, taf = !place.taf.isNullOrBlank())
    }

    /**
     * The route's charts on the phone: the newest cycle whose whole
     * regions (Setup → Downloads) take in every point along the route,
     * and that cycle's effective date as the engine reads an edition
     * ("10-29-2026" kept as "2026-10-29"). Not kept where no cycle covers
     * it all. Null with no route line, which leaves the item out.
     */
    fun charts(kept: List<OfflineKept>, points: List<Pair<Double, Double>>): EngineContract.ReadyToFlyInputCharts? {
        if (points.isEmpty()) return null
        val covering = kept.filter { it.complete }.groupBy { it.cycle }
            .filter { (_, regions) -> points.all { (lat, lon) -> regions.any { r -> r.boxes.any { inside(it, lat, lon) } } } }
            .keys.maxByOrNull(OfflineStore::sortable)
        return EngineContract.ReadyToFlyInputCharts(kept = covering != null, canKeep = true, edition = covering?.let(OfflineStore::sortable))
    }

    /** A region's box is [west, south, east, north], as the planner cuts it. */
    private fun inside(box: List<Double>, lat: Double, lon: Double): Boolean =
        box.size == 4 && lon >= box[0] && lon <= box[2] && lat >= box[1] && lat <= box[3]

    /** The route's ident, for "once per flight": a new route is a new flight. */
    fun flightKey(plan: Plan.State): String = listOf(plan.dep, plan.stops.joinToString(","), plan.dest).joinToString("|")
}
