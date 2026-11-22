package app.wingtipmaps.android.library

import android.content.Context
import app.wingtipmaps.android.KeptFile
import app.wingtipmaps.android.api.Gateway
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.serialization.Serializable
import java.io.File

/** A place the pilot marked, named as they named it: a PDF's page (from
 *  1) or a CFR part's section ("91.155"). */
@Serializable
data class Bookmark(val page: Int? = null, val at: String? = null, val label: String)

/** Where the pilot was in each document, by its name (a library
 *  document's id or "own:<id>"): a PDF's page from 1, or a CFR part's
 *  section; their bookmarks; and the night's inverted pages, null to
 *  follow the dark appearance until picked. */
@Serializable
data class ReaderPlaces(
    val pages: Map<String, Int> = emptyMap(),
    val sections: Map<String, String> = emptyMap(),
    val bookmarks: Map<String, List<Bookmark>> = emptyMap(),
    val inverted: Boolean? = null,
)

/**
 * The reader's memory, kept on this phone as the web keeps it in the
 * browser (readerPlaces.ts): ForeFlight's last page, bookmarks with names
 * and Invert Colors. One small file, written behind (KeptFile).
 */
class ReaderMemory internal constructor(file: File) {
    private val kept = KeptFile(file)
    private val _places = MutableStateFlow(kept.read()?.let { runCatching { Gateway.json.decodeFromString(ReaderPlaces.serializer(), it) }.getOrNull() } ?: ReaderPlaces())
    val places: StateFlow<ReaderPlaces> = _places.asStateFlow()

    fun leftAtPage(doc: String, page: Int) = change { if (it.pages[doc] == page) it else it.copy(pages = it.pages + (doc to page)) }

    fun leftAtSection(doc: String, at: String) = change { if (it.sections[doc] == at) it else it.copy(sections = it.sections + (doc to at)) }

    /** A bookmark on the place, or the one there taken off. */
    fun toggle(doc: String, mark: Bookmark) = change { p ->
        val marks = p.bookmarks[doc].orEmpty()
        val next = if (marks.any { it.same(mark) }) marks.filterNot { it.same(mark) } else (marks + mark).sortedWith(ORDER).take(MOST_BOOKMARKS)
        p.copy(bookmarks = p.bookmarks + (doc to next))
    }

    fun rename(doc: String, mark: Bookmark, label: String) {
        val wanted = label.trim().takeIf { it.isNotEmpty() } ?: return
        change { p -> p.copy(bookmarks = p.bookmarks + (doc to p.bookmarks[doc].orEmpty().map { if (it.same(mark)) it.copy(label = wanted) else it })) }
    }

    fun setInverted(on: Boolean) = change { it.copy(inverted = on) }

    /** A document's places gone with it (an own document deleted). */
    fun forget(doc: String) = change { it.copy(pages = it.pages - doc, sections = it.sections - doc, bookmarks = it.bookmarks - doc) }

    private fun change(edit: (ReaderPlaces) -> ReaderPlaces) {
        _places.update(edit)
        val now = _places.value
        kept.write { Gateway.json.encodeToString(ReaderPlaces.serializer(), now) }
    }

    companion object {
        /** The most a document's bookmarks hold: a pilot's tabs, not an index. */
        const val MOST_BOOKMARKS = 50

        private val ORDER = compareBy<Bookmark>({ it.page ?: 0 }, { it.at.orEmpty() })

        private fun Bookmark.same(other: Bookmark) = page == other.page && at == other.at

        @Volatile
        private var shared: ReaderMemory? = null

        fun of(context: Context): ReaderMemory =
            shared ?: synchronized(this) { shared ?: ReaderMemory(File(context.applicationContext.filesDir, "library/reader.json")).also { shared = it } }
    }
}
