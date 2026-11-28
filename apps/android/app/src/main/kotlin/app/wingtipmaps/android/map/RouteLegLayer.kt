package app.wingtipmaps.android.map

import androidx.core.graphics.toColorInt
import app.wingtipmaps.android.design.generated.WingtipChartLook
import app.wingtipmaps.android.design.generated.WingtipColors
import app.wingtipmaps.android.route.RouteLegs
import org.maplibre.android.maps.Style
import org.maplibre.android.style.expressions.Expression
import org.maplibre.android.style.layers.LineLayer
import org.maplibre.android.style.layers.Property
import org.maplibre.android.style.layers.PropertyFactory
import org.maplibre.android.style.layers.PropertyValue
import org.maplibre.android.style.sources.GeoJsonSource

/**
 * The selected leg's green casing, as ForeFlight cases a selected course
 * (the owner, 2026-11-09: the green outline only on the selected leg):
 * a wider line under the route's edge and magenta, drawn from the same
 * source -- the route cut into its legs (RouteLegs) -- and filtered to
 * the leg whose Route Leg sheet is open; none while no sheet is.
 */
object RouteLegLayer {
    const val ID = "route-selected"

    /** The course's thin dark edge round its magenta (ChartMap's route), drawn from the same source. */
    const val EDGE = "route-edge"

    /** The edge's weight, the web's routeEdgePaint (design/tokens.json's chart-look.route-edge-*): nearly whole at
     *  night, where the dark rim holds the course 4.67:1 against the dimmed paper at the default Dimmer (0.6 gave
     *  2.80:1);
     *  as solid in the Sunlight palette, which Android takes under more
     *  contrast (moreContrast, Theme's lifted), as the web's Sunlight look; a soft rim by day. */
    fun edgeOpacity(night: Boolean, sunlight: Boolean = false): Float = when {
        night -> WingtipChartLook.ROUTE_EDGE_NIGHT
        sunlight -> WingtipChartLook.ROUTE_EDGE_SUNLIGHT
        else -> WingtipChartLook.ROUTE_EDGE_DAY
    }

    /**
     * The course on `style` from `source` (the route cut into its legs, RouteLegs, a line a leg, so a tap says
     * which and the selected one is cased): set anew where it is there, else made. The course line as the web app
     * draws it, and ForeFlight (the owner's screenshot, 2026-11-08): the chart's magenta core with a thin edge round
     * it; the green casing only on the selected leg (the owner, 2026-11-09). Over the airspace, under the navaids
     * and the airports (the style's route slot), as the web's map lays them; widths as the web's at zoom 10
     * (glStyle's routeLayers). At night dimmed by its colour with the chart (MapDim.colour, the web's
     * DIM_BY_COLOUR): solid, its contrast kept. The edge a dark rim by day and by night (the web's
     * CHART.routeEdge), where a light one at night stood out of the dimmed chart at 1.75 to 1.
     */
    fun course(style: Style, source: String, geoJson: String, night: Boolean, sunlight: Boolean, selected: Int?) {
        style.getSourceAs<GeoJsonSource>(source)?.let { return it.setGeoJson(geoJson) }
        style.addSource(GeoJsonSource(source, geoJson))
        fun line(id: String, hex: String, width: Float, vararg more: PropertyValue<*>) = LineLayer(id, source).withProperties(
            PropertyFactory.lineColor(MapDim.colour(hex.toColorInt())),
            PropertyFactory.lineWidth(width),
            PropertyFactory.lineJoin(Property.LINE_JOIN_ROUND),
            PropertyFactory.lineCap(Property.LINE_CAP_ROUND),
            *more,
        )
        for (layer in listOf(line(EDGE, WingtipColors.Chart.ROUTE_EDGE_HEX, 6.5f, PropertyFactory.lineOpacity(edgeOpacity(night, sunlight))), line(source, WingtipColors.Chart.COURSE_HEX, 4.5f))) {
            if (style.getLayer(MapStyle.ROUTE_SLOT) != null) style.addLayerBelow(layer, MapStyle.ROUTE_SLOT) else style.addLayer(layer)
        }
        add(style, source, EDGE, night, selected)
    }

    /** The casing over `source`, under `below` (the route's edge). */
    fun add(style: Style, source: String, below: String, night: Boolean, selected: Int?) {
        if (style.getLayer(ID) != null) return
        val layer = LineLayer(ID, source).withProperties(
            PropertyFactory.lineColor(MapDim.colour(green(night))),
            PropertyFactory.lineWidth(CASING_WIDTH),
            PropertyFactory.lineJoin(Property.LINE_JOIN_ROUND),
            PropertyFactory.lineCap(Property.LINE_CAP_ROUND),
        )
        layer.setFilter(filter(selected))
        if (style.getLayer(below) != null) style.addLayerBelow(layer, below) else style.addLayer(layer)
    }

    fun select(style: Style, selected: Int?) {
        style.getLayerAs<LineLayer>(ID)?.setFilter(filter(selected))
    }

    fun paint(style: Style, night: Boolean, sunlight: Boolean = false) {
        style.getLayerAs<LineLayer>(ID)?.setProperties(PropertyFactory.lineColor(MapDim.colour(green(night))))
        style.getLayerAs<LineLayer>(EDGE)?.setProperties(PropertyFactory.lineOpacity(edgeOpacity(night, sunlight)))
    }

    private fun filter(selected: Int?): Expression =
        if (selected == null) Expression.literal(false)
        else Expression.eq(Expression.get(RouteLegs.LEG), Expression.literal(selected))

    /** The tokens' route green, a shade deeper over the dimmed night chart,
     *  and dimmed with the chart by its colour (MapDim.colour). */
    private fun green(night: Boolean): Int = (if (night) WingtipColors.Chart.ROUTE_GREEN_NIGHT_HEX else WingtipColors.Chart.ROUTE_GREEN_HEX).toColorInt()

    /** Wider than the edge (6.5) so the green shows either side of it. */
    private const val CASING_WIDTH = 11f
}
