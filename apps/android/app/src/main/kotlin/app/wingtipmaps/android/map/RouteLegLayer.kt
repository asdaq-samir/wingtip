package app.wingtipmaps.android.map

import androidx.core.graphics.toColorInt
import app.wingtipmaps.android.design.generated.WingtipColors
import app.wingtipmaps.android.route.RouteLegs
import org.maplibre.android.maps.Style
import org.maplibre.android.style.expressions.Expression
import org.maplibre.android.style.layers.LineLayer
import org.maplibre.android.style.layers.Property
import org.maplibre.android.style.layers.PropertyFactory

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

    /** The edge's weight, the web's routeEdgePaint: nearly whole at night, where the dark rim holds the course
     *  4.67:1 against the dimmed paper at the default Dimmer (0.6 gave 2.80:1; the round-6 themes audit's R5-3),
     *  a soft rim by day. */
    fun edgeOpacity(night: Boolean): Float = if (night) 0.9f else 0.55f

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

    fun paint(style: Style, night: Boolean) {
        style.getLayerAs<LineLayer>(ID)?.setProperties(PropertyFactory.lineColor(MapDim.colour(green(night))))
        style.getLayerAs<LineLayer>(EDGE)?.setProperties(PropertyFactory.lineOpacity(edgeOpacity(night)))
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
