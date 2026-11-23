package app.wingtipmaps.android.library

import android.graphics.Bitmap
import android.graphics.RectF
import android.graphics.pdf.PdfRenderer
import android.os.Build
import android.os.ParcelFileDescriptor
import androidx.core.graphics.createBitmap
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.io.Closeable
import java.io.File

/** A page's size in PDF points (1/72 inch), as PdfRenderer gives it. */
data class PageSize(val width: Int, val height: Int)

/**
 * A PDF's pages drawn by the platform's own PdfRenderer, as the plates
 * and the airport diagram are (plates/PlateViewer): every page's size
 * read once as it opens, and a page drawn on white at the width asked.
 * PdfRenderer opens one page at a time, so each read waits its turn.
 * From Android 15 its search marks the matches on the page shown, where
 * the platform's own text search finds them.
 */
class PdfPages private constructor(private val fd: ParcelFileDescriptor, private val renderer: PdfRenderer, val sizes: List<PageSize>) : Closeable {
    private val turn = Mutex()

    val count: Int get() = sizes.size

    /** Page `index` (from 0) drawn `widthPx` wide. */
    suspend fun draw(index: Int, widthPx: Int): Bitmap = withContext(Dispatchers.IO) {
        turn.withLock {
            renderer.openPage(index).use { page ->
                val w = widthPx.coerceIn(1, MOST_PX)
                val h = (w.toLong() * page.height / page.width.coerceAtLeast(1)).toInt().coerceIn(1, MOST_PX * 2)
                val bitmap = createBitmap(w, h)
                bitmap.eraseColor(android.graphics.Color.WHITE)
                page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                bitmap
            }
        }
    }

    /** Where `query` is on page `index`, each match's boxes as fractions
     *  of the page; none before Android 15, whose search the platform
     *  does not have. */
    suspend fun matches(index: Int, query: String): List<RectF> {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.VANILLA_ICE_CREAM || query.trim().length < 2) return emptyList()
        return withContext(Dispatchers.IO) {
            turn.withLock {
                renderer.openPage(index).use { page ->
                    val w = page.width.toFloat().coerceAtLeast(1f)
                    val h = page.height.toFloat().coerceAtLeast(1f)
                    page.searchText(query.trim()).flatMap { m -> m.bounds.map { RectF(it.left / w, it.top / h, it.right / w, it.bottom / h) } }
                }
            }
        }
    }

    override fun close() {
        renderer.close()
        fd.close()
    }

    companion object {
        /** The widest a page is drawn, so a zoomed page stays sharp and a
         *  bitmap stays under 15 MB. */
        const val MOST_PX = 1800

        /** The file opened and every page's size read. */
        suspend fun open(file: File): PdfPages = withContext(Dispatchers.IO) {
            val fd = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
            val renderer = runCatching { PdfRenderer(fd) }.getOrElse {
                fd.close()
                throw it
            }
            val sizes = (0 until renderer.pageCount).map { i -> renderer.openPage(i).use { PageSize(it.width, it.height) } }
            PdfPages(fd, renderer, sizes)
        }
    }
}
