package app.wingtipmaps.android.library

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import app.wingtipmaps.android.api.Gateway
import app.wingtipmaps.android.api.Planner
import app.wingtipmaps.android.api.Problems
import app.wingtipmaps.android.api.generated.CfrText
import app.wingtipmaps.android.api.libraryPdf
import app.wingtipmaps.android.api.libraryText
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

/**
 * One document open in the reader (the web's useReader): the file found
 * -- kept for the air, the pilot's own, or fetched whole into the cache --
 * its pages or its CFR text, the outline, the search and its matches, and
 * where to open: the place asked for (a cite's paragraph, a page), else
 * the page left at. Its memory is ReaderMemory's, its marks MarkupStore's.
 */
class ReaderModel(app: Application, val place: DocPlace) : AndroidViewModel(app) {
    private val books = Bookshelf.of(app)
    private val own = OwnShelf.of(app)
    private val index = PdfIndex(app)
    val memory = ReaderMemory.of(app)
    val markup = MarkupStore.of(app, place.doc)

    /** What the reader shows. `start` is the page (from 1) or the section
     *  it opens at, once. */
    data class State(
        val title: String = "",
        val loading: Boolean = true,
        val problem: String? = null,
        val pages: PdfPages? = null,
        val text: CfrText? = null,
        val outline: List<OutlineRow> = emptyList(),
        val startPage: Int = 1,
        val startSection: String? = null,
        val query: String = "",
        val searching: Boolean = false,
        val hits: List<Hit> = emptyList(),
        val hit: Int = -1,
    )

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()
    private var search: Job? = null
    private var file: File? = null

    init {
        viewModelScope.launch { open() }
    }

    private suspend fun open() {
        val outcome = runCatching {
            if (place.isOwn) {
                val id = place.doc.removePrefix(DocPlace.OWN)
                val doc = own.document(id) ?: error("not on this phone")
                _state.update { it.copy(title = doc.name) }
                openPdf(own.file(id))
                return@runCatching
            }
            val doc = books.document(place.doc)
            _state.update { it.copy(title = doc?.title ?: place.doc) }
            val kept = books.keptFile(place.doc)
            val kind = doc?.kind ?: if (kept?.extension == "json") Bookshelf.TEXT else "pdf"
            if (kind == Bookshelf.TEXT) {
                val text = kept?.let { f -> withContext(Dispatchers.IO) { Gateway.json.decodeFromString(CfrText.serializer(), f.readText()) } }
                    ?: Planner.libraryText(place.doc, doc?.edition ?: error("not on the shelf"))
                val section = place.at ?: memory.places.value.sections[place.doc]
                _state.update { it.copy(text = text, startSection = section, loading = false) }
            } else {
                openPdf(kept ?: fetched(place.doc, doc?.edition ?: error("not on the shelf")))
            }
        }
        outcome.onFailure { e -> _state.update { it.copy(loading = false, problem = Problems.say("This document could not be opened", e)) } }
    }

    private suspend fun openPdf(pdf: File) {
        file = pdf
        val pages = PdfPages.open(pdf)
        val outline = runCatching { index.outline(pdf) }.getOrDefault(emptyList())
        val asked = place.page ?: place.at?.let { at -> Finding.rowFor(outline, at)?.page ?: headingPage(pdf, at) }
        val start = (asked ?: memory.places.value.pages[place.doc] ?: 1).coerceIn(1, pages.count.coerceAtLeast(1))
        _state.update { it.copy(pages = pages, outline = outline, startPage = start, loading = false) }
    }

    /** A paragraph the outline has no row for, found by its heading's words. */
    private suspend fun headingPage(pdf: File, at: String): Int? =
        runCatching { Finding.inPages(index.pages(pdf), Finding.headingWords(at)).firstOrNull()?.page }.getOrNull()

    /** A library PDF not kept, fetched whole into the cache by its edition. */
    private suspend fun fetched(doc: String, edition: String): File = withContext(Dispatchers.IO) {
        val cached = File(File(getApplication<Application>().cacheDir, "library"), "$doc-$edition.pdf")
        if (cached.isFile) return@withContext cached
        cached.parentFile?.mkdirs()
        val part = File(cached.path + ".part")
        check(Planner.libraryPdf(doc, edition, part)) { "the download stopped" }
        if (!part.renameTo(cached)) error("the document could not be kept")
        cached
    }

    /** The search typed, run after a pause; a PDF's text read once. */
    fun search(query: String) {
        _state.update { it.copy(query = query) }
        search?.cancel()
        search = viewModelScope.launch {
            delay(TYPING_MS)
            val s = _state.value
            val hits = when {
                query.trim().length < 2 -> emptyList()
                s.text != null -> Finding.inPart(s.text, query)
                else -> file?.let { f ->
                    _state.update { it.copy(searching = true) }
                    runCatching { Finding.inPages(index.pages(f), query) }.getOrDefault(emptyList())
                }.orEmpty()
            }
            _state.update { it.copy(hits = hits, hit = if (hits.isEmpty()) -1 else 0, searching = false) }
        }
    }

    /** The next match, or the one before (-1), round the end. */
    fun step(by: Int) = _state.update { s -> if (s.hits.isEmpty()) s else s.copy(hit = Math.floorMod(s.hit + by, s.hits.size)) }

    fun pick(hit: Int) = _state.update { it.copy(hit = hit) }

    private val _noting = MutableStateFlow<Mark?>(null)

    /** A highlight just made or a note tapped, its note asked for. */
    val noting: StateFlow<Mark?> = _noting.asStateFlow()

    /** Strokes finished: kept, and a highlight's note asked for. */
    fun marked(marks: List<Mark>) {
        markup.add(marks)
        marks.lastOrNull { it.pen == Pen.HIGHLIGHT }?.let { _noting.value = it }
    }

    fun ask(mark: Mark?) {
        _noting.value = mark
    }

    override fun onCleared() {
        _state.value.pages?.close()
        super.onCleared()
    }

    companion object {
        /** A pause in the typing before the search runs. */
        private const val TYPING_MS = 250L
    }
}
