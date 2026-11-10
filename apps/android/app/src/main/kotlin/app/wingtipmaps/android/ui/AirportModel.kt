package app.wingtipmaps.android.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.wingtipmaps.android.api.AirportPlace
import app.wingtipmaps.android.api.AirportSuggestion
import app.wingtipmaps.android.api.Planner
import app.wingtipmaps.android.api.airportPhotos
import app.wingtipmaps.android.api.generated.AirportPhotos
import app.wingtipmaps.android.api.generated.NotamsRanked
import app.wingtipmaps.android.api.generated.NotamsRankedAsk
import app.wingtipmaps.android.api.notamsRanked
import app.wingtipmaps.android.offline.KeptForAir
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** A field's card's model, and the welcome's search for the pilot's home
 *  field: the search's words, what the planner found for them, and the
 *  card of the one picked (the map rings it). */
class AirportModel : ViewModel() {
    data class State(
        val query: String = "",
        val suggestions: List<AirportSuggestion> = emptyList(),
        val place: AirportPlace? = null,
        val problem: String? = null,
        /** A search or a field's card being fetched: its skeleton shows. */
        val loading: Boolean = false,
        /** When the card shown was fetched, where it is the one kept for
         *  the air; null when it is the network's own. */
        val keptAtMs: Long? = null,
        /** The field's NOTAMs as sent, the engine's ranking's order, for
         *  the card's NOTAMs; null until asked. */
        val notams: List<String>? = null,
        val notamsProblem: String? = null,
        /** The field's pictures for the card's carousel; none where the
         *  planner has none or could not be asked (the card does without). */
        val photos: AirportPhotos? = null,
        /** The pictures were asked, so none means none: the chart then. */
        val photosAsked: Boolean = false,
    )

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()

    private var searching: Job? = null

    /** Fields by ident or name as they are typed, asked a moment after
     *  the typing pauses, so a word is one ask rather than one per letter. */
    fun search(text: String) {
        _state.update { it.copy(query = text) }
        searching?.cancel()
        val q = text.trim()
        if (q.length < 2) {
            _state.update { it.copy(suggestions = emptyList(), loading = false) }
            return
        }
        searching = viewModelScope.launch {
            delay(SEARCH_PAUSE_MS)
            _state.update { it.copy(loading = true) }
            try {
                val found = Planner.search(q)
                _state.update { it.copy(suggestions = found, problem = null, loading = false) }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.update { it.copy(problem = e.message, loading = false) }
            }
        }
    }

    /** A field's card opened, by its ident. */
    fun open(ident: String) {
        searching?.cancel()
        _state.update { it.copy(loading = true) }
        viewModelScope.launch {
            try {
                // Kept as it comes, and the kept card given back with its time
                // where the network fails (KeptForAir).
                val had = KeptForAir.had(KeptForAir.AIRPORTS, ident.trim().uppercase(), AirportPlace.serializer()) { Planner.place(ident.trim().uppercase()) }
                val place = had.value
                _state.update {
                    it.copy(place = place, keptAtMs = had.fetchedAtMs.takeIf { had.kept }, suggestions = emptyList(), query = place.ident, problem = null, loading = false, notams = null, photos = it.photos.takeIf { _ -> it.place?.ident == place.ident }, photosAsked = it.photosAsked && it.place?.ident == place.ident)
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.update { it.copy(problem = e.message, loading = false) }
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

    /**
     * The open field's NOTAMs, asked once a card: the planner's ranked
     * NOTAMs (/api/notams/ranked) for a flight from the field to itself,
     * which are the field's own, the engine's most important first. Kept
     * for the air as the route's are (KeptForAir).
     */
    fun loadNotams() {
        val ident = _state.value.place?.ident ?: return
        if (_state.value.notams != null) return
        viewModelScope.launch {
            try {
                val ask = NotamsRankedAsk(dep = ident, dest = ident)
                val had = KeptForAir.had(KeptForAir.NOTAMS, "$ident|local", NotamsRanked.serializer()) { Planner.notamsRanked(ask) }
                _state.update { it.copy(notams = had.value.notams.sortedBy { n -> n.rank }.map { n -> n.raw }, notamsProblem = null) }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.update { it.copy(notamsProblem = "The NOTAMs could not be fetched: ${e.message}") }
            }
        }
    }

    /** The open field's card asked again: its METAR and what SWIM says
     *  now, from a pull on the card. */
    fun refresh() {
        _state.value.place?.ident?.let(::open)
    }

    /** The card closed: what its close and Back at the pill do. */
    fun close() = _state.update { it.copy(place = null, query = "", loading = false) }

    private companion object {
        const val SEARCH_PAUSE_MS = 250L
    }
}
