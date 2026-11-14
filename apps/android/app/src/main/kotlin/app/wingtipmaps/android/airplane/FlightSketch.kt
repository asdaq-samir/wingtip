package app.wingtipmaps.android.airplane

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.tiles.TileGrid

/** A point of a sketch on the Web Mercator plane: x the longitude in
 *  radians, y the projection's northing, so the shape is the chart's. */
internal data class SketchPoint(val x: Double, val y: Double)

/** The points scaled into a box of `w` by `h` with `pad` round it, north
 *  up and the shape's own proportions kept (one scale for both ways). */
internal fun sketchFit(lats: List<Double>, lons: List<Double>, w: Float, h: Float, pad: Float): List<Offset> {
    val pts = lats.indices.map { SketchPoint(Math.toRadians(lons[it]), TileGrid.mercatorY(lats[it])) }
    if (pts.isEmpty()) return emptyList()
    val minX = pts.minOf { it.x }
    val maxX = pts.maxOf { it.x }
    val minY = pts.minOf { it.y }
    val maxY = pts.maxOf { it.y }
    val spanX = (maxX - minX).takeIf { it > 0 } ?: 1e-9
    val spanY = (maxY - minY).takeIf { it > 0 } ?: 1e-9
    val scale = minOf((w - 2 * pad) / spanX, (h - 2 * pad) / spanY)
    val offX = (w - spanX * scale) / 2
    val offY = (h - spanY * scale) / 2
    return pts.map { p -> Offset((offX + (p.x - minX) * scale).toFloat(), (offY + (maxY - p.y) * scale).toFloat()) }
}

/**
 * Where an airplane has flown, sketched on a picture tile of its card as
 * the web's LiveSketch draws it: the path in the theme's tint on the
 * tile's plain ground, a dot where it is now (or was last), north up; its
 * words in place where there is nothing to draw ("Fetching its flights…",
 * "No flights heard").
 */
@Composable
fun FlightSketch(lats: List<Double>, lons: List<Double>, empty: String) {
    if (lats.size < 2) {
        Box(Modifier.fillMaxSize().padding(WingtipSpace.Lg), contentAlignment = Alignment.Center) {
            Text(empty, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        return
    }
    val ink = MaterialTheme.colorScheme.primary
    Canvas(Modifier.fillMaxSize()) {
        val pad = WingtipSpace.Xl.toPx()
        val at = sketchFit(lats, lons, size.width, size.height, pad)
        val path = Path().apply {
            moveTo(at.first().x, at.first().y)
            at.drop(1).forEach { lineTo(it.x, it.y) }
        }
        drawPath(path, ink, style = Stroke(width = WingtipSpace.Xs.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round))
        drawCircle(ink, radius = WingtipSpace.Sm.toPx(), center = at.last())
    }
}
