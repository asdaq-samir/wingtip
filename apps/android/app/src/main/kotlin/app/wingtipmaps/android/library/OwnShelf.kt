package app.wingtipmaps.android.library

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import app.wingtipmaps.android.KeptFile
import app.wingtipmaps.android.api.Gateway
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import java.io.File
import java.util.UUID

/** One of the pilot's own PDFs: its name as they gave it, when it was
 *  added (epoch milliseconds) and its size. */
@Serializable
data class OwnDocument(val id: String, val name: String, val added: Long, val bytes: Long)

/**
 * The pilot's own PDFs (the POH, checklists, insurance, club rules),
 * opened from the system's picker or shared in from another app, copied
 * into the app's own files and kept on this phone alone: never sent, no
 * sync, no copy in an account's export (docs/privacy-inventory.md), as
 * the web keeps them in the browser. Renamed in the row; deleted with an
 * Undo, the file kept until the Undo has passed (forget).
 */
class OwnShelf internal constructor(private val dir: File) {
    private val index = KeptFile(File(dir, "own.json"))
    private val coder = ListSerializer(OwnDocument.serializer())
    private val _documents = MutableStateFlow(index.read()?.let { runCatching { Gateway.json.decodeFromString(coder, it) }.getOrNull() }.orEmpty())

    /** The newest first, as the web lists them. */
    val documents: StateFlow<List<OwnDocument>> = _documents.asStateFlow()

    fun file(id: String): File = File(dir, "$id.pdf")

    fun document(id: String): OwnDocument? = _documents.value.firstOrNull { it.id == id }

    /** A PDF from `copy` (a picked or shared file's bytes) kept as `name`. */
    suspend fun add(name: String, copy: (File) -> Unit): OwnDocument = withContext(Dispatchers.IO) {
        dir.mkdirs()
        val id = UUID.randomUUID().toString().take(ID_LENGTH)
        val part = File(dir, "$id.part")
        copy(part)
        if (!isPdf(part)) {
            part.delete()
            throw NotPdf()
        }
        part.renameTo(file(id))
        val document = OwnDocument(id, name.removeSuffix(".pdf").removeSuffix(".PDF").trim().ifEmpty { "Document" }, System.currentTimeMillis(), file(id).length())
        change { listOf(document) + it }
        document
    }

    fun rename(id: String, name: String) {
        val wanted = name.trim().takeIf { it.isNotEmpty() } ?: return
        change { list -> list.map { if (it.id == id) it.copy(name = wanted) else it } }
    }

    /** Off the list at once; the file stays for an Undo (put back). */
    fun remove(id: String): OwnDocument? {
        val gone = document(id) ?: return null
        change { list -> list.filterNot { it.id == id } }
        return gone
    }

    fun putBack(document: OwnDocument) {
        if (file(document.id).isFile) change { list -> (list + document).sortedByDescending { it.added } }
    }

    /** The file of a document removed, once its Undo has passed. */
    fun forget(id: String) {
        if (document(id) == null) file(id).delete()
    }

    private fun change(edit: (List<OwnDocument>) -> List<OwnDocument>) {
        _documents.update(edit)
        val now = _documents.value
        index.write { Gateway.json.encodeToString(coder, now) }
    }

    /** Not a PDF: a file's first bytes are "%PDF-". */
    class NotPdf : Exception("That file is not a PDF.")

    companion object {
        private const val ID_LENGTH = 12

        fun isPdf(file: File): Boolean = runCatching {
            file.inputStream().use { input -> ByteArray(5).let { head -> input.read(head) == 5 && String(head, Charsets.US_ASCII) == "%PDF-" } }
        }.getOrDefault(false)

        /** A content Uri's bytes copied in, under the name its provider gives. */
        suspend fun OwnShelf.addFrom(context: Context, uri: Uri): OwnDocument {
            val resolver = context.contentResolver
            val name = runCatching {
                resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c -> if (c.moveToFirst()) c.getString(0) else null }
            }.getOrNull() ?: uri.lastPathSegment.orEmpty()
            return add(name) { part ->
                (resolver.openInputStream(uri) ?: throw NotPdf()).use { input -> part.outputStream().use { input.copyTo(it) } }
            }
        }

        @Volatile
        private var shared: OwnShelf? = null

        fun of(context: Context): OwnShelf =
            shared ?: synchronized(this) { shared ?: OwnShelf(File(context.applicationContext.filesDir, "own-documents")).also { shared = it } }
    }
}
