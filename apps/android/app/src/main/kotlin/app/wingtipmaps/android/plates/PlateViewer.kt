package app.wingtipmaps.android.plates

import android.graphics.Bitmap
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.OpenInNew
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.R
import app.wingtipmaps.android.api.generated.PlateGeoreference
import app.wingtipmaps.android.design.Loading
import app.wingtipmaps.android.flight.FlightModel
import app.wingtipmaps.android.ui.FullScreenPage
import app.wingtipmaps.android.ui.PageMark
import app.wingtipmaps.android.ui.ProblemLine
import app.wingtipmaps.android.ui.ZoomablePage
import app.wingtipmaps.android.ui.isWide

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
    val page by produceState<Result<Bitmap?>?>(null, url) { value = runCatching { PlatePage.read(url, cache) } }
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
            shown != null -> PlateWithOwnShip(shown, georeference, flight, ink)
            read != null -> ProblemLine(stringResource(R.string.plate_no_page))
            else -> Loading()
        }
    }
}

/** The page with own ship on it, its own composable so that only it reads
 *  each fix: the bar, the ink's controls and the dialog are not drawn
 *  again each second. */
@Composable
private fun PlateWithOwnShip(page: Bitmap, georeference: PlateGeoreference?, flight: FlightModel, ink: ChartInk) {
    val fix by flight.ownShip.fix.collectAsStateWithLifecycle()
    val at = PlatePosition.of(fix, georeference).getOrNull()
    // White on black at night unless picked, no brighter than the chart (rememberPlateLook).
    val look = rememberPlateLook()
    ZoomablePage(page, null, at?.let { PageMark(it.x, it.y, it.rotationDeg) }, ink.pageInk(), inverted = look.inverted, brightness = look.brightness)
}
