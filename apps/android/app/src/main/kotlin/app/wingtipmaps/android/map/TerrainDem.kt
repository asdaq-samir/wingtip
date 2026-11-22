package app.wingtipmaps.android.map

import app.wingtipmaps.android.Config
import org.maplibre.android.maps.Style
import org.maplibre.android.style.layers.ColorReliefLayer
import org.maplibre.android.style.layers.HillshadeLayer
import org.maplibre.android.style.layers.Layer
import org.maplibre.android.style.sources.RasterDemSource
import org.maplibre.android.style.sources.TileSet

/**
 * The planner's terrain tiles (/api/terrain-tile, the ground the altitudes
 * were planned over, the web's dem.ts) as the map's one raster-dem source,
 * shared by the relief's shading (Map3dLayer) and the hazard colouring
 * (HazardLayer): added by whichever draws first, taken away only once
 * neither draws from it, so the two never load the same tiles twice.
 */
object TerrainDem {
    const val ID = "terrain-dem"

    /** The finest terrain tile asked for, the planner's (wingtip.terrain_view.MAX_ZOOM). */
    private const val MAX_ZOOM = 13f

    /** The source, added where it is not yet in the style. */
    fun add(style: Style) {
        if (style.getSource(ID) != null) return
        val tiles = TileSet("2.2.0", Config.gateway + Config.plannerPath("/api/terrain-tile/{z}/{x}/{y}.png")).apply {
            encoding = "terrarium"
            minZoom = 3f
            maxZoom = MAX_ZOOM
        }
        style.addSource(RasterDemSource(ID, tiles, 256))
    }

    /** The source taken away once no layer draws from it any more. */
    fun release(style: Style) {
        if (style.layers.any(::drawsFromIt)) return
        style.getSource(ID)?.let(style::removeSource)
    }

    /** A layer over the chart and under the overlays, as the relief is:
     *  above the chart's top layer, else the close-in imagery's, else
     *  under the route. */
    fun overChart(style: Style, layer: Layer) {
        val top = MapStyle.CHART_LAYERS.lastOrNull { style.getLayer(it) != null } ?: CloseMap.IMAGERY.takeIf { style.getLayer(it) != null }
        when {
            top != null -> style.addLayerAbove(layer, top)
            style.getLayer(MapStyle.ROUTE_SLOT) != null -> style.addLayerBelow(layer, MapStyle.ROUTE_SLOT)
            else -> style.addLayer(layer)
        }
    }

    private fun drawsFromIt(layer: Layer): Boolean = when (layer) {
        is HillshadeLayer -> layer.sourceId == ID
        is ColorReliefLayer -> layer.sourceId == ID
        else -> false
    }
}
