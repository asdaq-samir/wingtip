package app.wingtipmaps.android.logbook

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.wingtipmaps.android.api.Gateway
import app.wingtipmaps.android.api.Problems
import app.wingtipmaps.android.api.addLogbook
import app.wingtipmaps.android.api.generated.gateway.LogbookEntryDto
import app.wingtipmaps.android.api.generated.gateway.LogbookEntryRequest
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * The Logbook's view model (the web's LogbookPanel, at its least): the
 * pilot's entries from the gateway, newest first, and what its currency
 * says, read again whenever a flight is logged from the track
 * (LogbookChanged). An entry is edited in its row (LogbookForm, Save or
 * Cancel) and deleted with a Snackbar's Undo: the delete is sent only
 * once the Snackbar is let go (`deleteKept`), so Undo needs no server.
 * A flight is added by hand from Add Flight (`add`), in the same fields.
 * Signed out, nothing.
 */
class LogbookModel(
    private val source: LogbookSource = ServerLogbook,
    private val edits: LogbookEdits = ServerLogbookEdits,
    private val adds: suspend (LogbookEntryRequest) -> LogbookEntryDto = { Gateway.addLogbook(it) },
) : ViewModel() {
    // TODO(claude/android-data-stock): @HiltViewModel with an @Inject
    // constructor once the sources and seams it is given are injectable
    // (Hilt, 2026-11-12); until then Hilt's factory hands it to the default one.
    /** An entry taken out of the list and where it was, for its Undo. */
    data class Removed(val entry: LogbookEntryDto, val index: Int)

    data class State(
        val entries: List<LogbookEntryDto> = emptyList(),
        val currency: List<String> = emptyList(),
        val loading: Boolean = false,
        val problem: String? = null,
        /** The entry open for editing in its row, by id. */
        val editing: Long? = null,
        val saving: Boolean = false,
        /** Why the open row was not saved, said in that row. */
        val editProblem: String? = null,
        val removed: Removed? = null,
        /** Add Flight's sheet open, with why it was not saved. */
        val adding: Boolean = false,
        val addProblem: String? = null,
        /** Counts each entry saved or added, for the screen's Confirm
         *  haptic: it is felt once per save that reached the server. */
        val saved: Int = 0,
    )

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()

    init {
        viewModelScope.launch { LogbookChanged.version.collect { load() } }
    }

    private suspend fun load() {
        _state.update { it.copy(loading = true, problem = null) }
        try {
            val entries = source.entries().orEmpty().sortedByDescending { it.flownOn }
            val currency = source.currency()?.let(CurrencyWords::lines).orEmpty()
            // An entry waiting on its Undo stays out of the list.
            _state.update { s -> s.copy(entries = entries.filterNot { it.id == s.removed?.entry?.id }, currency = currency, loading = false) }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            _state.update { it.copy(loading = false, problem = Problems.say("The logbook could not be fetched", e)) }
        }
    }

    /** A row opened for editing; another open one closes unsaved. */
    fun edit(id: Long) {
        _state.update { it.copy(editing = id, editProblem = null) }
    }

    fun cancelEdit() {
        _state.update { it.copy(editing = null, editProblem = null) }
    }

    /** Save: the row's fields sent, the entry replaced by the gateway's
     *  copy and the row closed; the currency read again from it. */
    fun save(form: LogbookForm) {
        val s = _state.value
        val was = s.entries.firstOrNull { it.id == s.editing } ?: return
        val asked = form.request(was).getOrElse { why ->
            _state.update { it.copy(editProblem = why.message) }
            return
        }
        _state.update { it.copy(saving = true, editProblem = null) }
        viewModelScope.launch {
            try {
                val saved = edits.update(was.id, asked)
                _state.update { st ->
                    st.copy(
                        entries = st.entries.map { if (it.id == saved.id) saved else it }.sortedByDescending { it.flownOn },
                        editing = null, saving = false, saved = st.saved + 1,
                    )
                }
                LogbookChanged.changed()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.update { it.copy(saving = false, editProblem = Problems.say("The entry could not be saved", e)) }
            }
        }
    }

    fun openAdd() {
        _state.update { it.copy(adding = true, addProblem = null) }
    }

    fun closeAdd() {
        _state.update { it.copy(adding = false, addProblem = null) }
    }

    /** Add Flight's Save: the new entry sent, put in its place in the
     *  list and the sheet closed; the currency read again from it. */
    fun add(form: LogbookForm) {
        val asked = form.request(LogbookForm.BLANK).getOrElse { why ->
            _state.update { it.copy(addProblem = why.message) }
            return
        }
        _state.update { it.copy(saving = true, addProblem = null) }
        viewModelScope.launch {
            try {
                val added = adds(asked)
                _state.update { st ->
                    st.copy(entries = (st.entries + added).sortedByDescending { it.flownOn }, adding = false, saving = false, saved = st.saved + 1)
                }
                LogbookChanged.changed()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.update { it.copy(saving = false, addProblem = Problems.say("The flight could not be added", e)) }
            }
        }
    }

    /** Delete: the entry out of the list, its Undo offered; one still
     *  waiting is kept deleted first. */
    fun delete(id: Long) {
        _state.value.removed?.let { deleteKept(it.entry.id) }
        val s = _state.value
        val at = s.entries.indexOfFirst { it.id == id }.takeIf { it >= 0 } ?: return
        _state.update {
            it.copy(entries = s.entries.filterIndexed { i, _ -> i != at }, removed = Removed(s.entries[at], at), editing = null, editProblem = null)
        }
    }

    /** Undo: the entry back where it was. */
    fun undoDelete() {
        val r = _state.value.removed ?: return
        _state.update { s -> s.copy(entries = s.entries.toMutableList().apply { add(r.index.coerceAtMost(size), r.entry) }, removed = null) }
    }

    /** The Snackbar let go: the delete sent; refused, the entry comes
     *  back and the logbook says why. */
    fun deleteKept(id: Long) {
        val r = _state.value.removed?.takeIf { it.entry.id == id } ?: return
        _state.update { it.copy(removed = null) }
        viewModelScope.launch {
            try {
                edits.delete(id)
                LogbookChanged.changed()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.update { s ->
                    s.copy(
                        entries = s.entries.toMutableList().apply { add(r.index.coerceAtMost(size), r.entry) },
                        problem = Problems.say("The entry could not be deleted", e),
                    )
                }
            }
        }
    }

    companion object {
        /** An entry's time, at the row's end: "1.4 h". */
        fun hours(e: LogbookEntryDto): String = "${DraftEntry.tenths(e.totalHours)} h"

        /** Under an entry's headline, after the airplane: its landings and
         *  remarks, "1 landing · Pattern work". */
        fun details(e: LogbookEntryDto): String? {
            val landings = e.dayLandings + e.nightLandings
            return listOfNotNull(if (landings == 1) "1 landing" else "$landings landings", e.remarks?.ifBlank { null }).joinToString(" · ")
        }

        /** The month an entry is grouped under, from its ISO date
         *  ("2026-11-09" under "2026-11"); a date that does not read is
         *  grouped under itself. */
        fun monthOf(e: LogbookEntryDto): String = e.flownOn.take(7)

        /** The logbook's totals under its title, added up from the
         *  entries as a paper logbook's page foot adds them: "12 flights ·
         *  34.5 h · 20 landings". */
        fun totals(entries: List<LogbookEntryDto>): String {
            val landings = entries.sumOf { it.dayLandings + it.nightLandings }
            val flights = if (entries.size == 1) "1 flight" else "${entries.size} flights"
            return "$flights · ${DraftEntry.tenths(entries.sumOf { it.totalHours })} h · ${if (landings == 1) "1 landing" else "$landings landings"}"
        }

        /** An entry's line: "KDPA KMSN · 1.4 h · 1 landing". */
        fun line(e: LogbookEntryDto): String {
            val landings = e.dayLandings + e.nightLandings
            return listOfNotNull(
                e.route?.ifEmpty { null },
                "${DraftEntry.tenths(e.totalHours)} h",
                if (landings == 1) "1 landing" else "$landings landings",
            ).joinToString(" · ")
        }
    }
}
