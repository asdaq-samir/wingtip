package app.wingtipmaps.android.map

import app.wingtipmaps.android.design.generated.WingtipColors
import org.maplibre.android.maps.Style
import org.maplibre.android.style.layers.BackgroundLayer
import org.maplibre.android.style.layers.Property
import org.maplibre.android.style.layers.PropertyFactory

/**
 * The Map card's Chart None (the owner, 2026-11-14: "chart should also
 * have none option"; the web's BaseGl PlainGround): no FAA chart drawn
 * and none of its tiles asked for, its raster layers hidden, and under
 * everything one plain ground in the look's colours (the tokens'
 * map-ground, by day and at night), with the airports, airspace, navaids,
 * route, weather and traffic over it as ever. Drawn in the map itself, so
 * nothing of the chart shows through. With a chart, the ground is hidden.
 */
object ChartGround {
    private const val ID = "plain-ground"

    fun draw(style: Style, layers: MapLayers, night: Boolean) {
        val shown = if (layers.chart) Property.VISIBLE else Property.NONE
        for (id in MapStyle.CHART_LAYERS) style.getLayer(id)?.setProperties(PropertyFactory.visibility(shown))
        val ground = style.getLayerAs<BackgroundLayer>(ID) ?: BackgroundLayer(ID).also { layer ->
            val first = style.layers.firstOrNull()
            if (first != null) style.addLayerBelow(layer, first.id) else style.addLayer(layer)
        }
        ground.setProperties(
            PropertyFactory.backgroundColor(if (night) WingtipColors.Chart.MAP_GROUND_NIGHT_HEX else WingtipColors.Chart.MAP_GROUND_HEX),
            PropertyFactory.visibility(if (layers.chart) Property.NONE else Property.VISIBLE),
        )
    }
}
