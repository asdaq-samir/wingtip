package app.wingtipmaps.android.library

import android.app.Application
import android.net.Uri
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.work.WorkInfo
import androidx.work.WorkManager
import app.wingtipmaps.android.api.Problems
import app.wingtipmaps.android.api.generated.LibraryDocument
import app.wingtipmaps.android.library.OwnShelf.Companion.addFrom
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * The Documents page's state (You → Documents), the web's useDocuments:
 * the pilot's own PDFs, the FAA's shelf by its groups with what this
 * phone keeps of it and how far each book under way has come, and the
 * calls that add, rename, delete (with an Undo), keep and take off.
 */
@HiltViewModel
class DocumentsModel @Inject constructor(private val app: Application) : AndroidViewModel(app) {
    private val books = Bookshelf.of(app)
    private val own = OwnShelf.of(app)

    val shelf: StateFlow<List<LibraryDocument>> = books.shelf
    val kept: StateFlow<Map<String, String>> = books.kept
    val problem: StateFlow<String?> = books.problem
    val owned: StateFlow<List<OwnDocument>> = own.documents

    private val _removed = MutableStateFlow<OwnDocument?>(null)

    /** The own document just deleted, while its Undo stands. */
    val removed: StateFlow<OwnDocument?> = _removed.asStateFlow()
    private val _addProblem = MutableStateFlow<String?>(null)
    val addProblem: StateFlow<String?> = _addProblem.asStateFlow()

    /** How far each book under way has come, 0 to 1, by its id; a book
     *  queued but not started is at 0. */
    val keeping: StateFlow<Map<String, Float>> = WorkManager.getInstance(app).getWorkInfosByTagFlow(KeepBookWorker.TAG)
        .map { infos ->
            infos.filter { it.state == WorkInfo.State.RUNNING || it.state == WorkInfo.State.ENQUEUED }.mapNotNull { info ->
                val doc = KeepBookWorker.docOf(info.tags) ?: return@mapNotNull null
                val total = info.progress.getLong(KeepBookWorker.EXPECTED, -1)
                doc to if (total > 0) info.progress.getLong(KeepBookWorker.WRITTEN, 0).toFloat() / total else 0f
            }.toMap()
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyMap())

    init {
        refresh()
    }

    fun refresh() {
        viewModelScope.launch { books.refresh() }
    }

    fun keep(document: LibraryDocument) {
        val edition = document.edition ?: return
        KeepBookWorker.keep(app, document.id, edition, document.kind)
    }

    fun takeOff(document: LibraryDocument) = books.remove(document.id)

    /** A PDF picked or shared in, kept on this phone; its place to open. */
    fun add(uri: Uri, then: (DocPlace) -> Unit = {}) {
        viewModelScope.launch {
            runCatching { own.addFrom(app, uri) }
                .onSuccess { _addProblem.value = null; then(DocPlace.own(it.id)) }
                .onFailure { _addProblem.value = if (it is OwnShelf.NotPdf) it.message else Problems.say("The file could not be added", it) }
        }
    }

    fun rename(id: String, name: String) = own.rename(id, name)

    fun remove(id: String) {
        _removed.value?.let { forget(it) }
        _removed.value = own.remove(id)
    }

    fun undo() {
        _removed.value?.let(own::putBack)
        _removed.value = null
    }

    /** The Undo passed: the file, and its places and marks, gone. */
    fun undoPassed() {
        _removed.value?.let { forget(it) }
        _removed.value = null
    }

    private fun forget(document: OwnDocument) {
        own.forget(document.id)
        val place = DocPlace.own(document.id).doc
        ReaderMemory.of(app).forget(place)
        MarkupStore.of(app, place).clearAll()
    }

    override fun onCleared() {
        _removed.value?.let { forget(it) }
    }
}
