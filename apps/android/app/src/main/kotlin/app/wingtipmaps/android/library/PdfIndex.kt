package app.wingtipmaps.android.library

import android.content.Context
import app.wingtipmaps.android.api.Gateway
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader
import com.tom_roush.pdfbox.io.MemoryUsageSetting
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.pdmodel.interactive.documentnavigation.outline.PDOutlineNode
import com.tom_roush.pdfbox.text.PDFTextStripper
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.builtins.serializer
import java.io.File

/**
 * What PdfRenderer cannot read of a PDF, read by PdfBox-Android: its
 * outline (the AIM's chapters, sections and paragraphs) and each page's
 * text for the search. Read once per file and kept beside the app's cache
 * under the file's name and length, so a handbook of 700 pages is read
 * through once, in the background, and not again until a new edition.
 * PdfBox is told to keep what it reads in a scratch file, not in memory.
 */
class PdfIndex(context: Context) {
    private val app = context.applicationContext
    private val dir = File(app.cacheDir, "library-index")

    @Serializable
    private data class Outline(val rows: List<OutlineRow>)

    /** The outline as rows, in its order; empty where the PDF has none. */
    suspend fun outline(file: File): List<OutlineRow> = withContext(Dispatchers.IO) {
        val kept = File(dir, key(file) + ".outline.json")
        kept.takeIf { it.isFile }?.let { f -> runCatching { Gateway.json.decodeFromString(Outline.serializer(), f.readText()).rows }.getOrNull() }?.let { return@withContext it }
        val rows = open(file) { pdf ->
            val rows = mutableListOf<OutlineRow>()
            fun walk(node: PDOutlineNode, depth: Int) {
                for (item in node.children()) {
                    val page = runCatching { item.findDestinationPage(pdf)?.let { pdf.pages.indexOf(it) } }.getOrNull()
                    if (page != null && page >= 0) rows += OutlineRow(item.title.orEmpty().trim(), page + 1, depth)
                    walk(item, depth + 1)
                }
            }
            pdf.documentCatalog.documentOutline?.let { walk(it, 0) }
            rows
        }
        write(kept, Gateway.json.encodeToString(Outline.serializer(), Outline(rows)))
        rows
    }

    /** Each page's text, in order. */
    suspend fun pages(file: File): List<String> = withContext(Dispatchers.IO) {
        val coder = ListSerializer(String.serializer())
        val kept = File(dir, key(file) + ".text.json")
        kept.takeIf { it.isFile }?.let { f -> runCatching { Gateway.json.decodeFromString(coder, f.readText()) }.getOrNull() }?.let { return@withContext it }
        val pages = open(file) { pdf ->
            val stripper = PDFTextStripper()
            (1..pdf.numberOfPages).map { n ->
                currentCoroutineContext().ensureActive()
                stripper.startPage = n
                stripper.endPage = n
                runCatching { stripper.getText(pdf) }.getOrDefault("")
            }
        }
        write(kept, Gateway.json.encodeToString(coder, pages))
        pages
    }

    private suspend fun <T> open(file: File, read: suspend (PDDocument) -> T): T {
        PDFBoxResourceLoader.init(app)
        return PDDocument.load(file, MemoryUsageSetting.setupTempFileOnly()).use { read(it) }
    }

    private fun write(file: File, text: String) {
        val _ = runCatching {
            file.parentFile?.mkdirs()
            file.writeText(text)
        }
    }

    /** A file by its name, its folder's and its length: a new edition, or
     *  an own document replaced, is read again. */
    private fun key(file: File): String = "${file.parentFile?.name}-${file.nameWithoutExtension}-${file.length()}"
}
