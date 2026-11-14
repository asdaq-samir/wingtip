package app.wingtipmaps.android.map

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import androidx.core.graphics.createBitmap
import androidx.core.graphics.toColorInt
import app.wingtipmaps.android.design.generated.WingtipColors
import app.wingtipmaps.android.route.RoutePoint
import app.wingtipmaps.android.tiles.TileGrid
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject
import org.maplibre.android.maps.ImageContent
import org.maplibre.android.maps.ImageStretches
import org.maplibre.android.maps.Style
import org.maplibre.android.style.expressions.Expression
import org.maplibre.android.style.layers.CircleLayer
import org.maplibre.android.style.layers.PropertyFactory
import org.maplibre.android.style.layers.SymbolLayer
import org.maplibre.android.style.sources.GeoJsonSource
import kotlin.math.atan2
import kotlin.math.hypot
import kotlin.math.roundToInt

/**
 * Where the route turns (the owner's option A, 2026-11-14; docs/design
 * rules.md §10; the web's routeTurns and routeMarks): a point flown
 * through -- a VFR or GPS waypoint, a present position -- is a small white
 * dot ringed in the course's magenta exactly where the legs meet, always
 * drawn and taking no room, and its name sits on its own white pill edged
 * in the waypoint magenta beside it, on the outside of the turn, never on
 * the line, so the turn and own ship on it stay in sight. The fields keep
 * their own chart mark. The side follows the map as it turns (`turn`).
 */
object RouteTurns {
    private const val SOURCE = "route-turns"
    private const val DOTS = "route-fix-dots"
    private const val NAMES = "route-fixes"
    private const val PILL = "route-point-pill"

    /** Ems of the name's words from the point (the web's NEAR and
     *  DIAGONAL): clear of the dot and the pill's own edge. */
    private const val NEAR = 1.4f
    private const val DIAGONAL = 1.1f

    /** Eight sides, clockwise from up: the name's anchor (its side facing
     *  the point) and its offset, ems (the web's SIDES). */
    val SIDES: List<Pair<String, Array<Float>>> = listOf(
        "bottom" to arrayOf(0f, -NEAR),
        "bottom-left" to arrayOf(DIAGONAL, -DIAGONAL),
        "left" to arrayOf(NEAR, 0f),
        "top-left" to arrayOf(DIAGONAL, DIAGONAL),
        "top" to arrayOf(0f, NEAR),
        "top-right" to arrayOf(-DIAGONAL, DIAGONAL),
        "right" to arrayOf(-NEAR, 0f),
        "bottom-right" to arrayOf(-DIAGONAL, -DIAGONAL),
    )

    /** The screen step from a to b on a north-up screen, x east and y
     *  down (Web Mercator, as the map draws it), as a unit; null where the
     *  two are one point. */
    private fun step(a: List<Double>, b: List<Double>): Pair<Double, Double>? {
        val dx = Math.toRadians(b[1] - a[1])
        val dy = TileGrid.mercatorY(a[0]) - TileGrid.mercatorY(b[0])
        val n = hypot(dx, dy)
        return if (n > 1e-12) dx / n to dy / n else null
    }

    private fun legFrom(line: List<List<Double>>, i: Int, by: Int): Pair<Double, Double>? {
        var j = i + by
        while (j in line.indices) {
            step(line[i], line[j])?.let { return it }
            j += by
        }
        return null
    }

    /**
     * The side a point's name goes, degrees clockwise from up on a
     * north-up screen: away from the turn at the course line's vertex
     * nearest the point (`line` the course's [lat, lon] points). The two
     * legs leaving the point, added, point into the turn; on a straight
     * point or the route's first or last, square to the course on its
     * upper side.
     */
    fun outsideOfTurn(line: List<List<Double>>, lat: Double, lon: Double): Int {
        if (line.size < 2) return 0
        val i = line.indices.minBy { (line[it][0] - lat).let { d -> d * d } + (line[it][1] - lon).let { d -> d * d } }
        val back = legFrom(line, i, -1)
        val ahead = legFrom(line, i, 1)
        val into = if (back != null && ahead != null) back.first + ahead.first to back.second + ahead.second else null
        val turning = into != null && hypot(into.first, into.second) > 0.05
        var out = if (turning) {
            -into.first to -into.second
        } else {
            // Straight on, or the route's end: square to the course, the upper side.
            val along = ahead ?: back ?: (1.0 to 0.0)
            along.second to -along.first
        }
        if (!turning && (out.second > 0 || (out.second == 0.0 && out.first < 0))) out = -out.first to -out.second
        val deg = Math.toDegrees(atan2(out.first, -out.second))
        return ((deg + 360) % 360).roundToInt() % 360
    }

    /** Which of the eight SIDES a name takes with the map turned `bearing`
     *  degrees: the point's `out` less the bearing, to the nearest. */
    fun sideOf(out: Int, bearing: Double): Int = (((out + 720 - bearing.roundToInt()) % 360) / 45.0).roundToInt() % 8

    /** The route's fixes as GeoJSON points, each with its name and side. */
    fun json(line: List<List<Double>>, points: List<RoutePoint>): String = buildJsonObject {
        put("type", "FeatureCollection")
        putJsonArray("features") {
            for (p in points.filter { it.fix }) {
                add(
                    buildJsonObject {
                        put("type", "Feature")
                        putJsonObject("geometry") {
                            put("type", "Point")
                            putJsonArray("coordinates") { add(JsonPrimitive(p.lon)); add(JsonPrimitive(p.lat)) }
                        }
                        putJsonObject("properties") {
                            put("ident", p.ident)
                            put("out", outsideOfTurn(line, p.lat, p.lon))
                        }
                    },
                )
            }
        }
    }.toString()

    /** The dots and names for the route, added once over the route's line
     *  and under the overlays' marks (just `above` the style's route slot),
     *  and their points set anew. */
    fun draw(style: Style, line: List<List<Double>>, points: List<RoutePoint>, density: Float, above: String) {
        val geoJson = json(line, points)
        style.getSourceAs<GeoJsonSource>(SOURCE)?.let {
            it.setGeoJson(geoJson)
            return
        }
        style.addSource(GeoJsonSource(SOURCE, geoJson))
        pill(density).let { (bitmap, i) ->
            val w = bitmap.width.toFloat()
            val h = bitmap.height.toFloat()
            style.addImage(PILL, bitmap, listOf(ImageStretches(i, w - i)), listOf(ImageStretches(i, h - i)), ImageContent(i, i, w - i, h - i))
        }
        val dots = CircleLayer(DOTS, SOURCE).withProperties(
            PropertyFactory.circleRadius(4f),
            PropertyFactory.circleColor(WingtipColors.Chart.CASING_HEX),
            PropertyFactory.circleStrokeColor(WingtipColors.Chart.COURSE_HEX),
            PropertyFactory.circleStrokeWidth(3f),
        )
        val names = SymbolLayer(NAMES, SOURCE).withProperties(
            PropertyFactory.textField(Expression.get("ident")),
            PropertyFactory.textFont(arrayOf(MapStyle.FONT)),
            PropertyFactory.textSize(11f),
            PropertyFactory.textColor(WingtipColors.Chart.FIX_INK_HEX),
            PropertyFactory.iconImage(PILL),
            PropertyFactory.iconTextFit(org.maplibre.android.style.layers.Property.ICON_TEXT_FIT_BOTH),
            PropertyFactory.iconTextFitPadding(arrayOf(2f, 6f, 2f, 6f)),
        )
        if (style.getLayer(above) != null) {
            style.addLayerAbove(dots, above)
            style.addLayerAbove(names, DOTS)
        } else {
            style.addLayer(dots)
            style.addLayer(names)
        }
        turn(style, 0.0)
    }

    /** The names put on their side for a map turned `bearing` degrees
     *  (the web's turnSide, RouteGl setting it as the map rotates). */
    fun turn(style: Style, bearing: Double) {
        val turned = Expression.mod(Expression.sum(Expression.get("out"), Expression.literal(720 - bearing.roundToInt())), Expression.literal(360))
        val sector = Expression.mod(Expression.round(Expression.division(turned, Expression.literal(45))), Expression.literal(8))
        val anchors = SIDES.mapIndexed { i, (a, _) -> Expression.stop(i, a) }.toTypedArray()
        val offsets = SIDES.mapIndexed { i, (_, o) -> Expression.stop(i, Expression.literal(o)) }.toTypedArray()
        style.getLayerAs<SymbolLayer>(NAMES)?.setProperties(
            PropertyFactory.textAnchor(Expression.match(sector, Expression.literal(SIDES[0].first), *anchors)),
            PropertyFactory.textOffset(Expression.match(sector, Expression.literal(SIDES[0].second), *offsets)),
        )
    }

    /** The name's pill: white edged in the sectional's waypoint magenta
     *  (the web's ROUTE_POINT_PILL), and its stretch inset, px. */
    private fun pill(density: Float): Pair<Bitmap, Float> {
        val px = (20 * density).roundToInt().coerceAtLeast(1)
        val bitmap = createBitmap(px, px)
        bitmap.density = (density * 160).roundToInt()
        val canvas = Canvas(bitmap)
        canvas.scale(density, density)
        val box = RectF(0.75f, 0.75f, 19.25f, 19.25f)
        canvas.drawRoundRect(box, 9.25f, 9.25f, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = WingtipColors.Chart.CASING_HEX.toColorInt() })
        canvas.drawRoundRect(
            box, 9.25f, 9.25f,
            Paint(Paint.ANTI_ALIAS_FLAG).apply {
                style = Paint.Style.STROKE
                strokeWidth = 1.5f
                color = WingtipColors.Chart.WAYPOINT_HEX.toColorInt()
            },
        )
        return bitmap to 9.5f * density
    }
}
