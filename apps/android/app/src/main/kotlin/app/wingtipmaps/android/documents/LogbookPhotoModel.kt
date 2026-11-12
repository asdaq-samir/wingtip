package app.wingtipmaps.android.documents

import android.content.Context
import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.wingtipmaps.android.api.Gateway
import app.wingtipmaps.android.api.generated.assistant.DocumentRead
import app.wingtipmaps.android.logbook.LogbookChanged
import app.wingtipmaps.android.logbook.LogbookSource
import app.wingtipmaps.android.logbook.ServerLogbook
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * "Add from a Photo" for the logbook: a paper logbook page read by the
 * assistant, each row as the gateway's entry with the engine's flags
 * (logbook_read_check, 14 CFR 61.51), confirmed one by one; "Log N
 * Flights" posts the confirmed rows to the logbook one at a time, a row
 * that fails said under it and left to try again.
 */
class LogbookPhotoModel(private val source: LogbookSource = ServerLogbook) : ViewModel() {
    // TODO(claude/android-data-stock): @HiltViewModel with an @Inject
    // constructor once the sources and seams it is given are injectable
    // (Hilt, 2026-11-12); until then Hilt's factory hands it to the default one.
    data class State(
        val reading: Boolean = false,
        val problem: String? = null,
        val answer: DocumentRead? = null,
        /** The rows confirmed, by their place on the page. */
        val confirmed: Set<Int> = emptySet(),
        /** The rows logged already, which are not logged twice. */
        val logged: Set<Int> = emptySet(),
        val rowProblems: Map<Int, String> = emptyMap(),
        val logging: Boolean = false,
    ) {
        val toLog: Int get() = (confirmed - logged).size
    }

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()

    fun read(context: Context, page: Uri) {
        _state.value = State(reading = true)
        readJob?.cancel()
        readJob = viewModelScope.launch {
            try {
                take(Documents.read(context.applicationContext, page, Documents.Kind.LOGBOOK))
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.update { it.copy(reading = false, problem = Documents.words(e)) }
            }
        }
    }

    /** The reader's answer, nothing confirmed yet. */
    fun take(answer: DocumentRead) {
        _state.value = State(answer = answer)
    }

    private var readJob: Job? = null

    /** The sheet closed: a read under way given up, and nothing kept, so
     *  the next opening starts afresh. */
    fun clear() {
        readJob?.cancel()
        _state.value = State()
    }

    fun problem(words: String) = _state.update { it.copy(problem = words) }

    /** A row confirmed or taken back; a row with no date read, or one
     *  logged already, stays as it is. */
    fun toggle(index: Int) = _state.update { s ->
        val row = s.answer?.logbookCheck?.rows?.getOrNull(index)
        if (row == null || !LogbookReview.canConfirm(row) || index in s.logged) s
        else s.copy(confirmed = if (index in s.confirmed) s.confirmed - index else s.confirmed + index)
    }

    fun logConfirmed() {
        val s = _state.value
        val rows = s.answer?.logbookCheck?.rows ?: return
        if (s.logging || s.toLog == 0) return
        _state.update { it.copy(logging = true, rowProblems = emptyMap()) }
        viewModelScope.launch {
            for (i in (s.confirmed - s.logged).sorted()) {
                val entry = rows.getOrNull(i)?.entry?.let(LogbookReview::request) ?: continue
                try {
                    source.add(entry)
                    _state.update { it.copy(logged = it.logged + i) }
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    val words = (e as? Gateway.Refusal)?.let { r -> r.words ?: "The gateway answered ${r.status}." } ?: e.message
                    _state.update { it.copy(rowProblems = it.rowProblems + (i to "Not logged: $words")) }
                }
            }
            _state.update { it.copy(logging = false) }
            LogbookChanged.changed()
        }
    }
}
