package app.wingtipmaps.android.clearance

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.wingtipmaps.android.api.generated.ClearanceAsk
import app.wingtipmaps.android.api.generated.ClearancePlaces
import app.wingtipmaps.android.atc.AtcListener
import app.wingtipmaps.android.atc.Heard
import app.wingtipmaps.android.engine.generated.EngineContract
import dagger.assisted.Assisted
import dagger.assisted.AssistedFactory
import dagger.assisted.AssistedInject
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * The clearance card's one view model (the web's ClearanceCard, the
 * iPhone's ClearanceSheet): the clearance's words, typed, read off a
 * photo of the pilot's note, or heard on the phone's own recognizer
 * (RadioListener, on the device only); read into its items by the
 * engine; its places found by the planner once the words stop changing;
 * the pilot's read back checked by the engine; the route cleared held
 * against the one filed. Nothing heard changes the plan before Enter the
 * Route, which hands the screen the route to plan (Entry).
 */
@HiltViewModel(assistedFactory = ClearanceModel.Factory::class)
class ClearanceModel(
    private val listener: AtcListener?,
    private val rules: ClearanceRules = EngineClearance,
    private val places: suspend (ClearanceAsk) -> ClearancePlaces = ClearancePlanner::places,
) : ViewModel() {
    /** Hilt's, the radio handed in by the page (none where this phone
     *  hears no speech): the engine's rules and the planner's places. */
    @AssistedInject
    constructor(@Assisted listener: AtcListener?, rules: ClearanceRules) : this(listener, rules, ClearancePlanner::places)

    @AssistedFactory
    interface Factory {
        fun create(listener: AtcListener?): ClearanceModel
    }

    /** The flight the clearance is for: its route as planned, and the
     *  points to look near ("lat,lon;lat,lon"). */
    data class Flight(val dep: String = "", val stops: List<String> = emptyList(), val dest: String = "", val near: String = "")

    data class State(
        val flight: Flight = Flight(),
        /** The words read: the newest transmission settled while
         *  listening, until the pilot types or picks one from the log. */
        val text: String = "",
        val following: Boolean = true,
        val found: ClearancePlaces? = null,
        val foundFor: String? = null,
        val lookupProblem: String? = null,
        val readback: String = "",
        val readingBack: Boolean = false,
        /** The newest transmission's id when Read Back Again was tapped:
         *  the next one settled is the read back, not a new clearance. */
        val readbackAfter: Int = -1,
        val clearance: Clearance? = null,
        val cleared: Cleared? = null,
        val check: EngineContract.ReadbackCheckAnswer? = null,
        /** The altitudes in one line, as ATC says them (AIM 4-2-9). */
        val altitudes: String? = null,
        /** What the engine could not read of the clearance, the route it
         *  gives or the read back, in its own words. */
        val engineProblem: String? = null,
    ) {
        val heard: Boolean get() = clearance?.heardAny == true

        /** Heard, and its places found where it names any. */
        val ready: Boolean get() = heard && (clearance?.wantsPlaces != true || foundFor == text)

        /** The four parts of the step and where each stands. */
        val steps: List<Pair<String, Step>>
            get() {
                val readBack = heard && readback.isNotEmpty()
                return listOf(
                    "Hear" to if (heard) Step.DONE else Step.NOW,
                    "Read back" to if (readBack) Step.DONE else if (heard) Step.NOW else Step.LATER,
                    "Enter" to if (readBack && ready) Step.NOW else Step.LATER,
                    "Compare" to if (ready) Step.DONE else Step.LATER,
                )
            }
    }

    enum class Step { DONE, NOW, LATER }

    /** The route Enter puts in the plan, and the altitude to fly: the
     *  one to expect, else the one to maintain, under IFR (a VFR
     *  clearance's altitude is the pilot's own choice). */
    data class Entry(val dep: String, val stops: List<String>, val dest: String, val altitudeFt: Double?)

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()
    private var lookup: Job? = null

    init {
        listener?.let { radio -> viewModelScope.launch { radio.heard.collect(::heardFrom) } }
    }

    fun flight(f: Flight) {
        if (f == _state.value.flight) return
        _state.update { it.copy(flight = f) }
        derive()
    }

    /** Typed, or a photo's words used: the card reads these from now on. */
    fun type(text: String) = setText(text, following = false)

    private fun setText(text: String, following: Boolean) {
        _state.update { it.copy(text = text, following = following) }
        derive()
        findPlaces()
    }

    fun typeReadback(said: String) {
        _state.update { it.copy(readback = said, readingBack = false) }
        derive()
    }

    private fun heardFrom(heard: List<Heard>) {
        val last = heard.lastOrNull { it.final } ?: return
        val s = _state.value
        when {
            s.readingBack && last.id > s.readbackAfter -> typeReadback(last.text)
            s.following && last.text != s.text -> setText(last.text, following = true)
        }
    }

    /** Listening on the radio, the card following what it settles. */
    fun listen() {
        _state.update { it.copy(following = true) }
        listener?.start()
    }

    fun stopListening() = listener?.stop()

    /** Listens for the pilot's read back: the next transmission settled
     *  is it, the clearance kept as it is. With the radio not listened
     *  to, the microphone opens for this one read back alone. */
    fun readBackAgain() {
        val radio = listener ?: return
        _state.update { it.copy(following = false, readback = "", readingBack = true, readbackAfter = radio.heard.value.lastOrNull()?.id ?: -1) }
        if (!radio.listening.value) {
            viewModelScope.launch {
                val said = radio.once()
                if (_state.value.readingBack) typeReadback(said.orEmpty())
            }
        }
    }

    /** The engine's readings of what is on the card, again. */
    private fun derive() {
        val s = _state.value
        val reading = if (s.text.isBlank()) null else rules.read(s.text)
        val clearance = reading?.getOrNull()
        val clearing = if (clearance?.heardAny == true) rules.cleared(s.text, s.found, s.flight.dep, s.flight.stops, s.flight.dest) else null
        val checking = if (clearance?.heardAny == true && s.readback.isNotEmpty()) rules.readback(s.text, s.readback) else null
        val problem = listOf("The clearance" to reading, "The route it gives" to clearing, "The read back" to checking)
            .firstNotNullOfOrNull { (what, r) -> r?.exceptionOrNull()?.let { "$what couldn't be read: ${it.message}" } }
        val altitudes = clearance?.let { ClearanceWords.altitudes(it, rules::altitude) }
        _state.update { it.copy(clearance = clearance, cleared = clearing?.getOrNull(), check = checking?.getOrNull(), altitudes = altitudes, engineProblem = problem) }
    }

    /** Once the words stop changing (400 ms), their places looked up. */
    private fun findPlaces() {
        lookup?.cancel()
        val s = _state.value
        val clearance = s.clearance?.takeIf { it.wantsPlaces } ?: return
        val heard = s.text
        lookup = viewModelScope.launch {
            delay(SETTLE_MS)
            try {
                val found = places(clearance.asked(s.flight.near, s.flight.dep, s.flight.dest))
                _state.update { it.copy(found = found, foundFor = heard, lookupProblem = null) }
                derive()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.update { it.copy(lookupProblem = "The places in it could not be looked up; check the connection and try again.") }
            }
        }
    }

    /** What Enter the Route puts in the plan; null until it is ready. */
    fun entry(): Entry? {
        val s = _state.value
        if (!s.ready) return null
        val cleared = s.cleared ?: Cleared(s.flight.dep, s.flight.stops, s.flight.dest, emptyList())
        val read = s.clearance?.read
        val ft = if (read == null || read.vfr) null else (read.expectFt ?: read.maintainFt)?.toDouble()
        return Entry(cleared.dep.ifEmpty { s.flight.dep }, cleared.stops, cleared.dest, ft)
    }

    companion object {
        const val SETTLE_MS = 400L
    }
}
