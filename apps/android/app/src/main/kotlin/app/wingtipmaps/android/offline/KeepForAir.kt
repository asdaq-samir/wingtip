package app.wingtipmaps.android.offline

import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.api.AirportPlace
import app.wingtipmaps.android.api.Planner
import app.wingtipmaps.android.api.generated.GoNoGo
import app.wingtipmaps.android.api.generated.NotamsRanked
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
 * runways) and its FAA diagram, the ranked NOTAMs, the Brief's Go /
 * No-Go and the weather loop's frames. The plan and its nav log are kept
 * by the plan itself (KeptPlan). Ready to fly counts them on board
 * (`status`, its `kept`), and their ages are the engine's (kept_age).
 *
 * This phone's plan has no alternate of its own and shows no approach
 * plates (only the airport diagram, with the airplane on it), so neither
 * is asked or counted here.
 */
object KeepForAir {
    /** What a diagram is about, for the size said before it is kept: a
     *  third of a megabyte, as the web's keepRoute measured the FAA's. */
    private const val DIAGRAM_BYTES = 350_000L
    /** The answers' JSON for a route, about: the cards, NOTAMs, Go / No-Go
     *  and frames together. */
    private const val ANSWERS_BYTES = 150_000L

    /** The route's fields (its places by position are not fields). */
    fun fields(plan: Plan.State): List<String> =
        (listOf(plan.dep) + plan.stops + plan.dest).filter { it.isNotBlank() && !it.startsWith("@") }.distinct()

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
        }
        quietly { store.orKept(KeptForAir.NOTAMS, key, NotamsRanked.serializer()) { Planner.notamsRanked(PlannerReadyWeather.ask(plan, cruiseFt)) } }
        quietly { store.orKept(KeptForAir.GO_NO_GO, key, GoNoGo.serializer()) { Planner.goNoGo(BriefModel.ask(plan)) } }
        val kind = loopKind(loop)
        quietly { store.orKept(KeptForAir.WEATHER_LOOP, kind.kind, LoopAnswer.serializer()) { WeatherLoop.fetch(kind) } }
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
            store.bytes(KeptForAir.NOTAMS, listOf(key)) + store.bytes(KeptForAir.GO_NO_GO, listOf(key)) +
            store.bytes(KeptForAir.WEATHER_LOOP, LoopKind.entries.map { it.kind })
    }

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
        val size = if (missing.isEmpty()) onDisk else maxOf(onDisk, fields.size * DIAGRAM_BYTES + ANSWERS_BYTES)
        return EngineContract.ReadyToFlyInputKept(
            onBoard = have.filterValues { it }.keys.toList(),
            missing = missing,
            sizeMb = size / 1e6,
        )
    }
}
