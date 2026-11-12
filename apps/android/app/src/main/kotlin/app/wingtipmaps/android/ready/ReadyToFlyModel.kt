package app.wingtipmaps.android.ready

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.wingtipmaps.android.AppClock
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.api.AirportPlace
import app.wingtipmaps.android.api.Planner
import app.wingtipmaps.android.api.Problems
import app.wingtipmaps.android.api.generated.NotamsRanked
import app.wingtipmaps.android.api.generated.NotamsRankedAsk
import app.wingtipmaps.android.api.notamsRanked
import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.engine.generated.readyToFly
import app.wingtipmaps.android.offline.KeptForAir
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** The planner's weather and NOTAMs, as Ready to fly fetches them: a
 *  seam, so the model is tested with no network. */
interface ReadyWeather {
    /** A field's card's weather; null where it could not be had. */
    suspend fun field(ident: String, role: String): ReadyFacts.FieldWeather?

    /** The flight's NOTAMs, the top ones' text as sent, with when they
     *  were fetched: the kept ones' time where the network failed. */
    suspend fun notams(plan: Plan.State, cruiseFt: Double?): KeptForAir.Had<List<String>>
}

/** The planner's, each answer kept for the air as it comes and the kept
 *  one given back where the network fails (KeptForAir): the field's card
 *  is the same one a field's card keeps. */
object PlannerReadyWeather : ReadyWeather {
    override suspend fun field(ident: String, role: String) =
        ReadyFacts.fieldWeather(ident, role, KeptForAir.had(KeptForAir.AIRPORTS, ident, AirportPlace.serializer()) { Planner.place(ident) }.value)

    override suspend fun notams(plan: Plan.State, cruiseFt: Double?): KeptForAir.Had<List<String>> {
        val had = KeptForAir.had(KeptForAir.NOTAMS, ReadyFacts.flightKey(plan), NotamsRanked.serializer()) { Planner.notamsRanked(ask(plan, cruiseFt)) }
        return KeptForAir.Had(had.value.notams.filter { it.top }.map { it.raw }, had.fetchedAtMs, had.kept)
    }

    /** The ranking's question for the route (Keep for the Air asks the same). */
    fun ask(plan: Plan.State, cruiseFt: Double?) =
        NotamsRankedAsk(altitudeFt = cruiseFt, dep = plan.dep, dest = plan.dest, stops = plan.stops.ifEmpty { null })
}

/**
 * Ready to fly's one view model (the web's features/readyToFly): the
 * facts gathered (ReadyFacts, ReadyDevice) and asked of the engine's
 * ready_to_fly, whose answer the views draw as it is -- the line, at most
 * three actions, every item with its source, the next cycle. The fields'
 * weather and the route's NOTAMs are fetched here, and kept with when
 * they came, since their age is a fact the engine weighs.
 */
class ReadyToFlyModel(
    private val rule: (EngineContract.ReadyToFlyInput) -> Result<EngineContract.ReadyToFlyAnswer> = ::askEngine,
    private val weather: ReadyWeather = PlannerReadyWeather,
    private val nowMs: () -> Long = AppClock::nowMs,
) : ViewModel() {
    // TODO(claude/android-data-stock): @HiltViewModel with an @Inject
    // constructor once the sources and seams it is given are injectable
    // (Hilt, 2026-11-12); until then Hilt's factory hands it to the default one.
    data class State(
        val answer: EngineContract.ReadyToFlyAnswer? = null,
        /** The top NOTAMs as sent, once fetched, shown under their item. */
        val notams: List<String> = emptyList(),
        /** When the NOTAMs shown were fetched, where they are the ones kept
         *  for the air; null when they are the network's own. */
        val notamsKeptAtMs: Long? = null,
        /** The fixes under way, by name, so a row shows it is working. */
        val busy: Set<String> = emptySet(),
        val problem: String? = null,
    ) {
        /** Something to fix: the engine's caution, never a stop. */
        val caution: Boolean get() = answer?.finding == "caution"
    }

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()

    private var plan: Plan.State = Plan.State()
    private var cruiseFt: Double? = null
    private var local = ReadyFacts.Local()
    private var fields: List<ReadyFacts.FieldWeather> = emptyList()
    private var fieldsFor: String? = null
    private var notamsAtMs: Long? = null
    private var notamsFor: String? = null

    /** The facts as they are now, asked again; the fields' weather fetched
     *  the first time a route is seen. */
    fun check(plan: Plan.State, cruiseFt: Double?, local: ReadyFacts.Local) {
        this.plan = plan
        this.cruiseFt = cruiseFt
        this.local = local
        val key = ReadyFacts.flightKey(plan)
        if (key != fieldsFor) {
            fields = emptyList()
            fieldsFor = key
            fetchFields()
        }
        // NOTAMs of another route are not this route's.
        if (key != notamsFor) {
            notamsAtMs = null
            _state.update { it.copy(notams = emptyList(), notamsKeptAtMs = null) }
        }
        ask()
    }

    /** The answer from the facts held, the engine's, or why it failed. */
    private fun ask() {
        val input = ReadyFacts.input(nowMs(), plan, cruiseFt, local, if (plan.routed) fields else emptyList(), notamsAtMs)
        rule(input).fold(
            { answer -> _state.update { it.copy(answer = answer, problem = null) } },
            { why -> _state.update { it.copy(problem = "Ready to fly could not be worked out: ${why.message}") } },
        )
    }

    /** The departure's and destination's METAR and TAF, fetched again (the
     *  Refresh weather fix, with the Brief's own refresh). */
    fun fetchFields() {
        val wanted = ReadyFacts.fieldRoles(plan)
        if (wanted.isEmpty()) return
        val key = ReadyFacts.flightKey(plan)
        busy("refresh_weather", true)
        viewModelScope.launch {
            val got = wanted.mapNotNull { (ident, role) ->
                try {
                    weather.field(ident, role)
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    // No signal: the field's last weather stands, else it is
                    // left out rather than said not to report.
                    fields.firstOrNull { it.ident == ident }
                }
            }
            if (key == ReadyFacts.flightKey(plan)) fields = got
            busy("refresh_weather", false)
            ask()
        }
    }

    /** The route's NOTAMs fetched (the Get NOTAMs fix): the time kept, and
     *  the top ones' text shown under the item. */
    fun fetchNotams() {
        if (!plan.routed) return
        val asked = plan
        busy("fetch_notams", true)
        viewModelScope.launch {
            try {
                val top = weather.notams(asked, cruiseFt)
                if (ReadyFacts.flightKey(asked) == ReadyFacts.flightKey(plan)) {
                    notamsAtMs = top.fetchedAtMs
                    notamsFor = ReadyFacts.flightKey(asked)
                    _state.update { it.copy(notams = top.value, notamsKeptAtMs = top.fetchedAtMs.takeIf { top.kept }) }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.update { it.copy(problem = Problems.say("The NOTAMs could not be fetched", e)) }
                busy("fetch_notams", false)
                return@launch
            }
            busy("fetch_notams", false)
            ask()
        }
    }

    /** A fix done elsewhere has started or ended (a download, the packs). */
    fun busy(fix: String, on: Boolean) = _state.update { it.copy(busy = if (on) it.busy + fix else it.busy - fix) }

    companion object {
        /** ready_to_fly by name, through the generated call. */
        fun askEngine(input: EngineContract.ReadyToFlyInput): Result<EngineContract.ReadyToFlyAnswer> = Engine.readyToFly(
            now = input.now, plan = input.plan, charts = input.charts, packs = input.packs, briefing = input.briefing,
            fields = input.fields, notams = input.notams, kept = input.kept, device = input.device, receiver = input.receiver,
        )
    }
}
