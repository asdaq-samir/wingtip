package app.wingtipmaps.android.altitude

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraintsScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.wrapContentSize
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.clearAndSetSemantics
import app.wingtipmaps.android.api.generated.RouteWeather
import app.wingtipmaps.android.design.generated.WingtipColors
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.format.Format
import java.time.OffsetDateTime

/** How wide a TAF station's cloud base is drawn along the route, a share
 *  of it either side: a mark at the station, not a deck across the chart
 *  (the web's CLOUD_HALF). */
private const val CLOUD_HALF = 0.05

/** An obstacle's post by the engine's level: the ground's red or amber,
 *  else the chart's obstacle colour. */
private fun postColour(level: String?): Color = when (level) {
    "warning" -> WingtipColors.Chart.Warning
    "caution" -> WingtipColors.Chart.Caution
    else -> WingtipColors.Chart.Obstacle
}

/**
 * What the side view draws over its ground beside the airspace (the web's
 * ProfileHazards' HazardMarks): the G-AIRMETs' icing as bands between their
 * altitudes, from the freezing level where they say so; the freezing level
 * a dashed line along the route; each TAF station's cloud base a dashed bar
 * at the station; and each obstacle a post from its ground to its top (the
 * DOF's AGL under its AMSL) in the engine's level. Only drawn, nothing
 * worked out: the planner's weather and the engine's levels.
 */
internal fun DrawScope.hazards(
    obstacles: List<AltitudeEngine.Obstacle>,
    weather: RouteWeather?,
    lengthNm: Double,
    top: Double,
    x: (Double) -> Float,
    y: (Double) -> Float,
) {
    val freezing = weather?.freezing.orEmpty().filter { it.ft <= top }
    val lowestFreezing = freezing.minOfOrNull { it.ft }
    weather?.icing.orEmpty().forEach { ice ->
        val low = ice.lowFt ?: (if (ice.fromFreezingLevel == true) lowestFreezing else null) ?: 0.0
        val high = minOf(ice.highFt ?: low, top)
        val at = Offset(x(ice.fromNm), y(high))
        val box = Size(maxOf(1f, x(ice.toNm) - x(ice.fromNm)), maxOf(1f, y(low) - y(high)))
        drawRect(WingtipColors.Weather.Icing.copy(alpha = 0.14f), at, box)
        drawRect(WingtipColors.Weather.Icing.copy(alpha = 0.6f), at, box, style = Stroke(width = 1.5f, pathEffect = PathEffect.dashPathEffect(floatArrayOf(4f, 4f))))
    }
    if (freezing.size > 1) {
        val path = Path().apply {
            moveTo(x(freezing[0].alongNm), y(freezing[0].ft))
            freezing.drop(1).forEach { lineTo(x(it.alongNm), y(it.ft)) }
        }
        drawPath(path, WingtipColors.Weather.Icing, style = Stroke(width = 3f, pathEffect = PathEffect.dashPathEffect(floatArrayOf(10f, 6f))))
    }
    weather?.clouds.orEmpty().filter { it.baseFt <= top }.forEach { c ->
        val from = Offset(x(maxOf(0.0, c.alongNm - CLOUD_HALF * lengthNm)), y(c.baseFt))
        val to = Offset(x(minOf(lengthNm, c.alongNm + CLOUD_HALF * lengthNm)), y(c.baseFt))
        drawLine(WingtipColors.Weather.Mountains, from, to, strokeWidth = 6f, pathEffect = PathEffect.dashPathEffect(floatArrayOf(8f, 4f)))
    }
    obstacles.forEach { o ->
        val foot = o.amslFt - (o.aglFt ?: 0.0)
        drawLine(postColour(o.level), Offset(x(o.alongNm), y(foot)), Offset(x(o.alongNm), y(minOf(o.amslFt, top))), strokeWidth = 3f)
    }
}

/** The named obstacles' heights over their tops, as the sectional prints
 *  one (AMSL, AGL in brackets: FAA Aeronautical Chart User's Guide,
 *  Obstructions): words over the chart, not read by TalkBack, which hears
 *  the clearance in words under it. */
@Composable
internal fun BoxWithConstraintsScope.ObstacleNames(obstacles: List<AltitudeEngine.Obstacle>, lengthNm: Double, top: Double) {
    obstacles.filter { it.named }.forEach { o ->
        val left = maxWidth * (o.alongNm / lengthNm).toFloat()
        val above = maxHeight * (1 - minOf(o.amslFt, top) / top).toFloat()
        Text(
            ProfileKey.obstacleName(o),
            style = MaterialTheme.typography.labelSmall,
            modifier = Modifier
                .offset(x = left, y = above)
                // Centred over its post and standing on its top.
                .layout { m, c ->
                    val p = m.measure(c)
                    layout(p.width, p.height) { p.place(-p.width / 2, -p.height) }
                }
                .background(MaterialTheme.colorScheme.surface.copy(alpha = 0.8f), RoundedCornerShape(WingtipSpace.Xxs))
                .wrapContentSize()
                .testTag("profile-obstacle-name")
                .clearAndSetSemantics {},
        )
    }
}

/** Whose each weather line on the side view is and for when, the web's
 *  WeatherKey's words, the figures in the app's own formats. */
object ProfileKey {
    enum class Kind { CLOUDS, FREEZING, ICING, UNAVAILABLE }

    data class Line(val kind: Kind, val words: String)

    /** "2,049 ft (1,999 ft)": its top MSL, its height over its ground. */
    fun obstacleName(o: AltitudeEngine.Obstacle): String =
        Format.altitude(o.amslFt) + (o.aglFt?.let { " (${Format.altitude(it)})" } ?: "")

    /** An ISO time as reports give it, "1120Z"; "" with none or one unread. */
    fun zulu(iso: String?): String = iso?.let { runCatching { Format.zulu(OffsetDateTime.parse(it).toInstant()) }.getOrNull() }.orEmpty()

    fun lines(weather: RouteWeather): List<Line> = buildList {
        for (c in weather.clouds) add(Line(Kind.CLOUDS, "Ceiling ${Format.altitude(c.baseFt)} · ${c.station} TAF ${zulu(c.issued)}".trim()))
        val source = weather.freezingSource
        val low = weather.freezing.minOfOrNull { it.ft }
        if (low != null && source != null) {
            val run = zulu(source.run).takeIf { it.isNotEmpty() }?.let { " $it run" }.orEmpty()
            val valid = zulu(source.validAt).takeIf { it.isNotEmpty() }?.let { ", for $it" }.orEmpty()
            add(Line(Kind.FREEZING, "Freezing level from ${Format.altitude(low)} · ${source.label}$run$valid"))
        }
        for (ice in weather.icing) {
            val high = ice.highFt ?: 0.0
            val band = if (ice.fromFreezingLevel == true) "FZL–${Format.altitude(high)}" else Format.altitudeRange(ice.lowFt ?: 0.0, high)
            val issued = zulu(ice.issued).takeIf { it.isNotEmpty() }?.let { ", issued $it" }.orEmpty()
            add(Line(Kind.ICING, "Icing $band · G-AIRMET for ${zulu(ice.validAt)}$issued"))
        }
        for (gone in weather.unavailable.orEmpty()) {
            val what = when (gone) {
                "clouds" -> "Cloud bases"
                "freezing" -> "Freezing level"
                else -> "Icing"
            }
            add(Line(Kind.UNAVAILABLE, "$what not available"))
        }
    }
}

/** The key under the side view: each weather line's colour and words. */
@Composable
fun ProfileWeatherKey(weather: RouteWeather?, modifier: Modifier = Modifier) {
    val lines = weather?.let(ProfileKey::lines).orEmpty()
    if (lines.isEmpty()) return
    Column(modifier.testTag("profile-weather-key"), verticalArrangement = Arrangement.spacedBy(WingtipSpace.Xs)) {
        lines.forEach { line ->
            val colour = when (line.kind) {
                ProfileKey.Kind.CLOUDS -> WingtipColors.Weather.Mountains
                ProfileKey.Kind.FREEZING, ProfileKey.Kind.ICING -> WingtipColors.Weather.Icing
                ProfileKey.Kind.UNAVAILABLE -> WingtipColors.Chart.FieldUnknown
            }
            Row(horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Sm), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.width(WingtipSpace.Md).height(WingtipSpace.Xxs).background(colour).clearAndSetSemantics {})
                Text(line.words, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}
