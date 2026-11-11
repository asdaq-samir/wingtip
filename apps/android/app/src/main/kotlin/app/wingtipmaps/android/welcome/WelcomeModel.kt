package app.wingtipmaps.android.welcome

import androidx.lifecycle.ViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

/**
 * The welcome's one model: which page is up, and what the pilot has said
 * so far -- the airplane (none, the default: no airplane is ever assumed,
 * decision 0011) and the home airport (optional). Each page can be
 * skipped; finished or skipped, the welcome is marked seen (WelcomeMemory)
 * and what was said is handed back as an Outcome for the screen to apply
 * to the plan and the flight's choices. The flight rules page sets the
 * existing preference at once (FlightChoices), so it is not held here.
 */
class WelcomeModel(private val memory: WelcomeMemory) : ViewModel() {
    /** The pages, in order. The two permission pages are there only where
     *  the system would ask: location not yet allowed, notifications on
     *  Android 13 and later and not yet allowed. The microphone is never
     *  asked here; it is asked where the ATC copilot is turned on. */
    enum class Step { AIRPLANE, HOME, RULES, LOCATION, NOTIFICATIONS, FINISH }

    data class State(
        val steps: List<Step> = steps(askLocation = true, askNotifications = true),
        val index: Int = 0,
        /** The planner's airplane type; "" for No Airplane, the default. */
        val airplane: String = "",
        val home: String? = null,
        /** Whether the last move was forward, for the page's slide. */
        val forward: Boolean = true,
    ) {
        val step: Step get() = steps[index]
    }

    /** How the welcome ended: skipped, the sample flight opened, or the
     *  pilot's own flight to plan (the first flight's "Where to?"). */
    enum class Ending { SKIPPED, SAMPLE, OWN }

    data class Outcome(val airplane: String, val home: String?, val ending: Ending) {
        /** The route to plan: the sample's for Open Sample Flight, else none. */
        val route: Route? get() = if (ending == Ending.SAMPLE) SAMPLE else null
    }

    data class Route(val dep: String, val dest: String, val stops: List<String>)

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()

    /** Whether the welcome is to be shown: never seen, or reset in Setup. */
    val seen: StateFlow<Boolean> = memory.seen

    /** The welcome opened at its first page, with the airplane and home
     *  airport already chosen, if any, and the pages this phone needs. */
    fun open(airplane: String, home: String?, steps: List<Step>) {
        _state.value = State(steps = steps, airplane = airplane, home = home)
    }

    fun pickAirplane(name: String) = _state.update { it.copy(airplane = name) }

    fun pickHome(ident: String?) = _state.update { it.copy(home = ident?.trim()?.uppercase()?.ifEmpty { null }) }

    /** The next page; nothing past the last. */
    fun next() = _state.update { if (it.index < it.steps.lastIndex) it.copy(index = it.index + 1, forward = true) else it }

    /** The page before; false at the first, where Back closes the welcome. */
    fun back(): Boolean {
        val s = _state.value
        if (s.index == 0) return false
        _state.value = s.copy(index = s.index - 1, forward = false)
        return true
    }

    /** Skip, from any page: what was said so far is kept, nothing more is
     *  asked, and the welcome is not shown again. */
    fun skip(): Outcome = end(Ending.SKIPPED)

    /** Open Sample Flight, or Plan My Own. */
    fun finish(sample: Boolean): Outcome = end(if (sample) Ending.SAMPLE else Ending.OWN)

    private fun end(ending: Ending): Outcome {
        memory.markSeen()
        val s = _state.value
        return Outcome(airplane = s.airplane, home = s.home, ending = ending)
    }

    companion object {
        /** The sample flight, the same on every platform: Madison to
         *  Oshkosh, no stops, a short leg across Wisconsin a pilot can read
         *  the whole strip of. */
        val SAMPLE = Route(dep = "KMSN", dest = "KOSH", stops = emptyList())

        fun steps(askLocation: Boolean, askNotifications: Boolean): List<Step> = buildList {
            add(Step.AIRPLANE)
            add(Step.HOME)
            add(Step.RULES)
            if (askLocation) add(Step.LOCATION)
            if (askNotifications) add(Step.NOTIFICATIONS)
            add(Step.FINISH)
        }
    }
}
