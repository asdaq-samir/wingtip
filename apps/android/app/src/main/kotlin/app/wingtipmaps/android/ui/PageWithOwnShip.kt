package app.wingtipmaps.android.ui

import android.graphics.Bitmap
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
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
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import app.wingtipmaps.android.R
import app.wingtipmaps.android.design.generated.WingtipColors
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.library.MarkLayer
import app.wingtipmaps.android.library.PageInk
import me.saket.telephoto.zoomable.ZoomSpec
import me.saket.telephoto.zoomable.rememberZoomableState
import me.saket.telephoto.zoomable.zoomable

/**
 * One of the FAA's pages full screen, the airport diagram's and an
 * approach plate's alike: a full-screen dialog, its title and ✕ at the
 * top with the page's own `actions` before the ✕, the page on white
 * under them, and what goes under the page (`footer`). Back closes it, the Dialog's own.
 */
@Composable
fun FullScreenPage(
    title: String,
    onClose: () -> Unit,
    actions: @Composable RowScope.() -> Unit = {},
    footer: @Composable ColumnScope.() -> Unit = {},
    page: @Composable BoxScope.() -> Unit,
) {
    Dialog(onDismissRequest = onClose, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(Modifier.fillMaxSize()) {
            Column(Modifier.fillMaxSize()) {
                Row(Modifier.fillMaxWidth().padding(start = WingtipSpace.Lg, end = WingtipSpace.Xs), verticalAlignment = Alignment.CenterVertically) {
                    Text(title, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                    actions()
                    IconButton(onClick = onClose) { Icon(WingtipIcons.close, contentDescription = stringResource(R.string.close)) }
                }
                Box(Modifier.weight(1f).fillMaxWidth().background(Color.White), contentAlignment = Alignment.Center, content = page)
                footer()
            }
        }
    }
}

/** Own ship on a page: where, as a fraction of the page's width and
 *  height from its top left, and its turn on the page in degrees, null
 *  with no track to turn it by (drawn as a circle, not an arrow). */
class PageMark(val x: Double, val y: Double, val turnDeg: Double?)

/** A ring on a page round a place it marks, as a fraction of the page's
 *  width and height from its top left: an airport diagram's hot spot,
 *  its label (DiagramPage.hotSpots), said by TalkBack as `name`. */
class PageRing(val x: Double, val y: Double, val name: String)

/**
 * The page and the airplane on it, zoomed and panned together by
 * telephoto's Modifier.zoomable (pinch, double tap, fling, up to eight
 * times): the map's own ship, white-ringed, an arrow turned to `mark`'s
 * turn, or a circle without one. With `ink`, the pilot's marks over it
 * (MarkLayer), the page held still while they mark; with `rings`, the
 * diagram's hot spots ringed (HotSpotRings).
 */
@Composable
fun ZoomablePage(page: Bitmap, description: String?, mark: PageMark?, ink: PageInk? = null, rings: List<PageRing> = emptyList()) {
    val zoom = rememberZoomableState(zoomSpec = ZoomSpec(maxZoomFactor = 8f))
    val image = remember(page) { page.asImageBitmap() }
    val you = stringResource(R.string.plate_you_are_here)
    BoxWithConstraints(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        val k = minOf(constraints.maxWidth / page.width.toFloat(), constraints.maxHeight / page.height.toFloat())
        val density = LocalDensity.current
        val w = with(density) { (page.width * k).toDp() }
        val h = with(density) { (page.height * k).toDp() }
        // The page holds still while it is marked, the ink taking the touches.
        val still = ink?.marking?.pen != null
        Box(if (still) Modifier.size(w, h) else Modifier.size(w, h).zoomable(zoom)) {
            Image(image, contentDescription = description, modifier = Modifier.fillMaxSize())
            if (ink != null) MarkLayer(ink.marks, 1, page.width * k, page.height * k, ink.marking, ink.onMarked)
            if (rings.isNotEmpty()) HotSpotRings(rings)
            if (mark != null) {
                Canvas(Modifier.fillMaxSize().semantics { contentDescription = you }) {
                    val centre = Offset((mark.x * size.width).toFloat(), (mark.y * size.height).toFloat())
                    val r = OWN_SHIP.toPx()
                    drawCircle(Color.White, radius = r + 3.dp.toPx(), center = centre)
                    val turn = mark.turnDeg
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

/** The hot spots ringed in the caution ink over the FAA's own circle and
 *  label, which stay as the FAA drew them under it. */
@Composable
private fun HotSpotRings(rings: List<PageRing>) {
    val said = rings.joinToString { "Hot spot ${it.name.removePrefix("HS").trim()}" }
    Canvas(Modifier.fillMaxSize().semantics { contentDescription = said }) {
        rings.forEach { ring ->
            val centre = Offset((ring.x * size.width).toFloat(), (ring.y * size.height).toFloat())
            drawCircle(WingtipColors.Chart.Caution, radius = HOT_SPOT.toPx(), center = centre, style = Stroke(width = 3.dp.toPx()))
        }
    }
}

/** A hot spot's ring on a page: round the FAA's label beside its circle. */
private val HOT_SPOT = 18.dp

/** Own ship's size on a page. */
private val OWN_SHIP = 11.dp
