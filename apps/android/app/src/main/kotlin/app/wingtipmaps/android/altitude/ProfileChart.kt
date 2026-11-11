package app.wingtipmaps.android.altitude

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import app.wingtipmaps.android.api.generated.RouteProfile
import app.wingtipmaps.android.design.generated.WingtipColors
import app.wingtipmaps.android.design.generated.WingtipSize
import app.wingtipmaps.android.format.Format
import kotlin.math.ceil

/**
 * The route from the side, drawn with Compose's Canvas: the ground under
 * it in the chart's terrain brown, the Class B, C
 * and D it passes through as boxes floor to ceiling in the sectional's
 * blue and magenta (FAA Aeronautical Chart User's Guide, Airspace), the
 * plan's altitude line in the tint and the altitude previewed on the
 * slider as a dashed level across. The ground and obstacles near the
 * previewed altitude are drawn in the engine's bands (`profile_clearance`:
 * red under 500 ft, 14 CFR 91.119(c)'s least height, amber within
 * 1,000 ft, 91.119(b)'s). Each waypoint is a 48 dp target over the
 * chart that opens its altitude (LegAltitudeSheet). Nothing is worked out
 * here: the planner's side view and the engine's line and bands, drawn.
 * The chart is a picture for the eye; TalkBack hears the clearance on the
 * slider and each waypoint by name.
 */
@Composable
fun ProfileChart(
    profile: RouteProfile,
    line: List<Pair<Double, Double>>,
    waypoints: List<ProfileModel.Waypoint>,
    previewFt: Double?,
    clearance: AltitudeEngine.Clearance?,
    topFt: Double,
    onWaypoint: (ProfileModel.Waypoint) -> Unit,
    modifier: Modifier = Modifier,
) {
    val tint = MaterialTheme.colorScheme.primary
    BoxWithConstraints(modifier.testTag("profile-chart")) {
        val length = profile.lengthNm.coerceAtLeast(1.0)
        val top = topOf(profile, line, previewFt, topFt)
        Canvas(Modifier.fillMaxSize().clearAndSetSemantics {}) {
            val x = { nm: Double -> (nm / length * size.width).toFloat() }
            val y = { ft: Double -> (size.height * (1 - ft / top)).toFloat() }
            airspace(profile, x, y)
            ground(profile, clearance, x, y)
            if (line.size > 1) {
                val path = Path().apply {
                    moveTo(x(line[0].first), y(line[0].second))
                    line.drop(1).forEach { lineTo(x(it.first), y(it.second)) }
                }
                drawPath(path, tint, style = Stroke(width = 3f))
            }
            previewFt?.let { ft ->
                drawLine(tint, Offset(0f, y(ft)), Offset(size.width, y(ft)), strokeWidth = 2f, pathEffect = PathEffect.dashPathEffect(floatArrayOf(12f, 8f)))
            }
            // Each waypoint marked at the chart's foot, under its target.
            waypoints.forEach { w -> drawCircle(tint, radius = 5f, center = Offset(x(w.alongNm), size.height - 5f)) }
        }
        // The waypoints' targets, each 48 dp round its mark at the chart's foot.
        val half = WingtipSize.TapTarget / 2
        waypoints.forEach { w ->
            val at: Dp = with(LocalDensity.current) { (w.alongNm / length * constraints.maxWidth).toFloat().toDp() }
            val said = "${w.ident}, ${Format.cruiseAltitude(w.legFt)}"
            Box(
                Modifier
                    .offset(x = at - half, y = maxHeight - WingtipSize.TapTarget)
                    .size(WingtipSize.TapTarget)
                    .testTag("profile-waypoint-${w.ident}")
                    .clickable(role = Role.Button) { onWaypoint(w) }
                    .semantics { contentDescription = said },
            )
        }
    }
}

/** The chart's top, feet: a thousand above the highest thing drawn and 1,500 over, as the web's ProfileChart. */
internal fun topOf(profile: RouteProfile, line: List<Pair<Double, Double>>, previewFt: Double?, topFt: Double): Double {
    val highest = maxOf(
        profile.terrain.maxOfOrNull { it.groundFt } ?: 0.0,
        line.maxOfOrNull { it.second } ?: 0.0,
        profile.airspace.mapNotNull { it.ceilingFt }.maxOrNull() ?: 0.0,
        previewFt ?: 0.0,
        topFt,
    )
    return ceil((highest + 1500) / 1000) * 1000
}

/** The engine's band a height is in under the previewed altitude, or none. */
private fun bandOf(ft: Double, clearance: AltitudeEngine.Clearance?): Color? = when {
    clearance == null -> null
    ft >= clearance.redFromFt -> WingtipColors.Chart.Warning
    ft >= clearance.yellowFromFt -> WingtipColors.Chart.Caution
    else -> null
}

private fun DrawScope.ground(profile: RouteProfile, clearance: AltitudeEngine.Clearance?, x: (Double) -> Float, y: (Double) -> Float) {
    val t = profile.terrain
    if (t.size < 2) return
    // Each stretch between two samples filled in the band of its higher end.
    for (i in 0 until t.size - 1) {
        val a = t[i]
        val b = t[i + 1]
        val colour = bandOf(maxOf(a.groundFt, b.groundFt), clearance) ?: WingtipColors.Chart.Terrain
        val piece = Path().apply {
            moveTo(x(a.alongNm), size.height)
            lineTo(x(a.alongNm), y(a.groundFt))
            lineTo(x(b.alongNm), y(b.groundFt))
            lineTo(x(b.alongNm), size.height)
            close()
        }
        drawPath(piece, colour)
    }
}

private fun DrawScope.airspace(profile: RouteProfile, x: (Double) -> Float, y: (Double) -> Float) {
    profile.airspace.forEach { a ->
        val colour = when (a.airspaceClass) {
            "B", "D" -> WingtipColors.Chart.AirspaceBlue
            "C" -> WingtipColors.Chart.AirspaceMagenta
            else -> return@forEach
        }
        val ceiling = a.ceilingFt ?: return@forEach
        val left = x(a.fromNm)
        val topY = y(ceiling)
        val box = Size(x(a.toNm) - left, y(a.floorFt) - topY)
        drawRect(colour.copy(alpha = 0.12f), Offset(left, topY), box)
        val dashed = if (a.airspaceClass == "D") PathEffect.dashPathEffect(floatArrayOf(8f, 6f)) else null
        drawRect(colour, Offset(left, topY), box, style = Stroke(width = 2f, pathEffect = dashed))
    }
}
