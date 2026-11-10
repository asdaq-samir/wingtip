package app.wingtipmaps.android.map

import androidx.core.graphics.ColorUtils
import androidx.core.graphics.toColorInt
import app.wingtipmaps.android.design.generated.WingtipColors
import org.maplibre.android.maps.Style
import org.maplibre.android.style.expressions.Expression
import org.maplibre.android.style.layers.CircleLayer
import org.maplibre.android.style.layers.LineLayer
import org.maplibre.android.style.layers.PropertyFactory
import org.maplibre.android.style.sources.GeoJsonSource

/** The glide ring, dashed in the map's blue as the web app's and the
 *  iPhone's: what the airplane reaches in still air, not a boundary to
 *  fly by. Under the route (`route`, else the route's slot) and the
 *  airplane; `id` its source's and its layer's. */
internal object GlideLayer {
    fun draw(style: Style, ring: List<List<Double>>, id: String, route: String) {
        val geoJson = lineJson(ring.filter { it.size == 2 }.map { it[0] to it[1] })
        val source = style.getSourceAs<GeoJsonSource>(id)
        if (source != null) {
            source.setGeoJson(geoJson)
            return
        }
        style.addSource(GeoJsonSource(id, geoJson))
        val layer = LineLayer(id, id).withProperties(
            PropertyFactory.lineColor(WingtipColors.Chart.MAP_BLUE_HEX.toColorInt()),
            PropertyFactory.lineWidth(2f),
            PropertyFactory.lineOpacity(0.85f),
            PropertyFactory.lineDasharray(arrayOf(4f, 3f)),
        )
        when {
            style.getLayer(route) != null -> style.addLayerBelow(layer, route)
            style.getLayer(MapStyle.ROUTE_SLOT) != null -> style.addLayerBelow(layer, MapStyle.ROUTE_SLOT)
            else -> style.addLayer(layer)
        }
    }
}

/**
 * The ring round the field whose card is open, as the web map draws it
 * (AirportsGl's RING) and the iPhone (SelectedHalo): the brand's Taxiway
 * Yellow (chart.selected, the owner, 2026-11-09) 3 dp wide, 20 dp from
 * the field, cased in white (chart.casing) and then the shade's dark edge
 * at about half strength (chart.shade), as a picked point's ring is.
 * Yellow alone is about 1.6:1 on the sectional's yellow towns and 1.4:1
 * on its pale greens; the dark edge holds on every part of the chart, by
 * day and dimmed at night. Drawn from the overlay tiles' own airports, the
 * one whose ident it is, under the marks; nothing without the overlays.
 */
internal object SelectedAirportLayer {
    private val RINGS = listOf(
        Triple("airport-selected-edge", ColorUtils.setAlphaComponent(WingtipColors.Chart.SHADE_HEX.toColorInt(), 140), 9f),
        Triple("airport-selected-casing", WingtipColors.Chart.CASING_HEX.toColorInt(), 6f),
        Triple("airport-selected", WingtipColors.Chart.SELECTED_HEX.toColorInt(), 3f),
    )
    const val RADIUS = 20f

    /** Only the field `ident`'s point; none for no field. */
    fun filter(ident: String?): Expression = Expression.eq(Expression.get("ident"), Expression.literal(ident ?: ""))

    fun draw(style: Style, ident: String?) {
        if (style.getSource(MapStyle.OVERLAY_SOURCE) == null) return
        for ((id, colour, width) in RINGS) {
            val kept = style.getLayerAs<CircleLayer>(id)
            if (kept != null) {
                kept.setFilter(filter(ident))
                continue
            }
            val layer = CircleLayer(id, MapStyle.OVERLAY_SOURCE).withProperties(
                PropertyFactory.circleRadius(RADIUS),
                PropertyFactory.circleOpacity(0f),
                PropertyFactory.circleStrokeColor(colour),
                PropertyFactory.circleStrokeWidth(width),
            )
            layer.sourceLayer = "airports" // the tiles' layer of fields, as MapStyle's airports layer reads
            layer.setFilter(filter(ident))
            if (style.getLayer(MapStyle.AIRPORTS) != null) style.addLayerBelow(layer, MapStyle.AIRPORTS) else style.addLayer(layer)
        }
    }
}
