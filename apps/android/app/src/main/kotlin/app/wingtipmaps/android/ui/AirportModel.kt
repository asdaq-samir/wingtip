package app.wingtipmaps.android.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.wingtipmaps.android.api.AirportPlace
import app.wingtipmaps.android.api.AirportSuggestion
import app.wingtipmaps.android.api.Planner
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** The Airport tab's model: a field looked for and the one opened -- the
 *  search's words, what the planner found for them, and the card of the
 *  one picked. */
class AirportModel : ViewModel() {
    data class State(
        val query: String = "",
        val suggestions: List<AirportSuggestion> = emptyList(),
        val place: AirportPlace? = null,
        val problem: String? = null,
        /** A search or a field's card being fetched: its skeleton shows. */
        val loading: Boolean = false,
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
                val place = Planner.place(ident.trim().uppercase())
                _state.update { it.copy(place = place, suggestions = emptyList(), query = place.ident, problem = null, loading = false) }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.update { it.copy(problem = e.message, loading = false) }
            }
        }
    }

    /** The open field's card asked again: its METAR and what SWIM says
     *  now, from a pull on the card. */
    fun refresh() {
        _state.value.place?.ident?.let(::open)
    }

    /** The card closed, back to the search: what Back does at the pill. */
    fun close() = _state.update { it.copy(place = null, query = "", loading = false) }

    private companion object {
        const val SEARCH_PAUSE_MS = 250L
    }
}
