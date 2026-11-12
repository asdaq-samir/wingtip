package app.wingtipmaps.android.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.wingtipmaps.android.api.AirportPlace
import app.wingtipmaps.android.api.AirportSuggestion
import app.wingtipmaps.android.api.Planner
import app.wingtipmaps.android.api.Problems
import app.wingtipmaps.android.api.airportNotams
import app.wingtipmaps.android.api.airportPhotos
import app.wingtipmaps.android.api.airportServices
import app.wingtipmaps.android.api.generated.AirportPhotos
import app.wingtipmaps.android.api.generated.AirportServices
import app.wingtipmaps.android.api.generated.NotamsRanked
import app.wingtipmaps.android.offline.KeptForAir
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** A field's card's model, and the welcome's search for the pilot's home
 *  field: the search's words, what the planner found for them, and the
 *  card of the one picked (the map rings it). */
@OptIn(FlowPreview::class)
class AirportModel : ViewModel() {
    data class State(
        val query: String = "",
        val suggestions: List<AirportSuggestion> = emptyList(),
        val place: AirportPlace? = null,
        val problem: String? = null,
        /** A search or a field's card being fetched: its loading indicator shows. */
        val loading: Boolean = false,
        /** When the card shown was fetched, where it is the one kept for
         *  the air; null when it is the network's own. */
        val keptAtMs: Long? = null,
        /** The field's own NOTAMs and the TFRs within 5 nm of it, the
         *  engine's ranking, for the card's NOTAMs and the badges on what
         *  they address;
         *  null until fetched. */
        val notams: NotamsRanked? = null,
        val notamsProblem: String? = null,
        /** The route's departure where the card's distance is said from
         *  it (no position): its ident and where it is; null for none. */
        val departure: Departure? = null,
        /** The field's pictures for the card's carousel; none where the
         *  planner has none or could not be asked (the card does without). */
        val photos: AirportPhotos? = null,
        /** The pictures were asked, so none means none: the chart then. */
        val photosAsked: Boolean = false,
        /** What the field offers on the ground, for its Fuel rows; null
         *  until fetched, or where it could not be (the rows do without). */
        val services: AirportServices? = null,
    )

    /** A departure field's ident and place, the distance's start. */
    data class Departure(val ident: String, val lat: Double, val lon: Double)

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()

    /** The line typed, for the fields' search; null for none. */
    private val asks = MutableStateFlow<String?>(null)
    private var departing: Job? = null

    /** Fields by ident or name as they are typed, asked a moment after
     *  the typing pauses, so a word is one ask rather than one per letter. */
    fun search(text: String) {
        _state.update { it.copy(query = text) }
        val q = text.trim()
        if (q.length < 2) {
            asks.value = null
            _state.update { it.copy(suggestions = emptyList(), loading = false) }
            return
        }
        asks.value = q
    }

    // The lines typed, asked once the typing pauses (Flow's debounce); none
    // passes at once, so a search under way stops with it (collectLatest
    // cancels the one before).
    init {
        viewModelScope.launch {
            asks.debounce { if (it == null) 0L else SEARCH_PAUSE_MS }.collectLatest { q -> if (q != null) find(q) }
        }
    }

    private suspend fun find(q: String) {
        _state.update { it.copy(loading = true) }
        try {
            val found = Planner.search(q)
            _state.update { it.copy(suggestions = found, problem = null, loading = false) }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            _state.update { it.copy(problem = Problems.say("Fields could not be found", e), loading = false) }
        }
    }

    /** A field's card opened, by its ident. */
    fun open(ident: String) {
        asks.value = null
        _state.update { it.copy(loading = true) }
        viewModelScope.launch {
            try {
                // Kept as it comes, and the kept card given back with its time
                // where the network fails (KeptForAir).
                val had = KeptForAir.had(KeptForAir.AIRPORTS, ident.trim().uppercase(), AirportPlace.serializer()) { Planner.place(ident.trim().uppercase()) }
                val place = had.value
                _state.update {
                    it.copy(place = place, keptAtMs = had.fetchedAtMs.takeIf { had.kept }, suggestions = emptyList(), query = place.ident, problem = null, loading = false, notams = it.notams.takeIf { _ -> it.place?.ident == place.ident }, services = it.services.takeIf { _ -> it.place?.ident == place.ident }, photos = it.photos.takeIf { _ -> it.place?.ident == place.ident }, photosAsked = it.photosAsked && it.place?.ident == place.ident)
                }
                // Asked with the card, not the tab: the badges on its
                // runways, lights and frequencies read them too.
                launch { loadServices(place.ident) }
                loadNotams(place.ident)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.update { it.copy(problem = Problems.say("${ident.trim().uppercase()} could not be fetched", e), loading = false) }
            }
        }
    }

    /** The open field's pictures, asked once a card. */
    fun loadPhotos() {
        val ident = _state.value.place?.ident ?: return
        if (_state.value.photosAsked) return
        viewModelScope.launch {
            val photos = runCatching { Planner.airportPhotos(ident) }.getOrNull()
            _state.update { if (it.place?.ident == ident) it.copy(photos = photos, photosAsked = true) else it }
        }
    }

    /** The field's services, for its Fuel rows; none where they cannot be had. */
    private suspend fun loadServices(ident: String) {
        val services = try {
            Planner.airportServices(ident)
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            return
        }
        _state.update { if (it.place?.ident == ident) it.copy(services = services) else it }
    }

    /**
     * The field's own NOTAMs and the TFRs within 5 nm of it, the engine's
     * most important first (/api/airport/{ident}/notams), asked each time
     * the card is (a pull asks them again). Kept for the air as the
     * route's are (KeptForAir).
     */
    private suspend fun loadNotams(ident: String) {
        try {
            val had = KeptForAir.had(KeptForAir.NOTAMS, KeptForAir.fieldNotams(ident), NotamsRanked.serializer()) { Planner.airportNotams(ident) }
            _state.update { if (it.place?.ident == ident) it.copy(notams = had.value, notamsProblem = null) else it }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            _state.update { if (it.place?.ident == ident) it.copy(notamsProblem = Problems.say("The NOTAMs could not be fetched", e)) else it }
        }
    }

    /**
     * Where the route's departure is, for the card's distance when the
     * phone has no position: the course's where it has one, else the
     * field's own card (kept for the air as every card is). Nothing for
     * no departure.
     */
    fun departFrom(ident: String, known: Departure?) {
        val dep = ident.trim().uppercase()
        departing?.cancel()
        if (dep.isEmpty()) return _state.update { it.copy(departure = null) }
        if (known != null) return _state.update { it.copy(departure = known) }
        if (_state.value.departure?.ident == dep) return
        departing = viewModelScope.launch {
            val place = try {
                KeptForAir.had(KeptForAir.AIRPORTS, dep, AirportPlace.serializer()) { Planner.place(dep) }.value
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                null
            }
            _state.update { it.copy(departure = place?.let { p -> Departure(p.ident, p.lat, p.lon) }) }
        }
    }

    /** The card closed: what its close and Back at the pill do. */
    fun close() = _state.update { it.copy(place = null, query = "", loading = false) }

    private companion object {
        const val SEARCH_PAUSE_MS = 250L
    }
}
