package app.wingtipmaps.android.altitude

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.api.Leg
import app.wingtipmaps.android.api.Planner
import app.wingtipmaps.android.api.Problems
import app.wingtipmaps.android.api.generated.RouteProfile
import app.wingtipmaps.android.dryrun.DryRunRows
import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.generated.planProfile
import app.wingtipmaps.android.offline.KeptForAir
import app.wingtipmaps.android.ready.ReadyFacts
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
 * The Profile card's view model: the route's side view from the planner
 * (/api/route-profile, the web's and the iPhone's, kept on the phone for
 * the next launch and the air), the plan's altitude
 * line over it from the engine (`plan_profile`, from the nav log's rows),
 * the legal altitudes the slider steps through (the planner's, by 14 CFR
 * 91.159 or 91.179), and the altitude previewed on the slider, which
 * changes nothing until Set. The clearance at a previewed altitude is the
 * engine's (ProfileClearance). Nothing aviation is worked out here.
 */
@HiltViewModel
class ProfileModel @Inject constructor() : ViewModel() {
    data class State(
        val profile: RouteProfile? = null,
        val problem: String? = null,
        /** The altitude previewed on the slider, feet MSL; null for the plan's. */
        val previewFt: Double? = null,
    )

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()

    private var loaded: List<String>? = null
    private var loading: Job? = null

    /** The side view for the route, fetched once per route. */
    fun load(plan: Plan.State) {
        val key = listOf(plan.dep) + plan.stops + plan.dest
        if (!plan.routed || key == loaded) return
        loaded = key
        loading?.cancel()
        loading = viewModelScope.launch {
            try {
                // Kept as it comes, and the kept one with no signal, across a
                // relaunch too (KeptForAir; Keep for the Air keeps it as well).
                val had = KeptForAir.had(KeptForAir.ROUTE_PROFILE, ReadyFacts.flightKey(plan), RouteProfile.serializer()) {
                    Planner.routeProfile(plan.dep, plan.dest, plan.stops)
                }
                _state.update { it.copy(profile = had.value, problem = null) }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                loaded = null
                _state.update { it.copy(problem = Problems.say("The route's side view could not be fetched", e)) }
            }
        }
    }

    /** The slider moved: the clearance previewed there, the plan unchanged. */
    fun preview(ft: Double?) = _state.update { it.copy(previewFt = ft) }

    companion object {
        /** The plan's line along the route, scaled onto the side view's
         *  length (the legs' miles are checkpoint to checkpoint, the side
         *  view's the straight route's, as the web's ProfileChart lays them). */
        fun line(plan: Plan.State, lengthNm: Double): List<Pair<Double, Double>> {
            val course = plan.course ?: return emptyList()
            val rows = DryRunRows.of(course, plan.legs) ?: return emptyList()
            val answer = Engine.planProfile(rows).getOrNull() ?: return emptyList()
            val scale = if (answer.lengthNm > 0) lengthNm / answer.lengthNm else 1.0
            return answer.points.map { it.alongNm * scale to it.planFt }
        }

        /** The route's waypoints along the side view: the departure, then
         *  each leg's end, at the legs' miles scaled onto its length. */
        fun waypoints(plan: Plan.State, lengthNm: Double): List<Waypoint> {
            if (plan.legs.isEmpty()) return emptyList()
            val total = plan.legs.sumOf { it.distanceNm }
            val scale = if (total > 0) lengthNm / total else 1.0
            var along = 0.0
            val out = mutableListOf(Waypoint(plan.legs.first().from, 0.0, plan.legs.first().altitudeFt, plan.legs.first()))
            for ((i, leg) in plan.legs.withIndex()) {
                along += leg.distanceNm
                out += Waypoint(leg.to, along * scale, leg.altitudeFt, plan.legs.getOrNull(i + 1) ?: leg)
            }
            return out
        }

        /** The altitudes the slider steps through, lowest first: the
         *  planner's legal ones for the route (each with its figures, the
         *  Advisor's rows), and the one flown where it is not among them. */
        fun steps(line: PlanAltitudes.State, flownFt: Double?): List<Double> {
            val legal = line.line?.altitudeFigures?.map { it.altitudeFt }
                ?: line.line?.altitudeSelection?.candidatesFt.orEmpty()
            return (legal + listOfNotNull(flownFt)).distinct().sorted()
        }

        /** The altitude the plan flies: the pilot's own, else the planner's. */
        fun flown(plan: Plan.State, line: PlanAltitudes.State): Double? =
            plan.altitudeFt ?: line.line?.altitudeFt ?: plan.legs.firstOrNull()?.altitudeFt
    }

    /** A waypoint on the side view: its ident, where along it, the
     *  altitude its leg in is flown at, and the leg a change there is
     *  flown on (the one out of it, else the one into it, as the iPhone's
     *  ProfileRules.change takes it): its ground speed, true airspeed,
     *  burn and air, the planner's. */
    data class Waypoint(val ident: String, val alongNm: Double, val legFt: Double, val leg: Leg? = null)
}
