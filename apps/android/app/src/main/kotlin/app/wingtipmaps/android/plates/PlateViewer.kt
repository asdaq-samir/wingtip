package app.wingtipmaps.android.plates

import android.graphics.Bitmap
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.core.graphics.createBitmap
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.R
import app.wingtipmaps.android.api.generated.PlateGeoreference
import app.wingtipmaps.android.design.Loading
import app.wingtipmaps.android.flight.FlightModel
import app.wingtipmaps.android.ui.DiagramPage
import app.wingtipmaps.android.ui.FullScreenPage
import app.wingtipmaps.android.ui.PageMark
import app.wingtipmaps.android.ui.ProblemLine
import app.wingtipmaps.android.ui.ZoomablePage
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File

/**
 * An approach plate full screen in the app, as ForeFlight's geo-referenced
 * plates are (the owner, 2026-11-13): the FAA's own page drawn on the
 * phone (PdfRenderer, three times its size, as the airport diagram is)
 * in a full-screen dialog, pinched, panned and double-tapped with
 * telephoto's zoomable, and own ship on it -- the map's airplane turned
 * to the GPS's track on the page, moving at each fix -- where the engine
 * places it (PlatePosition): inside the plan view only, and not at all on
 * a page with no georeference or with own ship off. Back closes it.
 */
@Composable
fun PlateViewer(title: String, url: String, georeference: PlateGeoreference?, onClose: () -> Unit, flight: FlightModel = hiltViewModel()) {
    val cache = LocalContext.current.cacheDir
    val page by produceState<Result<Bitmap?>?>(null, url) { value = runCatching { readPlate(url, cache) } }
    val fix by flight.ownShip.fix.collectAsStateWithLifecycle()
    val at = PlatePosition.of(fix, georeference).getOrNull()
    FullScreenPage(title, onClose) {
        val read = page
        val shown = read?.getOrNull()
        when {
            shown != null -> ZoomablePage(shown, null, at?.let { PageMark(it.x, it.y, it.rotationDeg) })
            read != null -> ProblemLine(stringResource(R.string.plate_no_page))
            else -> Loading()
        }
    }
}

/** The plate's PDF from the FAA, kept in the cache, its first page drawn
 *  three times its size, as the airport diagram's is (DiagramPage). */
private suspend fun readPlate(url: String, cache: File): Bitmap? = withContext(Dispatchers.IO) {
    val file = File(cache, "plate-${url.hashCode()}.pdf")
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
