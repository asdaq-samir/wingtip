package app.wingtipmaps.android.map

import android.graphics.Color
import org.maplibre.android.maps.Style
import org.maplibre.android.style.layers.LineLayer
import org.maplibre.android.style.layers.Property
import org.maplibre.android.style.layers.PropertyFactory
import org.maplibre.android.style.sources.GeoJsonSource

/** The path flown, under the route: a thinner line in the route's
 *  colour, so where the airplane went reads against where it meant to
 *  go. Out of ChartMap, which holds the map's view. */
object TrailLayer {
    private const val TRAIL = "trail"

    /** The trail set, its layer added once under the route's edge or its
     *  line (`edge`, `route`), else under the style's route slot. */
    fun draw(style: Style, geoJson: String, edge: String, route: String) {
        val source = style.getSourceAs<GeoJsonSource>(TRAIL)
        if (source != null) {
            source.setGeoJson(geoJson)
            return
        }
        style.addSource(GeoJsonSource(TRAIL, geoJson))
        val layer = LineLayer(TRAIL, TRAIL).withProperties(
            PropertyFactory.lineColor(Color.rgb(0, 122, 255)),
            PropertyFactory.lineWidth(2.5f),
            PropertyFactory.lineOpacity(0.6f),
            PropertyFactory.lineJoin(Property.LINE_JOIN_ROUND),
            PropertyFactory.lineCap(Property.LINE_CAP_ROUND),
        )
        when {
            style.getLayer(edge) != null -> style.addLayerBelow(layer, edge)
            style.getLayer(route) != null -> style.addLayerBelow(layer, route)
            style.getLayer(MapStyle.ROUTE_SLOT) != null -> style.addLayerBelow(layer, MapStyle.ROUTE_SLOT)
            else -> style.addLayer(layer)
        }
    }
}
