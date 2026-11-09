package app.wingtipmaps.android.logbook

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.wingtipmaps.android.api.generated.gateway.LogbookEntryDto
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
 * (LogbookChanged). Signed out, nothing.
 */
class LogbookModel(private val source: LogbookSource = ServerLogbook) : ViewModel() {
    data class State(
        val entries: List<LogbookEntryDto> = emptyList(),
        val currency: List<String> = emptyList(),
        val loading: Boolean = false,
        val problem: String? = null,
    )

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()

    init {
        viewModelScope.launch { LogbookChanged.version.collect { load() } }
    }

    private suspend fun load() {
        _state.update { it.copy(loading = true, problem = null) }
        _state.value = try {
            State(
                entries = source.entries().orEmpty().sortedByDescending { it.flownOn },
                currency = source.currency()?.let(CurrencyWords::lines).orEmpty(),
            )
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            State(problem = "The logbook could not be fetched: ${e.message}")
        }
    }

    companion object {
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
