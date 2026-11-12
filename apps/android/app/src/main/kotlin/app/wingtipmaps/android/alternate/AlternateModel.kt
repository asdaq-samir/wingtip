package app.wingtipmaps.android.alternate

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.wingtipmaps.android.AppClock
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.api.Planner
import app.wingtipmaps.android.api.Problems
import app.wingtipmaps.android.api.alternate
import app.wingtipmaps.android.api.generated.AlternateCheck
import app.wingtipmaps.android.api.generated.Alternates
import app.wingtipmaps.android.api.generated.client.apis.PlannerApi
import app.wingtipmaps.android.api.planned
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject
import kotlin.time.Clock

/**
 * The Brief's Alternate under IFR (the web's useAlternate): the planner's
 * GET /api/alternate for the destination at the nav log's ETA, flown on
 * at the picked airplane's cruise -- whether the destination needs an
 * alternate by 14 CFR 91.169(b)'s "1-2-3", the one filed checked at its
 * minimums for the ETA there (91.169(c)), and the nearest fields that
 * will do -- every rule the engine's (ifr_alternate_window,
 * ifr_alternate_destination, ifr_alternate_check), asked by the planner.
 * Nothing is asked without an airplane: no ETA, and no stock airplane's
 * speed to reach an alternate at (decision 0011).
 */
@HiltViewModel
class AlternateModel(
    private val ask: suspend (dest: String, eta: String, tasKt: Double, filed: String?) -> Alternates = { d, e, t, f -> Planner.alternate(d, e, t, f) },
    private val nowMs: () -> Long = AppClock::nowMs,
) : ViewModel() {
    /** Hilt's: the planner's alternates (GET /api/alternate) and the app's clock. */
    @Inject
    constructor(planner: PlannerApi, clock: Clock) : this(
        { d, e, t, f -> planner.alternate(d, e, t, f?.ifEmpty { null }).planned() },
        { clock.now().toEpochMilliseconds() },
    )
    /** What the plan gives the check: the destination, the nav log's time
     *  en route, when it leaves (null for now), the cruise, the one filed. */
    data class Where(val dest: String, val eteMin: Double?, val depart: String?, val tasKt: Double?, val filed: String?)

    data class State(
        val where: Where? = null,
        val answer: Alternates? = null,
        val loading: Boolean = false,
        val problem: String? = null,
    ) {
        /** Not asked: no ETA yet, so nothing to check against (the web's
         *  "Checked once the nav log has an ETA"). */
        val waiting: Boolean get() = where != null && (where.eteMin == null || where.tasKt == null)
    }

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()
    private var asking: Job? = null

    /** The plan's alternate checked, once for each plan; nothing again for
     *  the same one, and nothing under VFR (`where` null). */
    fun check(where: Where?) {
        if (where == _state.value.where && (_state.value.answer != null || _state.value.loading)) return
        asking?.cancel()
        val eta = where?.let { eta(it) }
        if (where == null || eta == null || where.tasKt == null) {
            _state.value = State(where = where)
            return
        }
        _state.value = State(where = where, loading = true)
        asking = viewModelScope.launch {
            _state.value = try {
                State(where = where, answer = ask(where.dest, eta, where.tasKt, where.filed))
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                State(where = where, problem = Problems.say("The alternate could not be checked", e))
            }
        }
    }

    /** The ETA at the destination, an ISO 8601 instant: the departure (now
     *  where none is set) and the nav log's time en route after it. */
    fun eta(where: Where): String? = PlanAlternate.landsAt(where.depart, where.eteMin, nowMs())

    companion object {
        /** The plan's Where under IFR, else null. */
        fun where(plan: Plan.State, tasKt: Double?, filed: PlanAlternate.Filed?): Where? =
            if (plan.rules != "ifr" || !plan.routed) null
            else Where(plan.dest, plan.totals?.eteMin, plan.depart, tasKt, PlanAlternate.of(plan.rules, plan.dest, filed))

        /** How an alternate stands against its minimums at the ETA there,
         *  as the web's AlternateSection says it: "Meets 600-2", "Under its
         *  minimums", "Check it" where the pilot has to look (91.169(c)). */
        fun standing(check: AlternateCheck): String = when (check.good) {
            true -> check.minimums?.let { "Meets ${Math.round(it.ceilingFt)}-${it.visibilitySm.let { v -> if (v % 1.0 == 0.0) v.toInt().toString() else v.toString() }}" } ?: "Meets its minimums"
            false -> "Under its minimums"
            null -> "Check it"
        }
    }
}
