package app.wingtipmaps.android.plates

import android.graphics.Bitmap
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import androidx.core.graphics.createBitmap
import app.wingtipmaps.android.offline.ChartKeeper
import app.wingtipmaps.android.offline.KeptForAir
import app.wingtipmaps.android.ui.DiagramPage
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File

/** An approach plate's page as a picture, for the full-screen viewer
 *  (PlateViewer) and the pane beside the map (PlateBesidePane) alike. */
object PlatePage {
    /** The plate's PDF, its first page drawn three times its size, as the
     *  airport diagram's is (DiagramPage): the one kept for the air or with
     *  a state's plates (ChartKeeper) first, so it opens with no signal;
     *  else the FAA's, kept in the cache. */
    suspend fun read(url: String, cache: File): Bitmap? = withContext(Dispatchers.IO) {
        val file = KeptForAir.current?.let { ChartKeeper(it).file(url) }?.takeIf { it.isFile } ?: File(cache, "plate-${url.hashCode()}.pdf")
        if (!file.exists()) DiagramPage.download(url, file)
        ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY).use { fd ->
            PdfRenderer(fd).use { renderer ->
                if (renderer.pageCount < 1) return@withContext null
                renderer.openPage(0).use { pdf ->
                    val bitmap = createBitmap(pdf.width * 3, pdf.height * 3)
                    bitmap.eraseColor(android.graphics.Color.WHITE)
                    pdf.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                    bitmap
                }
            }
        }
    }
}
