package app.wingtipmaps.android.offline

import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.api.AirportPlace
import app.wingtipmaps.android.api.Gateway
import app.wingtipmaps.android.api.Planner
import app.wingtipmaps.android.api.airportNotams
import app.wingtipmaps.android.api.generated.GoNoGo
import app.wingtipmaps.android.api.generated.NotamsRanked
import app.wingtipmaps.android.api.generated.RouteProfile
import app.wingtipmaps.android.api.notamsRanked
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.map.LoopKind
import app.wingtipmaps.android.map.WeatherLoop
import app.wingtipmaps.android.ready.PlannerReadyWeather
import app.wingtipmaps.android.ready.ReadyFacts
import app.wingtipmaps.android.ui.BriefModel
import app.wingtipmaps.android.ui.DiagramPage
import kotlinx.coroutines.CancellationException
import app.wingtipmaps.android.api.generated.WeatherLoop as LoopAnswer

/**
 * Keep for the Air, beside the charts and the cycle packs: everything
 * else the route needs with no signal, fetched in one tap and kept
 * (KeptForAir) -- each field's card (its METAR and TAF, frequencies and
 * runways), its FAA diagram and its own NOTAMs (under the key the card
 * reads), the route's ranked NOTAMs, its side view, the Brief's Go /
 * No-Go, and the weather loop's frames with the newest frame's tiles over
 * the route (KeptLoopTiles, within its size cap). The plan and its nav log are kept
 * by the plan itself (KeptPlan). Ready to fly counts them on board
 * (`status`, its `kept`), and their ages are the engine's (kept_age).
 *
 * Under IFR the alternate filed is one of the fields (PlanAlternate, the
 * nav log's leg on to it). The approach plates this phone lays on the
 * map (PlatesOnMap) are asked for as they are put there, not kept for the
 * air, so none is asked or counted here.
 */
object KeepForAir {
    /** What a diagram is about, for the size said before it is kept: a
     *  third of a megabyte, as the web's keepRoute measured the FAA's. */
    private const val DIAGRAM_BYTES = 350_000L
    /** The answers' JSON for a route, about: the cards, NOTAMs, Go / No-Go
     *  and frames together. */
    private const val ANSWERS_BYTES = 150_000L
    /** The loop's newest frame over a route, about: a few hundred small tiles. */
    private const val LOOP_TILES_BYTES = 3_000_000L
    /** The box round the route a tenth of a degree (6 nm) out, as the
     *  charts and the cycle packs are kept (KeepForAirModel). */
    private const val PAD_DEG = 0.1

    /** The route's fields and its alternate (its places by position are not fields). */
    fun fields(plan: Plan.State): List<String> =
        (listOf(plan.dep) + plan.stops + plan.dest + listOfNotNull(plan.totals?.alternate?.ident)).filter { it.isNotBlank() && !it.startsWith("@") }.distinct()

    /** The loop the map plays, else the radar's. */
    private fun loopKind(loop: LoopKind): LoopKind = if (loop == LoopKind.OFF) LoopKind.RADAR else loop

    /** Everything fetched and kept for `plan`; how many could not be had
     *  (each kept one stands where the network failed). Run off the main
     *  thread: the diagrams are written as they come. */
    suspend fun keep(store: KeptForAir, plan: Plan.State, cruiseFt: Double?, loop: LoopKind): Int {
        if (!plan.routed) return 0
        val key = ReadyFacts.flightKey(plan)
        var failed = 0
        suspend fun quietly(work: suspend () -> Unit) {
            try {
                work()
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                failed++
            }
        }
        for (ident in fields(plan)) {
            quietly {
                val place = store.orKept(KeptForAir.AIRPORTS, ident, AirportPlace.serializer()) { Planner.place(ident) }.value
                place.airportDiagramUrl?.let { url ->
                    val pdf = store.pdf(KeptForAir.AIRPORTS, url)
                    if (!pdf.isFile) DiagramPage.download(url, pdf)
                }
            }
            quietly { store.orKept(KeptForAir.NOTAMS, KeptForAir.fieldNotams(ident), NotamsRanked.serializer()) { Planner.airportNotams(ident) } }
        }
        quietly { store.orKept(KeptForAir.NOTAMS, key, NotamsRanked.serializer()) { Planner.notamsRanked(PlannerReadyWeather.ask(plan, cruiseFt)) } }
        quietly { store.orKept(KeptForAir.GO_NO_GO, key, GoNoGo.serializer()) { Planner.goNoGo(BriefModel.ask(plan)) } }
        quietly { store.orKept(KeptForAir.ROUTE_PROFILE, key, RouteProfile.serializer()) { Planner.routeProfile(plan.dep, plan.dest, plan.stops) } }
        val kind = loopKind(loop)
        quietly {
            val frames = store.orKept(KeptForAir.WEATHER_LOOP, kind.kind, LoopAnswer.serializer()) { WeatherLoop.fetch(kind) }
            // The newest frame's tiles over the route, where the list is the
            // network's own (a kept list's tiles may be gone from its server).
            val newest = frames.value.frames.lastOrNull()
            val line = plan.course?.courseLine.orEmpty().filter { it.size == 2 }
            if (!frames.kept && newest != null && line.isNotEmpty()) {
                Gateway.loopTiles.keep(
                    Gateway.client, newest,
                    line.minOf { it[0] } - PAD_DEG, line.minOf { it[1] } - PAD_DEG, line.maxOf { it[0] } + PAD_DEG, line.maxOf { it[1] } + PAD_DEG,
                )
            }
        }
        return failed
    }

    /** What the route's kept answers and diagrams take on the phone, bytes. */
    fun bytes(store: KeptForAir, plan: Plan.State): Long {
        val key = ReadyFacts.flightKey(plan)
        val fields = fields(plan)
        val diagrams = fields.mapNotNull { ident ->
            store.read(KeptForAir.AIRPORTS, ident)?.let { runCatching { KeptForAir.JSON.decodeFromString(AirportPlace.serializer(), it.body) }.getOrNull() }
        }.mapNotNull { it.airportDiagramUrl }
        return store.bytes(KeptForAir.AIRPORTS, fields) +
            diagrams.sumOf { store.pdf(KeptForAir.AIRPORTS, it).length() } +
            store.bytes(KeptForAir.NOTAMS, listOf(key) + fields.map(KeptForAir::fieldNotams)) + store.bytes(KeptForAir.GO_NO_GO, listOf(key)) +
            store.bytes(KeptForAir.ROUTE_PROFILE, listOf(key)) +
            store.bytes(KeptForAir.WEATHER_LOOP, LoopKind.entries.map { it.kind }) + loopTilesBytes()
    }

    /** The loop's kept tiles, none where the app's store is not made (a
     *  JVM test). */
    private fun loopTilesBytes(): Long = runCatching { Gateway.loopTiles.bytes() }.getOrDefault(0L)

    /**
     * What is on the phone for `plan`, as ready_to_fly's `kept` reads it:
     * the kinds on board and those not yet, and the size -- what they take
     * once all are kept, else what the download is about. `planSaved` is
     * the plan's own (Plan.saved).
     */
    fun status(store: KeptForAir, plan: Plan.State, planSaved: Boolean): EngineContract.ReadyToFlyInputKept {
        val key = ReadyFacts.flightKey(plan)
        val fields = fields(plan)
        val cards = fields.map { ident ->
            store.read(KeptForAir.AIRPORTS, ident)?.let { runCatching { KeptForAir.JSON.decodeFromString(AirportPlace.serializer(), it.body) }.getOrNull() }
        }
        val diagrams = cards.mapNotNull { it?.airportDiagramUrl }
        val cardsKept = cards.all { it != null }
        val have = linkedMapOf(
            KeptForAir.WEATHER to cardsKept,
            KeptForAir.NOTAMS to (store.read(KeptForAir.NOTAMS, key) != null),
            KeptForAir.AIRPORTS to (cardsKept && diagrams.all { store.pdf(KeptForAir.AIRPORTS, it).isFile }),
            KeptForAir.PLAN to planSaved,
            KeptForAir.GO_NO_GO to (store.read(KeptForAir.GO_NO_GO, key) != null),
            KeptForAir.WEATHER_LOOP to LoopKind.entries.any { it != LoopKind.OFF && store.read(KeptForAir.WEATHER_LOOP, it.kind) != null },
        )
        val missing = have.filterValues { !it }.keys.toList()
        val onDisk = bytes(store, plan)
        val size = if (missing.isEmpty()) onDisk else maxOf(onDisk, fields.size * DIAGRAM_BYTES + ANSWERS_BYTES + LOOP_TILES_BYTES)
        return EngineContract.ReadyToFlyInputKept(
            onBoard = have.filterValues { it }.keys.toList(),
            missing = missing,
            sizeMb = size / 1e6,
        )
    }
}
