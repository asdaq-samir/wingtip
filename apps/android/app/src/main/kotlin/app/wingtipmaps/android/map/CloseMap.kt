package app.wingtipmaps.android.map

import org.maplibre.android.maps.Style
import org.maplibre.android.style.expressions.Expression
import org.maplibre.android.style.layers.PropertyFactory
import org.maplibre.android.style.layers.RasterLayer
import org.maplibre.android.style.sources.RasterSource
import org.maplibre.android.style.sources.TileSet

/**
 * Close in, past the FAA chart's own detail (the owner, 2026-11-12, at
 * KDEN: the sectional enlarged past its last zoom is a blur), as the web's
 * closeZoom: the chart fades out over one level from its own last zoom
 * and the USGS's aerial imagery under it shows the runways and taxiways as
 * they are, the airports, route, airspace and marks still on top. Plain
 * zoom expressions MapLibre evaluates itself, frame by frame under a
 * pinch. Its credit is About's (AboutCredits), not the map's: the map
 * keeps no small print (docs/design/rules.md, section 7).
 */
object CloseMap {
    /** The imagery's source and layer. */
    const val IMAGERY = "close-imagery"

    /** The USGS's aerial imagery of the United States (The National Map's
     *  USGSImageryOnly, a public-domain work, 17 U.S.C. 105: NAIP's 0.6 to
     *  1 m aerial photographs over the lower 48, partners' imagery over
     *  Alaska, Hawaii and the territories), z/y/x as the web's USGS_URL. */
    const val USGS_URL = "https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}"

    /** Its last level of tiles: the service's maxScale, 1:9,028, is {z} 16
     *  (about 2 m a pixel at 40 degrees north); MapLibre enlarges it past. */
    const val USGS_MAX_ZOOM = 16f

    /** Its credit, as the web's USGS_CREDIT; the USGS asks, not requires,
     *  that its public-domain data be acknowledged. */
    const val USGS_CREDIT = "Imagery USGS The National Map"

    /** How far in the map goes over the imagery, MapLibre's zoom: about a
     *  metre a pixel, an airport's taxiways and ramps in sight. */
    const val MAX_ZOOM = 17.0

    /** The chart's opacity: whole to its own last zoom (`tileMaxZoom`, its
     *  tiles' {z}), gone one level past it. */
    fun chartFade(tileMaxZoom: Int): Expression {
        val from = MapStyle.glZoom(tileMaxZoom.toDouble()).toFloat()
        return Expression.interpolate(Expression.linear(), Expression.zoom(), Expression.stop(from, 1f), Expression.stop(from + 1, 0f))
    }

    /** The imagery's opacity under the chart: in over the half level before
     *  the chart starts to fade, so the chart never fades over nothing. */
    fun imageryFade(tileMaxZoom: Int): Expression {
        val from = MapStyle.glZoom(tileMaxZoom.toDouble()).toFloat()
        return Expression.interpolate(Expression.linear(), Expression.zoom(), Expression.stop(from - 0.5f, 0f), Expression.stop(from, 1f))
    }

    /** The imagery under the chart's layers and their fade, in a style
     *  just set, for a chart whose tiles stop at `tileMaxZoom`; asked
     *  again as the terminal chart is laid on, so it fades with the rest. */
    fun draw(style: Style, tileMaxZoom: Int) {
        if (style.getSource(IMAGERY) == null) {
            val tiles = TileSet("2.2.0", USGS_URL).apply { maxZoom = USGS_MAX_ZOOM }
            style.addSource(RasterSource(IMAGERY, tiles, 256))
            val layer = RasterLayer(IMAGERY, IMAGERY).withProperties(
                PropertyFactory.rasterFadeDuration(0f),
                PropertyFactory.rasterOpacity(imageryFade(tileMaxZoom)),
            )
            // No tile of it asked for further out.
            layer.minZoom = MapStyle.glZoom(tileMaxZoom.toDouble()).toFloat() - 0.5f
            val bottom = MapStyle.CHART_LAYERS.firstOrNull { style.getLayer(it) != null }
            if (bottom != null) style.addLayerBelow(layer, bottom) else style.addLayer(layer)
        }
        for (id in MapStyle.CHART_LAYERS) style.getLayer(id)?.setProperties(PropertyFactory.rasterOpacity(chartFade(tileMaxZoom)))
    }
}
