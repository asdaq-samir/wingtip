package app.wingtipmaps.android.plates

import android.graphics.Bitmap
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.OpenInNew
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
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
import app.wingtipmaps.android.ui.isWide
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
 *
 * Markup in its bar for the pilot's ink on it (ChartInk, kept by the
 * plate and its cycle), and on a wide window Open in New Window, the
 * plate in a window of its own beside the map (PlateWindowActivity),
 * which the plate's own window (`inWindow`) does not offer again.
 */
@Composable
fun PlateViewer(title: String, url: String, georeference: PlateGeoreference?, onClose: () -> Unit, inWindow: Boolean = false, flight: FlightModel = hiltViewModel()) {
    val context = LocalContext.current
    val cache = context.cacheDir
    val page by produceState<Result<Bitmap?>?>(null, url) { value = runCatching { readPlate(url, cache) } }
    val fix by flight.ownShip.fix.collectAsStateWithLifecycle()
    val at = PlatePosition.of(fix, georeference).getOrNull()
    val ink = rememberChartInk(url)
    val wide = isWide()
    FullScreenPage(
        title,
        onClose,
        actions = {
            ChartInkButton(ink)
            if (wide && !inWindow) {
                IconButton(onClick = {
                    context.startActivity(PlateWindow.intent(context, PlateWindow(title, url, georeference)))
                    onClose()
                }) { Icon(Icons.AutoMirrored.Filled.OpenInNew, contentDescription = stringResource(R.string.plate_new_window)) }
            }
        },
        footer = { ChartInkBar(ink) },
    ) {
        val read = page
        val shown = read?.getOrNull()
        when {
            shown != null -> ZoomablePage(shown, null, at?.let { PageMark(it.x, it.y, it.rotationDeg) }, ink.pageInk())
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
