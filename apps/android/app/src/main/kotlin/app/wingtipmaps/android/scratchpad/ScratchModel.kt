package app.wingtipmaps.android.scratchpad

import android.content.Context
import androidx.lifecycle.ViewModel
import app.wingtipmaps.android.AppClock
import app.wingtipmaps.android.KeptFile
import app.wingtipmaps.android.api.Gateway
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import java.io.File
import java.util.UUID
import javax.inject.Inject

/**
 * The scratchpad's model (ScratchpadPage): the flight's pages, kept on
 * the phone and nowhere else, linked to the flight by its route (the
 * Ready to fly's flight key: a new route is a new flight, and the route
 * flown again finds its pages), one file a flight in the app's own files
 * (KeptFile: written behind, each write whole). The page shown, and each
 * change -- a field typed, strokes written, one taken back -- made here.
 */
@HiltViewModel
class ScratchModel @Inject constructor(@param:ApplicationContext private val context: Context) : ViewModel() {
    data class State(val flight: String? = null, val book: ScratchBook = ScratchBook(), val shown: String? = null) {
        val page: ScratchPage? get() = book.pages.firstOrNull { it.id == shown } ?: book.pages.lastOrNull()
    }

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()
    private var file: KeptFile? = null

    /** The flight's pages, read where it is another flight than shown. */
    fun open(flight: String) {
        if (flight == _state.value.flight) return
        val kept = KeptFile(fileOf(File(context.filesDir, DIR), flight))
        file = kept
        val book = kept.read()?.let { runCatching { Gateway.json.decodeFromString(ScratchBook.serializer(), it) }.getOrNull() } ?: ScratchBook()
        _state.value = State(flight = flight, book = book, shown = book.pages.lastOrNull()?.id)
    }

    /** A new page of `template`, shown at once. */
    fun add(template: Template) {
        val page = ScratchPage(UUID.randomUUID().toString(), template, AppClock.nowMs())
        change { it.add(page) }
        _state.update { it.copy(shown = page.id) }
    }

    fun show(id: String) = _state.update { it.copy(shown = id) }

    fun delete(id: String) = change { it.remove(id) }

    fun field(id: String, key: String, text: String) = change { it.field(id, key, text) }

    fun write(id: String, lines: List<InkLine>) = change { it.write(id, lines) }

    fun undo(id: String) = change { it.undo(id) }

    fun clearInk(id: String) = change { it.clearInk(id) }

    private fun change(how: (ScratchBook) -> ScratchBook) {
        _state.update { it.copy(book = how(it.book)) }
        val book = _state.value.book
        file?.write { Gateway.json.encodeToString(ScratchBook.serializer(), book) }
    }

    companion object {
        private const val DIR = "scratchpad"

        /** A flight's file: its key in letters, figures and dashes, so any
         *  route names a file ("KOSH||KMSN" is KOSH-KMSN.json), and a page
         *  written with no route yet under "unplanned". */
        fun fileOf(dir: File, flight: String): File {
            val name = flight.replace(Regex("[^A-Za-z0-9]+"), "-").trim('-').ifEmpty { "unplanned" }
            return File(dir, "$name.json")
        }
    }
}
