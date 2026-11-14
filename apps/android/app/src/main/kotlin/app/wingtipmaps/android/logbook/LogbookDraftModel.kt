package app.wingtipmaps.android.logbook

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.wingtipmaps.android.AppClock
import app.wingtipmaps.android.api.Problems
import app.wingtipmaps.android.api.SavedTrack
import app.wingtipmaps.android.api.SavedTrackPoint
import app.wingtipmaps.android.api.generated.LogbookDraft
import app.wingtipmaps.android.api.generated.LogbookDraftAsk
import app.wingtipmaps.android.api.generated.gateway.FlightSummaryDto
import app.wingtipmaps.android.api.generated.gateway.LogbookEntryDto
import dagger.assisted.Assisted
import dagger.assisted.AssistedFactory
import dagger.assisted.AssistedInject
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.util.TimeZone
import kotlin.time.Clock

/**
 * "Flight Logged"'s view model, the flight logged with no typing (the
 * web's useAutoLogbook): the track recorded (FlightRecorder) read by the
 * engine on the phone once a minute of points; when it finds the airplane
 * has landed and come to rest, the planner draws the entry with the
 * fields and approaches round it (POST /api/logbook-draft), the pilot
 * reviews it, changes what they like and logs it (POST /api/logbook) --
 * never saved unasked. Logged, the currency is asked again, as the
 * gateway works it out from the logbook.
 */
@HiltViewModel(assistedFactory = LogbookDraftModel.Factory::class)
class LogbookDraftModel(
    private val flight: RecordedFlight,
    private val shelf: TrackShelf,
    private val rules: DraftRules = EngineDraft,
    private val source: LogbookSource = ServerLogbook,
    private val utcOffsetMin: () -> Double = { TimeZone.getDefault().getOffset(AppClock.nowMs()) / 60_000.0 },
) : ViewModel() {
    /** Hilt's, the recorded flight handed in by its host: the engine's
     *  rules, the gateway's logbook and the phone's offset from UTC now. */
    @AssistedInject
    constructor(@Assisted flight: RecordedFlight, @Assisted shelf: TrackShelf, rules: DraftRules, source: LogbookSource, clock: Clock) :
        this(flight, shelf, rules, source, { TimeZone.getDefault().getOffset(clock.now().toEpochMilliseconds()) / 60_000.0 })

    @AssistedFactory
    interface Factory {
        fun create(flight: RecordedFlight, shelf: TrackShelf): LogbookDraftModel
    }

    data class Logged(val entry: LogbookEntryDto, val currency: List<String>)

    data class State(
        /** The end of the flight on offer (the engine's block end, ms). */
        val endedAt: Double? = null,
        val signedIn: Boolean = false,
        val draft: LogbookDraft? = null,
        val pending: Boolean = false,
        val draftProblem: String? = null,
        val edits: Map<DraftField, String> = emptyMap(),
        /** 61.57(c)'s items added only where the pilot says so (61.51(g)(1)). */
        val byInstruments: Boolean = false,
        val logging: Boolean = false,
        val logProblem: String? = null,
        val logged: Logged? = null,
        /** The pilot's saved flights, for the track's home. */
        val flights: List<FlightSummaryDto> = emptyList(),
    ) {
        /** The saved flight the track goes to: the one whose ends are the
         *  route's, as the web and the iPhone link it. */
        val linked: Long? get() = likelyFlight(flights, edits[DraftField.ROUTE] ?: draft?.entry?.route)?.id
        val open: Boolean get() = endedAt != null || logged != null
    }

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()
    /** The minute of points and the end offered last read. */
    private var looked: Pair<Int, Double?>? = null
    private var tail: String? = null
    private var type: String? = null
    private var asking: Job? = null

    /** Why a logged flight's track is not yet with its saved flight,
     *  while it is kept on the phone; null once it has gone. */
    val trackProblem: StateFlow<String?> = combine(shelf.unsent, shelf.problem) { unsent, problem -> if (unsent.isEmpty()) null else problem ?: UnsentTracks.KEPT }
        .stateIn(viewModelScope, SharingStarted.Eagerly, null)

    init {
        viewModelScope.launch { flight.recorded.collect(::look) }
    }

    /** Who is signed in, and the airplane (its registration and the
     *  planner's type), for the draft's airplane. */
    fun context(signedIn: Boolean, tail: String?, type: String?) {
        this.tail = tail
        this.type = type?.ifEmpty { null }?.uppercase()
        _state.update { it.copy(signedIn = signedIn) }
        askIfWanted()
    }

    /** The engine's reading, once each minute of points. */
    private fun look(recorded: Recorded) {
        val minute = recorded.points.size / LOOK_EVERY_POINTS
        if (looked == minute to recorded.askedTo) return
        looked = minute to recorded.askedTo
        val seen = recorded.points.take(minute * LOOK_EVERY_POINTS)
        val reading = if (seen.size >= 2) rules.read(seen) else null
        val ended = DraftEntry.ended(reading, seen, recorded.askedTo)
        if (ended == _state.value.endedAt) return
        asking?.cancel()
        _state.update { it.copy(endedAt = ended, draft = null, pending = false, draftProblem = null, edits = emptyMap(), byInstruments = false) }
        askIfWanted()
    }

    /** The draft asked once for the flight that ended, signed in. */
    private fun askIfWanted() {
        val s = _state.value
        if (s.endedAt == null || !s.signedIn || s.draft != null || s.pending) return
        val points = flight.recorded.value.points
        if (points.size < 2) return
        _state.update { it.copy(pending = true, draftProblem = null) }
        asking = viewModelScope.launch {
            try {
                val draft = source.draft(LogbookDraftAsk(aircraft = tail, aircraftType = type, points = points, utcOffsetMin = utcOffsetMin(), picked = null))
                _state.update { it.copy(draft = draft, pending = false) }
                // The saved flights, for the track's home; none is no link.
                val flights = try {
                    source.flights()
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    emptyList()
                }
                _state.update { it.copy(flights = flights) }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.update { it.copy(pending = false, draftProblem = Problems.say("The entry could not be drawn", e)) }
            }
        }
    }

    fun retry() = askIfWanted()

    fun edit(field: DraftField, text: String) = _state.update { it.copy(edits = it.edits + (field to text)) }

    fun byInstruments(yes: Boolean) = _state.update { it.copy(byInstruments = yes) }

    /** Log: the entry kept by the gateway, linked to its saved flight; the
     *  flown track sent to that flight, or, where that fails, kept on the
     *  phone (TrackShelf) before the recorder lets its own copy go, and
     *  sent again later (sendUnsent): a flown track is never let go before
     *  it has arrived (the iPhone's IOS-1, the brief's Android half); then
     *  the currency asked again from the logbook it is worked out from. */
    fun log() {
        val s = _state.value
        val draft = s.draft ?: return
        if (s.logging) return
        _state.update { it.copy(logging = true, logProblem = null) }
        viewModelScope.launch {
            try {
                val linked = s.linked
                val entry = source.add(DraftEntry.request(draft, s.edits, s.byInstruments, linked))
                if (linked != null) {
                    val track = SavedTrack(
                        points = flight.recorded.value.points.map { SavedTrackPoint(t = it.t.toLong(), lat = it.lat, lon = it.lon, altFt = it.altFt) },
                        source = "android",
                    )
                    try {
                        source.saveTrack(linked, track)
                    } catch (e: CancellationException) {
                        throw e
                    } catch (e: Exception) {
                        shelf.keep(Unsent(linked, track), Problems.say("The flown track could not be sent", e))
                    }
                }
                flight.forget()
                LogbookChanged.changed()
                val currency = try {
                    source.currency()?.let(CurrencyWords::lines).orEmpty()
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    emptyList()
                }
                _state.update { State(signedIn = it.signedIn, logged = Logged(entry, currency)) }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.update { it.copy(logging = false, logProblem = Problems.say("It could not be logged", e)) }
            }
        }
    }

    /** Not now: kept, and not offered again until a later landing. */
    fun later() {
        _state.value.endedAt?.let(flight::asked)
    }

    /** Not a flight to log: the track let go. */
    fun discard() = flight.forget()

    /** The tracks kept unsent sent again, now: Try Again, and each time
     *  the app is in front with a network (AutoLogbookHost). */
    fun sendUnsent() {
        viewModelScope.launch { shelf.send(source::saveTrack) }
    }

    /** The logged sheet put away. */
    fun close() = _state.update { it.copy(logged = null) }

    companion object {
        /** The engine reads the track at most once a minute of points
         *  (12 at FlightRecorder's 5 s): whether a flight has ended is a
         *  question of minutes. */
        const val LOOK_EVERY_POINTS = 12
    }
}
