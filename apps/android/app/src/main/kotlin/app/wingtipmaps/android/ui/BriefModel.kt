package app.wingtipmaps.android.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.wingtipmaps.android.AppClock
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.airplane.AirplaneNow
import app.wingtipmaps.android.airplane.FigureKey
import app.wingtipmaps.android.alternate.PlanAlternate
import app.wingtipmaps.android.api.Planner
import app.wingtipmaps.android.api.Problems
import app.wingtipmaps.android.api.generated.GoNoGo
import app.wingtipmaps.android.api.generated.GoNoGoAsk
import app.wingtipmaps.android.api.generated.VerdictItem
import app.wingtipmaps.android.offline.KeptForAir
import app.wingtipmaps.android.ready.ReadyFacts
import app.wingtipmaps.android.strip.Finding
import app.wingtipmaps.android.strip.GlanceAction
import app.wingtipmaps.android.strip.Verdict
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * The Brief's Go / No-Go for the route on the page: the planner's POST
 * /api/go-no-go (the planner plans and briefs the route and asks the
 * engine each finding, the web Brief's verdict), asked again whenever
 * the route's nav log is whole again. Its verdict heads the strip, and
 * at most three of its findings that need doing are the head's actions
 * (the web's BriefGlance, decision 0012: verdict first, three lines).
 */
@HiltViewModel
class BriefModel @Inject constructor() : ViewModel() {
    data class State(
        /** The route the brief is of, so a stale one is never shown. */
        val route: String? = null,
        val verdict: Verdict? = null,
        val items: List<VerdictItem> = emptyList(),
        val risk: String? = null,
        val loading: Boolean = false,
        val problem: String? = null,
        /** When this brief came in, for Ready to fly's weather age
         *  (ready_to_fly's briefing); null before one has. */
        val fetchedAtMs: Long? = null,
        /** When the brief shown was fetched, where it is the one kept for
         *  the air because the network failed; null when it is the
         *  network's own (KeptAgeLine). */
        val keptAtMs: Long? = null,
    ) {
        /** The findings to act on, worst first, at most three. */
        val actions: List<GlanceAction>
            get() = items.map { it to finding(it.finding) }
                .filter { (_, f) -> f == Finding.STOP || f == Finding.CAUTION }
                .sortedBy { (_, f) -> if (f == Finding.STOP) 0 else 1 }
                .take(3)
                .map { (item, f) -> GlanceAction(item.key, f, "${item.label}: ${item.detail}") }
    }

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()
    private var asking: Job? = null

    /** The route's brief, asked once its nav log is whole; nothing for a
     *  route not planned, and nothing again for the same route. */
    fun brief(plan: Plan.State) {
        if (!plan.routed || plan.totals == null || plan.planning) return
        val route = listOf(plan.dep, plan.stops.joinToString(","), plan.dest, plan.aircraft, AirplaneNow.given(plan.own), plan.holds.joinToString(","), plan.rules, PlanAlternate.of(plan.rules, plan.dest)).joinToString("|")
        if (route == _state.value.route && (_state.value.verdict != null || _state.value.loading)) return
        asking?.cancel()
        _state.value = State(route = route, loading = true)
        asking = viewModelScope.launch {
            try {
                // The last good one kept for the air, and given back with its
                // time where the network fails (KeptForAir).
                val had = KeptForAir.had(KeptForAir.GO_NO_GO, ReadyFacts.flightKey(plan), GoNoGo.serializer()) { Planner.goNoGo(ask(plan)) }
                _state.update { (it.copy(loading = false) + had.value).copy(fetchedAtMs = had.fetchedAtMs, keptAtMs = had.fetchedAtMs.takeIf { had.kept }) }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.update { it.copy(loading = false, problem = Problems.say("The brief could not be fetched", e)) }
            }
        }
    }

    /** The same route's brief asked again, from a pull on the Brief: the
     *  weather in it is live. */
    fun refresh(plan: Plan.State) {
        _state.update { it.copy(route = null) }
        brief(plan)
    }

    private operator fun State.plus(answer: GoNoGo) = copy(
        verdict = Verdict(finding(answer.line.finding), answer.line.words),
        items = answer.items,
        risk = answer.risk?.line,
        problem = null,
        fetchedAtMs = AppClock.nowMs(),
    )

    companion object {
        /** The Go / No-Go's question for the route: the pilot's own figures
         *  over the type's book, or the whole of an own airplane, never a
         *  stock one's, and under IFR the alternate filed (PlanAlternate).
         *  Keep for the Air asks the same (KeepForAir). */
        fun ask(plan: Plan.State): GoNoGoAsk {
            val g = AirplaneNow.given(plan.own)
            return GoNoGoAsk(
                dep = plan.dep, dest = plan.dest, stops = plan.stops.joinToString(",").ifEmpty { null },
                aircraft = AirplaneNow.plannerName(plan.aircraft, plan.own), holds = plan.holds.joinToString(",").ifEmpty { null },
                rules = plan.rules,
                // Under IFR, the alternate filed: its fuel in the plan, and
                // the planner's 91.169 finding of it in the weather's.
                alternate = PlanAlternate.of(plan.rules, plan.dest),
                cruiseTasKt = g[FigureKey.CRUISE.key], fuelBurnGph = g[FigureKey.BURN.key], cruisePowerPct = g[FigureKey.POWER.key],
                usableFuelGal = g[FigureKey.USABLE.key], climbTasKt = g[FigureKey.CLIMB_TAS.key], climbFuelBurnGph = g[FigureKey.CLIMB_BURN.key],
                climbRateFpm = g[FigureKey.CLIMB_RATE.key], serviceCeilingFt = g[FigureKey.CEILING.key], taxiFuelGal = g[FigureKey.TAXI.key],
                glideRatio = g[FigureKey.GLIDE.key],
            )
        }

        /** The planner's finding by name (lib/findings). */
        fun finding(name: String): Finding = when (name) {
            "ok" -> Finding.OK
            "caution" -> Finding.CAUTION
            "stop" -> Finding.STOP
            "pending" -> Finding.PENDING
            else -> Finding.UNKNOWN
        }
    }
}
