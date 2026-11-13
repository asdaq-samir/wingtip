package app.wingtipmaps.android.ui

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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.AppClock
import app.wingtipmaps.android.design.Loading
import app.wingtipmaps.android.design.generated.WingtipColors
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.flight.OwnShip
import me.saket.telephoto.zoomable.ZoomSpec
import me.saket.telephoto.zoomable.rememberZoomableState
import me.saket.telephoto.zoomable.zoomable

/**
 * The FAA's airport diagram with the airplane on it (#218), as the iOS
 * app's DiagramOwnShipView: the d-TPP's PDF drawn on the phone
 * (PdfRenderer), and own ship placed by the diagram's own latitude and
 * longitude labels (the engine's diagram_labels, diagram_graticule and
 * diagram_point; the free d-TPP's diagrams carry no GeoPDF
 * georeference). Android reads a page's text and where it is drawn from
 * Android 15's PDF extension (SDK extension 13); before it, or on a
 * diagram with no labels (KORD's), the diagram is shown without the
 * airplane, and says so.
 *
 * For a pilot's awareness on the ground, not for navigation: the signs,
 * the markings and ATC's taxi instructions are what count (AC 120-74B;
 * AC 120-76D 11.17.1, "use of external visual references is sufficient
 * for maneuvering" on the ground). Own ship follows AC 120-76D 11.17.2: a
 * circle, not an arrow, with no track (11.17.2.2), and gone once the fix
 * is older than three seconds or worse than 30 m (11.17.2.3, 11.17.2.4's
 * 30 m), never frozen.
 */
@Composable
fun DiagramOwnShipDialog(ident: String, url: String, onClose: () -> Unit, model: DiagramModel = hiltViewModel()) {
    val read by model.state.collectAsStateWithLifecycle()
    val flight by model.flight.collectAsStateWithLifecycle()
    // The clock, each second, so a fix that stops coming takes the
    // airplane off rather than freezing it.
    val nowMs by AppClock.ticking()
    // A failed check is said under the page (DiagramPage.note), and the
    // airplane is not drawn on a fix the engine could not judge.
    val fixAsked = model.usable(flight.fix, nowMs)
    val fix = fixAsked.getOrNull()
    // Read as the dialog opens; its page let go of as it closes.
    DisposableEffect(ident, url) {
        model.open(ident, url)
        onDispose { model.close() }
    }
    Dialog(onDismissRequest = onClose, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        // Back closes it, the Dialog's own.
        Surface(Modifier.fillMaxSize()) {
            Column(Modifier.fillMaxSize()) {
                Row(Modifier.fillMaxWidth().padding(start = WingtipSpace.Lg, end = WingtipSpace.Xs), verticalAlignment = Alignment.CenterVertically) {
                    Text("$ident airport diagram", style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                    IconButton(onClick = onClose) { Icon(Icons.Filled.Close, contentDescription = "Close") }
                }
                Box(Modifier.weight(1f).fillMaxWidth().background(Color.White), contentAlignment = Alignment.Center) {
                    val shown = read.page
                    when {
                        shown != null -> DiagramWithOwnShip(shown, fix, fix?.let { model.place(shown, it) })
                        read.problem != null -> ProblemLine(read.problem)
                        else -> Loading()
                    }
                }
                read.page?.let {
                    Text(
                        model.note(it, fixAsked),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(WingtipSpace.Md),
                    )
                }
            }
        }
    }
}

/** The page and the airplane on it, zoomed and panned together by
 *  telephoto's Modifier.zoomable (pinch, double tap, fling, up to eight
 *  times, as the hand-made zoom allowed). */
@Composable
private fun DiagramWithOwnShip(page: DiagramPage, fix: OwnShip.Fix?, placed: EngineContract.DiagramPointAnswer?) {
    val zoom = rememberZoomableState(zoomSpec = ZoomSpec(maxZoomFactor = 8f))
    val at = placed?.takeIf { it.onPage }
    BoxWithConstraints(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        val k = minOf(constraints.maxWidth / page.width, constraints.maxHeight / page.height)
        val density = LocalDensity.current
        val w = with(density) { (page.width * k).toDp() }
        val h = with(density) { (page.height * k).toDp() }
        Box(Modifier.size(w, h).zoomable(zoom)) {
            Image(page.image.asImageBitmap(), contentDescription = "Airport diagram", modifier = Modifier.fillMaxSize())
            if (at != null) {
                val track = fix?.trackDeg
                val turn = ((page.graticule?.northDeg ?: 0.0) + (track ?: 0.0)).toFloat()
                Canvas(Modifier.fillMaxSize().semantics { contentDescription = "You are here" }) {
                    val centre = Offset((at.x * k).toFloat(), (at.y * k).toFloat())
                    val r = 11.dp.toPx()
                    drawCircle(Color.White, radius = r + 3.dp.toPx(), center = centre)
                    // No track: a circle, not an arrow (AC 120-76D 11.17.2.2).
                    if (track == null) {
                        drawCircle(WingtipColors.Chart.MapBlue, radius = r * 0.7f, center = centre)
                        return@Canvas
                    }
                    rotate(turn, pivot = centre) {
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
