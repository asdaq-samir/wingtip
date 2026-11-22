package app.wingtipmaps.android.library

import android.content.Context
import app.wingtipmaps.android.KeptFile
import app.wingtipmaps.android.api.Gateway
import app.wingtipmaps.android.api.Planner
import app.wingtipmaps.android.api.Problems
import app.wingtipmaps.android.api.generated.LibraryDocument
import app.wingtipmaps.android.api.libraryShelf
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.builtins.ListSerializer
import java.io.File

/**
 * The FAA's shelf as the planner keeps it (/api/library, wingtip.library:
 * each document's current edition, fetched there once a day), and the
 * books this phone keeps for the air, each the whole file in its edition
 * under files/library/books/<doc>/<edition>.pdf (or .json, a CFR part's
 * text). The shelf last read is kept too, so with no signal the page
 * lists what it listed, and what is kept opens. When the shelf names a
 * newer edition of a book kept, it is kept again in the old one's place
 * (KeepBookWorker), so what is on board is the edition in force.
 */
class Bookshelf private constructor(private val context: Context) {
    private val root = File(context.filesDir, "library")
    private val books = File(root, "books")
    private val lastShelf = KeptFile(File(root, "shelf.json"))
    private val coder = ListSerializer(LibraryDocument.serializer())

    private val _shelf = MutableStateFlow(lastShelf.read()?.let { runCatching { Gateway.json.decodeFromString(coder, it) }.getOrNull() }.orEmpty())
    val shelf: StateFlow<List<LibraryDocument>> = _shelf.asStateFlow()
    private val _problem = MutableStateFlow<String?>(null)
    val problem: StateFlow<String?> = _problem.asStateFlow()
    private val _kept = MutableStateFlow(keptNow())

    /** The edition kept of each book on the phone, by its id. */
    val kept: StateFlow<Map<String, String>> = _kept.asStateFlow()

    /** The shelf read again; each book kept in an older edition kept again. */
    suspend fun refresh() {
        val read = runCatching { Planner.libraryShelf().documents }
        read.onSuccess { documents ->
            _shelf.value = documents
            _problem.value = null
            lastShelf.write { Gateway.json.encodeToString(coder, documents) }
            for (d in documents) {
                val edition = d.edition ?: continue
                val had = _kept.value[d.id] ?: continue
                if (had != edition) KeepBookWorker.keep(context, d.id, edition, d.kind)
            }
        }
        read.onFailure { _problem.value = Problems.say("The library could not be fetched", it) }
    }

    fun document(id: String): LibraryDocument? = _shelf.value.firstOrNull { it.id == id }

    /** Where a book's edition is kept, or would be. */
    fun file(doc: String, edition: String, kind: String): File = File(File(books, doc), "$edition.${if (kind == TEXT) "json" else "pdf"}")

    /** The book kept, in whichever edition it was kept in, or none. */
    fun keptFile(doc: String): File? = File(books, doc).listFiles()?.firstOrNull { it.isFile && !it.name.endsWith(".part") }

    /** A new edition written: every other edition of it gone. */
    fun kept(doc: String, file: File) {
        File(books, doc).listFiles()?.filter { it != file }?.forEach { it.delete() }
        _kept.value = keptNow()
    }

    /** Taken off the phone, the download under way stopped with it. */
    fun remove(doc: String) {
        KeepBookWorker.stop(context, doc)
        File(books, doc).deleteRecursively()
        _kept.value = keptNow()
    }

    private fun keptNow(): Map<String, String> =
        books.listFiles()?.mapNotNull { dir ->
            dir.listFiles()?.firstOrNull { it.isFile && !it.name.endsWith(".part") }?.let { dir.name to it.nameWithoutExtension }
        }?.toMap().orEmpty()

    companion object {
        /** A CFR part, read as text rather than a PDF. */
        const val TEXT = "text"

        /** The shelf's groups in the order the page lists them; a group
         *  the planner adds later comes after them. */
        val GROUPS = listOf("Regulations", "AIM", "Handbooks", "Advisory Circulars", "Charts")

        /** The shelf by its groups, in GROUPS' order. */
        fun grouped(shelf: List<LibraryDocument>): List<Pair<String, List<LibraryDocument>>> =
            shelf.groupBy { it.group }.toList().sortedBy { (g, _) -> GROUPS.indexOf(g).let { if (it < 0) GROUPS.size else it } }

        @Volatile
        private var shared: Bookshelf? = null

        fun of(context: Context): Bookshelf =
            shared ?: synchronized(this) { shared ?: Bookshelf(context.applicationContext).also { shared = it } }
    }
}
