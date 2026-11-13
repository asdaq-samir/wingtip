package app.wingtipmaps.android.plates

import android.graphics.Bitmap
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.core.graphics.createBitmap
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.R
import app.wingtipmaps.android.api.generated.PlateGeoreference
import app.wingtipmaps.android.design.Loading
import app.wingtipmaps.android.design.generated.WingtipColors
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.flight.FlightModel
import app.wingtipmaps.android.ui.DiagramPage
import app.wingtipmaps.android.ui.ProblemLine
import app.wingtipmaps.android.ui.WingtipIcons
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import me.saket.telephoto.zoomable.ZoomSpec
import me.saket.telephoto.zoomable.rememberZoomableState
import me.saket.telephoto.zoomable.zoomable
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
    Dialog(onDismissRequest = onClose, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(Modifier.fillMaxSize()) {
            Column(Modifier.fillMaxSize()) {
                Row(Modifier.fillMaxWidth().padding(start = WingtipSpace.Lg, end = WingtipSpace.Xs), verticalAlignment = Alignment.CenterVertically) {
                    Text(title, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                    IconButton(onClick = onClose) { Icon(WingtipIcons.close, contentDescription = stringResource(R.string.close)) }
                }
                Box(Modifier.weight(1f).fillMaxWidth().background(Color.White), contentAlignment = Alignment.Center) {
                    val read = page
                    val shown = read?.getOrNull()
                    when {
                        shown != null -> PlateWithOwnShip(shown, at)
                        read != null -> ProblemLine(stringResource(R.string.plate_no_page))
                        else -> Loading()
                    }
                }
            }
        }
    }
}

/** The page and the airplane on it, zoomed and panned together. */
@Composable
private fun PlateWithOwnShip(page: Bitmap, at: EngineContract.PlatePagePointAnswer?) {
    val zoom = rememberZoomableState(zoomSpec = ZoomSpec(maxZoomFactor = 8f))
    val you = stringResource(R.string.plate_you_are_here)
    BoxWithConstraints(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        val k = minOf(constraints.maxWidth / page.width.toFloat(), constraints.maxHeight / page.height.toFloat())
        val density = LocalDensity.current
        val w = with(density) { (page.width * k).toDp() }
        val h = with(density) { (page.height * k).toDp() }
        Box(Modifier.size(w, h).zoomable(zoom)) {
            Image(page.asImageBitmap(), contentDescription = null, modifier = Modifier.fillMaxSize())
            if (at != null) {
                Canvas(Modifier.fillMaxSize().semantics { contentDescription = you }) {
                    val centre = Offset((at.x * size.width).toFloat(), (at.y * size.height).toFloat())
                    val r = OWN_SHIP.toPx()
                    drawCircle(Color.White, radius = r + 3.dp.toPx(), center = centre)
                    val turn = at.rotationDeg
                    if (turn == null) {
                        drawCircle(WingtipColors.Chart.MapBlue, radius = r * 0.7f, center = centre)
                        return@Canvas
                    }
                    rotate(turn.toFloat(), pivot = centre) {
                        val arrow = Path().apply {
                            moveTo(centre.x, centre.y - r)
                            lineTo(centre.x + r * 0.7f, centre.y + r * 0.8f)
                            lineTo(centre.x, centre.y + r * 0.35f)
                            lineTo(centre.x - r * 0.7f, centre.y + r * 0.8f)
                            close()
                        }
                        drawPath(arrow, WingtipColors.Chart.MapBlue)
                    }
                }
            }
        }
    }
}

/** Own ship's size on the page, the airport diagram's. */
private val OWN_SHIP = 11.dp

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
