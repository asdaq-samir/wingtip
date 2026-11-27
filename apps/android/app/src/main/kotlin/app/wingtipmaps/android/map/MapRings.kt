package app.wingtipmaps.android.map

import androidx.core.graphics.ColorUtils
import androidx.core.graphics.toColorInt
import app.wingtipmaps.android.design.generated.WingtipColors
import org.maplibre.android.maps.Style
import org.maplibre.android.style.layers.CircleLayer
import org.maplibre.android.style.layers.LineLayer
import org.maplibre.android.style.layers.PropertyFactory
import org.maplibre.android.style.sources.GeoJsonSource
import org.maplibre.geojson.Feature
import org.maplibre.geojson.FeatureCollection
import org.maplibre.geojson.Point

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
            PropertyFactory.lineColor(MapDim.colour(WingtipColors.Chart.MAP_BLUE_HEX.toColorInt())),
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
 * day and dimmed at night. Drawn from a one-point source of the field
 * itself, as the web's AirportsGl draws its SELECTED source, under the
 * marks: a tap sets that point alone, where a new filter on the airports'
 * tiles' circles laid out every tile of the source again, its marks and
 * words placed anew, at each tap (the round-6 map audit's N3).
 */
internal object SelectedAirportLayer {
    private const val SOURCE = "airport-selected-point"
    private val RINGS = listOf(
        Triple("airport-selected-edge", ColorUtils.setAlphaComponent(WingtipColors.Chart.SHADE_HEX.toColorInt(), 140), 9f),
        Triple("airport-selected-casing", WingtipColors.Chart.CASING_HEX.toColorInt(), 6f),
        Triple("airport-selected", WingtipColors.Chart.SELECTED_HEX.toColorInt(), 3f),
    )
    const val RADIUS = 20f

    /** The field as the source's one point; none for no field. */
    private fun points(field: MapField?): FeatureCollection =
        FeatureCollection.fromFeatures(listOfNotNull(field?.let { Feature.fromGeometry(Point.fromLngLat(it.lon, it.lat)) }))

    fun draw(style: Style, field: MapField?) {
        val source = style.getSourceAs<GeoJsonSource>(SOURCE)
        if (source != null) {
            source.setGeoJson(points(field))
            return
        }
        style.addSource(GeoJsonSource(SOURCE, points(field)))
        for ((id, colour, width) in RINGS) {
            val layer = CircleLayer(id, SOURCE).withProperties(
                PropertyFactory.circleRadius(RADIUS),
                PropertyFactory.circleOpacity(0f),
                // Dimmed with the chart by its colour at night (MapDim.colour): the ring keeps its edge on the chart.
                PropertyFactory.circleStrokeColor(MapDim.colour(colour)),
                PropertyFactory.circleStrokeWidth(width),
            )
            if (style.getLayer(MapStyle.AIRPORTS) != null) style.addLayerBelow(layer, MapStyle.AIRPORTS) else style.addLayer(layer)
        }
    }
}
