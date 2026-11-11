package app.wingtipmaps.android.map

import androidx.core.graphics.toColorInt
import app.wingtipmaps.android.api.Planner
import app.wingtipmaps.android.design.generated.WingtipColors
import app.wingtipmaps.android.plates.PlacedPlate
import app.wingtipmaps.android.plates.PlateLook
import app.wingtipmaps.android.plates.PlateTagsModel
import org.maplibre.android.camera.CameraUpdate
import org.maplibre.android.camera.CameraUpdateFactory
import org.maplibre.android.geometry.LatLng
import org.maplibre.android.geometry.LatLngBounds
import org.maplibre.android.geometry.LatLngQuad
import org.maplibre.android.maps.Style
import org.maplibre.android.style.expressions.Expression
import org.maplibre.android.style.layers.LineLayer
import org.maplibre.android.style.layers.Property
import org.maplibre.android.style.layers.PropertyFactory
import org.maplibre.android.style.layers.RasterLayer
import org.maplibre.android.style.layers.SymbolLayer
import org.maplibre.android.style.sources.GeoJsonSource
import org.maplibre.android.style.sources.ImageSource
import java.net.URI

/** What the map draws of the approach plates: the pages, how, and their tags. */
data class PlatesShown(
    val plates: List<PlacedPlate> = emptyList(),
    val look: PlateLook = PlateLook(),
    val drawing: PlateTagsModel.Drawing = PlateTagsModel.Drawing.NONE,
)

/**
 * The approach plates on the chart, ForeFlight's way (the owner,
 * 2026-11-11): each plate's whole page as a picture laid by its four
 * corners (PlacedPlate), over the chart and its airspace and under the
 * route and the trail, at the card's transparency, white on black with
 * Invert Plate Colors (MapLibre's raster brightness turned end for end);
 * the final approach segment over the page, and the fixes' tags over
 * everything but own ship and the traffic (PlateTagsModel). The last
 * drawn is kept, so a style set anew (a cycle's change) gets it back.
 */
class PlateLayer(private val density: Float) {
    private var shown = PlatesShown()
    private val plates get() = shown.plates
    private val look get() = shown.look
    private val drawing get() = shown.drawing

    /** What to draw; the plate newly put on the map, if one is, so the
     *  map is brought to it. */
    fun set(shown: PlatesShown): PlacedPlate? {
        val had = plates.map { it.pick }.toSet()
        this.shown = shown
        return shown.plates.lastOrNull { it.pick !in had }
    }

    /** The plate under a tap, the top one where they overlap; none for a
     *  tap off every page. */
    fun at(lat: Double, lon: Double): MapPick.Plate? =
        plates.lastOrNull { PlacedPlate.contains(it.corners, lat, lon) }?.let { MapPick.Plate(it.pick.ident, it.pick.procedure) }

    /** Everything as last set, onto `style`. */
    fun draw(style: Style) {
        val wanted = plates.associateBy { PREFIX + it.pick.key + "-" + it.cycle }
        // A plate no longer drawn, or of another cycle, taken off.
        style.layers.map { it.id }.filter { it.startsWith(PREFIX) && it !in wanted }.forEach { id ->
            style.removeLayer(id)
            style.removeSource(id)
        }
        for ((id, plate) in wanted) {
            val layer = style.getLayerAs<RasterLayer>(id) ?: add(style, id, plate)
            layer.setProperties(*paint(look))
        }
        tags(style)
    }

    /** A page's picture and its layer, under the route. */
    private fun add(style: Style, id: String, plate: PlacedPlate): RasterLayer {
        val c = plate.corners
        val quad = LatLngQuad(
            LatLng(c[0].lat, c[0].lon), LatLng(c[1].lat, c[1].lon),
            LatLng(c[2].lat, c[2].lon), LatLng(c[3].lat, c[3].lon),
        )
        style.addSource(ImageSource(id, quad, URI(Planner.url(plate.picture).toString())))
        val layer = RasterLayer(id, id).withProperties(PropertyFactory.rasterFadeDuration(0f))
        val under = UNDER.firstOrNull { style.getLayer(it) != null }
        if (under != null) style.addLayerBelow(layer, under) else style.addLayer(layer)
        return layer
    }

    /** The finals over the pages and the tags over the route. */
    private fun tags(style: Style) {
        for ((id, label) in drawing.labels) {
            if (style.getImage(id) == null) style.addImage(id, PlateTagPictures.picture(label, density))
        }
        val finals = style.getSourceAs<GeoJsonSource>(FINALS)
        if (finals != null) {
            finals.setGeoJson(drawing.finals)
        } else {
            style.addSource(GeoJsonSource(FINALS, drawing.finals))
            // TODO(claude/plates-engine): the final approach's own cyan
            // token from design/tokens.json once that branch adds it; the
            // pattern's teal, ForeFlight's cyan's nearest, until then.
            val line = LineLayer(FINALS, FINALS).withProperties(
                PropertyFactory.lineColor(WingtipColors.Chart.PATTERN_HEX.toColorInt()),
                PropertyFactory.lineWidth(FINAL_WIDTH),
                PropertyFactory.lineCap(Property.LINE_CAP_ROUND),
            )
            val under = UNDER.firstOrNull { style.getLayer(it) != null }
            if (under != null) style.addLayerBelow(line, under) else style.addLayer(line)
        }
        val points = style.getSourceAs<GeoJsonSource>(TAGS)
        if (points != null) {
            points.setGeoJson(drawing.points)
            return
        }
        style.addSource(GeoJsonSource(TAGS, drawing.points))
        val symbols = SymbolLayer(TAGS, TAGS).withProperties(
            PropertyFactory.iconImage(Expression.get("image")),
            PropertyFactory.iconAnchor(Property.ICON_ANCHOR_LEFT),
            PropertyFactory.iconOffset(arrayOf(TAG_OFFSET, 0f)),
            PropertyFactory.iconAllowOverlap(true),
            PropertyFactory.iconIgnorePlacement(true),
        )
        val over = listOf("own-ship", MapStyle.TRAFFIC_TREND).firstOrNull { style.getLayer(it) != null }
        if (over != null) style.addLayerBelow(symbols, over) else style.addLayer(symbols)
    }

    companion object {
        const val PREFIX = "plate-page-"
        const val FINALS = "plate-finals"
        const val TAGS = "plate-tags"

        /** The camera fitted to a page, with a finger's room round it. */
        fun fit(plate: PlacedPlate, density: Float): CameraUpdate =
            CameraUpdateFactory.newLatLngBounds(LatLngBounds.fromLatLngs(plate.corners.map { LatLng(it.lat, it.lon) }), (FIT_PAD_DP * density).toInt())

        private const val FIT_PAD_DP = 24f

        /** The route's own layers, lowest first: a page goes under them all. */
        private val UNDER = listOf("trail", RouteLegLayer.ID, "route-edge", "route", MapStyle.ROUTE_SLOT)

        /** As wide as the route's magenta core, so the final reads as a leg. */
        private const val FINAL_WIDTH = 4.5f

        /** A tag sits a little right of its fix, as ForeFlight's. */
        private const val TAG_OFFSET = 8f

        /**
         * A page's paint: its opacity, and inverted for night by setting
         * the raster's brightness range end for end (MapLibre's style spec:
         * raster-brightness-min over raster-brightness-max maps white to
         * black and black to white).
         */
        fun paint(look: PlateLook) = arrayOf(
            PropertyFactory.rasterOpacity(look.opacity),
            PropertyFactory.rasterBrightnessMin(if (look.invert) 1f else 0f),
            PropertyFactory.rasterBrightnessMax(if (look.invert) 0f else 1f),
        )
    }
}
