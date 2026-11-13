package app.wingtipmaps.android.documents

import android.content.Context
import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.wingtipmaps.android.documents.model.DocumentRead
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * The clearance card's "From a Photo" (the iPhone's ClearancePhotoRow,
 * the web's): a clearance or ATIS copied down in shorthand, photographed
 * and read on the phone (OnPhoneReader, kind "clearance") as written and as the controller would say it. Shown for the pilot to
 * check against the paper; Use It hands the words said to the card's own
 * reader, which makes the card as from words typed. Nothing else changes.
 */
@HiltViewModel
class ClearancePhotoModel @Inject constructor() : ViewModel() {
    data class State(
        val reading: Boolean = false,
        val problem: String? = null,
        /** The page read, shown until Use It or Cancel. */
        val shown: DocumentRead? = null,
    ) {
        /** The words to hand the card, where the page gave any. */
        val said: String? get() = shown?.clearance?.said?.takeIf { it.isNotBlank() }
    }

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()
    private var job: Job? = null

    fun read(context: Context, page: Uri) {
        val app = context.applicationContext
        read { Documents.read(app, page, Documents.Kind.CLEARANCE) }
    }

    /** A page read by `reader`, said where it fails. */
    fun read(reader: suspend () -> DocumentRead) {
        job?.cancel()
        _state.value = State(reading = true)
        job = viewModelScope.launch {
            try {
                val read = reader()
                _state.update { it.copy(reading = false, shown = read) }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.update { it.copy(reading = false, problem = Documents.words(e)) }
            }
        }
    }

    fun problem(words: String) = _state.update { it.copy(problem = words) }

    /** Use It or Cancel: the page put away. */
    fun close() = _state.update { it.copy(shown = null) }
}
