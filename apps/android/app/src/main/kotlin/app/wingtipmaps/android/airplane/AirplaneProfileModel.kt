package app.wingtipmaps.android.airplane

import androidx.annotation.StringRes
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.wingtipmaps.android.R
import app.wingtipmaps.android.api.Gateway
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.util.Locale
import javax.inject.Inject

/** Where an airplane's figures are saved: OwnAirplanes, a fake in the tests. */
interface OwnSaving {
    suspend fun save(base: OwnRecord, changes: Map<String, Double?>)
    suspend fun reset(base: OwnRecord, key: String, book: Double?)
}

/**
 * The airplane profile's one view model: which figure is being edited
 * and what is typed in it, the save under way and why one failed. Every
 * figure is the pilot's to set ("in case they know the numbers", the
 * owner, 2026-11-09); the first edit makes their own record of the
 * N-number from its type's book figures (AirplaneNow.base), and theirs
 * then stands over the book's for that N-number alone.
 */
@HiltViewModel
class AirplaneProfileModel @Inject constructor() : ViewModel() {
    data class State(
        val editing: String? = null,
        val text: String = "",
        val saving: Boolean = false,
        val problem: String? = null,
    )

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()

    /** The figure `key` opened for editing, with its figure as it reads now. */
    fun edit(key: String, now: Double?) {
        _state.value = State(editing = key, text = now?.let(::plain).orEmpty())
    }

    fun type(text: String) = _state.update { it.copy(text = text, problem = null) }

    fun cancel() {
        _state.value = State()
    }

    /** The figure typed saved over the airplane's record; a figure that
     *  is no number stays open, saying so. */
    fun save(airplane: AirplaneNow, own: OwnSaving) {
        val s = _state.value
        val key = FigureKey.of(s.editing ?: return) ?: return
        val value = FigureKey.parse(key, s.text)
        if (value == null) {
            _state.update { it.copy(problem = "That is not a figure for its ${key.unit}.") }
            return
        }
        run(own) { it.save(airplane.base(), mapOf(key.key to value)) }
    }

    /** "Reset to Book Figure": the pilot's figure taken away, the book's back. */
    fun reset(airplane: AirplaneNow, key: FigureKey, own: OwnSaving) {
        val book = airplane.figure(key)?.book
        run(own) { it.reset(airplane.base(), key.key, book) }
    }

    private fun run(own: OwnSaving, work: suspend (OwnSaving) -> Unit) {
        _state.update { it.copy(saving = true, problem = null) }
        viewModelScope.launch {
            try {
                work(own)
                _state.value = State()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                val words = (e as? Gateway.Refusal)?.words ?: e.message
                _state.update { it.copy(saving = false, problem = "The figure could not be saved: $words") }
            }
        }
    }

    companion object {
        /** A figure as it is typed back in: "112", "8.5". */
        fun plain(v: Double): String = if (v % 1.0 == 0.0) v.toLong().toString() else String.format(Locale.US, "%s", v)

        /** Where a figure comes from, as the profile labels it. */
        @StringRes
        fun sourceLabel(source: String?): Int = when (source) {
            "pilot" -> R.string.source_pilot
            "handbook" -> R.string.source_handbook
            "book" -> R.string.source_book
            else -> R.string.source_none
        }

        /** Whether "Reset to Book Figure" is offered: the pilot's own figure
         *  over a book that has one. */
        fun resettable(source: String?, book: Double?): Boolean = source == "pilot" && book != null
    }
}
