package app.wingtipmaps.android.map

import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.view.View
import androidx.core.graphics.createBitmap
import androidx.core.graphics.toColorInt
import app.wingtipmaps.android.api.Leg
import app.wingtipmaps.android.design.generated.WingtipColors
import app.wingtipmaps.android.design.generated.WingtipMapLabel
import app.wingtipmaps.android.design.generated.WingtipMapZoom
import app.wingtipmaps.android.flight.OwnShip
import app.wingtipmaps.android.route.RoutePoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.json.add
import kotlinx.serialization.json.addJsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject
import org.maplibre.android.maps.MapView
import org.maplibre.android.maps.Style
import org.maplibre.android.style.expressions.Expression
import org.maplibre.android.style.layers.Layer
import org.maplibre.android.style.layers.Property
import org.maplibre.android.style.layers.PropertyFactory
import org.maplibre.android.style.layers.SymbolLayer
import org.maplibre.android.style.sources.GeoJsonSource

/**
 * The route's own words over the chart, and own ship's room, as the web's
 * routeMarks, LegPointsGl and OwnShipGl lay them (rules.md, "The route over
 * the whole country", the owner's iPhone screenshot, 2026-11-23): out over
 * the whole country the route is its line, its ends and its stops, named
 * clear of each other and of own ship.
 *
 * - A route field's ident on its dark pill, placed before every mark of
 *   the chart's (the layers above are placed first in MapLibre's
 *   collision), the destination's first (symbol-sort-key), beside the
 *   field on whichever side is free (variable anchors), so a Class B's
 *   or a chart field's ident gives way to it, never it to them.
 * - The tops of climb and descent from map.zoom.route-tags, a small
 *   diamond named on its white pill, none within OFF_THE_ENDS_NM of its
 *   leg's ends (the field's own ident is there), giving way to the
 *   route's idents.
 * - Own ship's room: MapLibre's LocationComponent is drawn without a
 *   place in the collision, so an empty picture the airplane's size at
 *   its fix, placed first of all, keeps every label off it (KORD's ident
 *   was drawn under the arrow).
 *
 * It follows its own flow, as StationLayer does: the plan's map hands it
 * the route (show) and the holder own ship (room); a style set anew has it
 * drawn again.
 */
object RouteMarksLayer {
    const val SOURCE = "route-marks"
    const val ROOM = "own-ship-room"
    const val IDENTS = "route-field-idents"
    const val TOPS = "leg-points"
    private const val DIAMOND = "leg-point-diamond"

    /** A top of climb's or descent's words and place. */
    data class Top(val words: String, val lat: Double, val lon: Double)

    /** What is drawn now: the route's fields in order, its tops, and own ship. */
    data class Shown(val fields: List<RoutePoint> = emptyList(), val tops: List<Top> = emptyList(), val ship: Pair<Double, Double>? = null)

    private val shown = MutableStateFlow(Shown())

    /** The route's fields and its legs' tops of climb and descent. */
    fun show(fields: List<RoutePoint>, legs: List<Leg>) = shown.update { it.copy(fields = fields, tops = topsOf(legs)) }

    /** Own ship's fix, or none. */
    fun room(fix: OwnShip.Fix?) = shown.update { it.copy(ship = fix?.let { f -> f.lat to f.lon }) }

    /** How near either end of its leg a top of climb or descent is not
     *  drawn, nautical miles: there it sits on the field, whose own mark
     *  says as much (the web's OFF_THE_ENDS_NM). A mark's room on the map,
     *  not a figure of flight. */
    private const val OFF_THE_ENDS_NM = 2.0

    /** Every leg's tops, not the first alone (the owner, 2026-11-20: "toc/tod
     *  on every leg if possible"), off its ends. */
    fun topsOf(legs: List<Leg>): List<Top> = legs.flatMap { leg ->
        listOfNotNull(
            leg.toc?.let { Triple("TOC", it.alongNm, it.lat to it.lon) },
            leg.tod?.let { Triple("TOD", it.alongNm, it.lat to it.lon) },
        ).filter { (_, along, _) -> along >= OFF_THE_ENDS_NM && leg.distanceNm - along >= OFF_THE_ENDS_NM }
            .map { (words, _, at) -> Top(words, at.first, at.second) }
    }

    fun follow(view: MapView) {
        var scope: CoroutineScope? = null
        var job: Job? = null
        view.addOnDidFinishLoadingStyleListener { redraw(view, shown.value) }
        view.addOnAttachStateChangeListener(object : View.OnAttachStateChangeListener {
            override fun onViewAttachedToWindow(v: View) {
                val s = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
                scope = s
                job = s.launch { shown.collect { redraw(view, it) } }
            }

            override fun onViewDetachedFromWindow(v: View) {
                job?.cancel()
                scope?.cancel()
            }
        })
    }

    private fun redraw(view: MapView, now: Shown) {
        val density = view.resources.displayMetrics.density
        view.getMapAsync { map -> map.getStyle { style -> draw(style, now, density) } }
    }

    private fun draw(style: Style, now: Shown, density: Float) {
        val json = geoJson(now)
        val source = style.getSourceAs<GeoJsonSource>(SOURCE)
        if (source != null) {
            source.setGeoJson(json)
            return
        }
        style.addImage(ROOM, createBitmap(Math.round(ROOM_DP * density), Math.round(ROOM_DP * density)))
        style.addImage(DIAMOND, diamond(density))
        style.addSource(GeoJsonSource(SOURCE, json))
        // Each under own ship's own layers, the later over the earlier:
        // the room on top, so placed first, then the idents, then the tops.
        val under = OwnShipPuck.under(style)
        for (layer in layers()) {
            if (style.getLayer(under) != null) style.addLayerBelow(layer, under) else style.addLayer(layer)
        }
    }

    /** Own ship's room, dp: its plane and a little round it (the web's 40 px). */
    private const val ROOM_DP = 40f

    /** The tops' diamond, dp across. */
    private const val DIAMOND_DP = 9f

    private fun kind(k: String) = Expression.eq(Expression.get("kind"), Expression.literal(k))

    private fun layers(): List<Layer> {
        val casing = Expression.color(WingtipColors.Chart.CASING_HEX.toColorInt())
        val dark = Expression.color(WingtipColors.Chart.ROUTE_EDGE_HEX.toColorInt())
        val ink = Expression.color(WingtipColors.Chart.FIX_INK_HEX.toColorInt())
        return listOf(
            // The tops, from a route-readable zoom: over the whole country a
            // TOD's pill sat on the fields it was between.
            SymbolLayer(TOPS, SOURCE).withFilter(kind("top")).withProperties(
                PropertyFactory.iconImage(DIAMOND),
                PropertyFactory.iconAllowOverlap(true),
                PropertyFactory.iconIgnorePlacement(true),
                PropertyFactory.textField(Expression.get("text")),
                PropertyFactory.textFont(arrayOf(MapStyle.FONT)),
                PropertyFactory.textSize(MapLabels.lateSize(WingtipMapLabel.ROUTE_POINT.size.first().second.toFloat())),
                PropertyFactory.textColor(ink),
                PropertyFactory.textHaloColor(casing),
                PropertyFactory.textHaloWidth(PILL_HALO),
                PropertyFactory.textVariableAnchor(arrayOf(Property.TEXT_ANCHOR_LEFT, Property.TEXT_ANCHOR_RIGHT)),
                PropertyFactory.textRadialOffset(0.9f),
                PropertyFactory.textOptional(true),
                PropertyFactory.textPadding(2f),
            ).also { it.minZoom = MapStyle.glZoom(WingtipMapZoom.ROUTE_TAGS).toFloat() },
            // The route's fields' idents, white on the dark pill, the
            // destination's placed first; a side the next is free, before
            // it gives way.
            SymbolLayer(IDENTS, SOURCE).withFilter(kind("field")).withProperties(
                PropertyFactory.textField(Expression.get("text")),
                PropertyFactory.textFont(arrayOf(MapStyle.FONT)),
                PropertyFactory.textSize(MapLabels.lateSize(WingtipMapLabel.ROUTE_IDENT.size.first().second.toFloat())),
                PropertyFactory.textColor(casing),
                PropertyFactory.textHaloColor(dark),
                PropertyFactory.textHaloWidth(PILL_HALO),
                PropertyFactory.symbolSortKey(Expression.get("sort")),
                PropertyFactory.textVariableAnchor(
                    arrayOf(Property.TEXT_ANCHOR_LEFT, Property.TEXT_ANCHOR_RIGHT, Property.TEXT_ANCHOR_BOTTOM, Property.TEXT_ANCHOR_TOP),
                ),
                PropertyFactory.textRadialOffset(1.4f),
                PropertyFactory.textPadding(2f),
            ),
            // Own ship's room: an empty picture, always drawn, that takes its
            // place in the collision.
            SymbolLayer(ROOM, SOURCE).withFilter(kind("room")).withProperties(
                PropertyFactory.iconImage(ROOM),
                PropertyFactory.iconAllowOverlap(true),
                PropertyFactory.iconIgnorePlacement(false),
            ),
        )
    }

    /** The halo that reads as the words' pill, dp. */
    private const val PILL_HALO = 3f

    /** A small diamond in the chart's ink on a white edge, as the web's LEG_POINT_DIAMOND. */
    private fun diamond(density: Float) = createBitmap(Math.round(DIAMOND_DP * density), Math.round(DIAMOND_DP * density)).also { b ->
        val r = DIAMOND_DP * density / 2f
        val path = Path().apply {
            moveTo(r, 0f)
            lineTo(2 * r, r)
            lineTo(r, 2 * r)
            lineTo(0f, r)
            close()
        }
        val canvas = Canvas(b)
        canvas.drawPath(path, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = WingtipColors.Chart.CASING_HEX.toColorInt() })
        canvas.scale(0.6f, 0.6f, r, r)
        canvas.drawPath(path, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = WingtipColors.Chart.FIX_INK_HEX.toColorInt() })
    }

    /** Each mark a point: a route field (its ident, the destination's
     *  sort 0, placed first), a top, own ship's room. */
    fun geoJson(now: Shown): String = buildJsonObject {
        put("type", "FeatureCollection")
        putJsonArray("features") {
            fun point(lat: Double, lon: Double, props: kotlinx.serialization.json.JsonObjectBuilder.() -> Unit) = addJsonObject {
                put("type", "Feature")
                putJsonObject("properties", props)
                putJsonObject("geometry") {
                    put("type", "Point")
                    putJsonArray("coordinates") {
                        add(lon)
                        add(lat)
                    }
                }
            }
            now.ship?.let { (lat, lon) -> point(lat, lon) { put("kind", "room") } }
            now.fields.forEachIndexed { i, f ->
                point(f.lat, f.lon) {
                    put("kind", "field")
                    put("text", f.ident)
                    put("sort", if (i == now.fields.lastIndex) 0 else 1)
                }
            }
            now.tops.forEach { t ->
                point(t.lat, t.lon) {
                    put("kind", "top")
                    put("text", t.words)
                }
            }
        }
    }.toString()
}
