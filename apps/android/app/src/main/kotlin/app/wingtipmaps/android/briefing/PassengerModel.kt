package app.wingtipmaps.android.briefing

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import app.wingtipmaps.android.AppClock
import app.wingtipmaps.android.Kept
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.api.Planner
import app.wingtipmaps.android.checklist.PreferencesStore
import app.wingtipmaps.android.strip.StripData
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * The passenger briefing's state for the planned flight: the items
 * ticked, and what the planner says of the destination (its name and its
 * weather now) for the message. The ticks are kept on the phone for the
 * flight (PassengerTicks); a new route starts them afresh.
 */
@HiltViewModel
class PassengerModel @Inject constructor(app: Application) : AndroidViewModel(app) {
    data class State(
        val flight: String = "",
        val ticked: Set<String> = emptySet(),
        val destName: String? = null,
        val weather: String? = null,
        /** When the message says the flight leaves: when the briefing was
         *  opened, as this app's plan has no departure time of its own
         *  and leaves at the planner's now (the strip's leaveMs). */
        val departMs: Long = AppClock.nowMs(),
        /** The briefing's items, the engine's; none where it failed. */
        val items: List<PassengerItem> = PassengerBriefing.ITEMS.getOrDefault(emptyList()),
        /** Why there are no items: the engine's words where its
         *  `passenger_briefing` failed. */
        val problem: String? = PassengerBriefing.ITEMS.exceptionOrNull()?.let { "The briefing's items could not be had: ${it.message}" },
    )

    private val ticks = PassengerTicks(PreferencesStore(Kept.of(app, "passengers")))

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()

    /** The briefing for the plan's flight, its destination asked of the
     *  planner; with no connection the message goes without it. */
    fun show(plan: Plan.State) {
        val flight = if (plan.routed) StripData.routeName(plan.dep, plan.dest, plan.stops) else ""
        _state.value = State(flight = flight, ticked = if (flight.isEmpty()) emptySet() else ticks.ticked(flight))
        if (!plan.routed) return
        viewModelScope.launch {
            try {
                val place = Planner.place(plan.dest)
                val metar = place.metar
                _state.update {
                    it.copy(
                        destName = place.name,
                        weather = metar?.let { m -> PassengerBriefing.weatherWords(m.flightCategory, m.ceilingFt, m.visibilitySm) },
                    )
                }
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
            }
        }
    }

    fun tick(key: String) {
        val s = _state.value
        val ticked = if (key in s.ticked) s.ticked - key else s.ticked + key
        if (s.flight.isNotEmpty()) ticks.save(s.flight, ticked)
        _state.update { it.copy(ticked = ticked) }
    }

    /** The message for the planned flight, null with no route. */
    fun message(plan: Plan.State, s: State = _state.value): String? {
        if (!plan.routed) return null
        return PassengerBriefing.message(plan.dep, plan.dest, s.destName, s.departMs, plan.totals?.eteMin, s.weather)
    }
}
