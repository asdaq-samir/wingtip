package app.wingtipmaps.android.map

import android.view.View
import app.wingtipmaps.android.api.generated.LoopFrame
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.launch
import org.maplibre.android.maps.MapView
import org.maplibre.android.maps.Style
import org.maplibre.android.style.layers.PropertyFactory
import org.maplibre.android.style.layers.RasterLayer
import org.maplibre.android.style.layers.TransitionOptions
import org.maplibre.android.style.sources.RasterSource
import org.maplibre.android.style.sources.TileSet

/**
 * The radar and satellite loop over the chart (WeatherLoop, the web's
 * WeatherLoopGl): every frame a raster layer of its own under the route,
 * all added at once so each one's tiles load ahead, the one shown at its
 * opacity and the rest clear -- a swap of opacities between loaded
 * layers, which does not flicker. Tells the loop when the map has gone
 * idle with them, or after PRELOAD_CAP_MS with some still coming. The
 * tiles straight from IEM and nowCOAST (wingtip.weather_loop); MapLibre
 * fills the satellite's `{bbox-epsg-3857}` itself. It follows the loop
 * itself, so the map's holder only hands it the view, as NexradLayer.
 */
object WeatherLoopLayer {
    private const val RADAR_OPACITY = 0.6f
    private const val SATELLITE_OPACITY = 0.45f
    private const val PRELOAD_CAP_MS = 8_000L

    fun follow(view: MapView) {
        val loop = WeatherLoop.of(view.context)
        var scope: CoroutineScope? = null
        var job: Job? = null
        var cap: Job? = null
        view.addOnDidFinishLoadingStyleListener { redraw(view, loop.state.value) }
        view.addOnDidBecomeIdleListener { if (!loop.state.value.ready && loop.state.value.frames.isNotEmpty()) loop.loaded() }
        view.addOnAttachStateChangeListener(object : View.OnAttachStateChangeListener {
            override fun onViewAttachedToWindow(v: View) {
                val s = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
                scope = s
                job = s.launch {
                    loop.state.combine(MapLayersStore.weatherOn(view.context)) { state, on -> if (on) state else state.copy(kind = LoopKind.OFF) }.collect { state ->
                        redraw(view, state)
                        if (!state.ready && state.frames.isNotEmpty() && cap?.isActive != true) {
                            cap = s.launch {
                                delay(PRELOAD_CAP_MS)
                                loop.loaded()
                            }
                        }
                    }
                }
            }

            override fun onViewDetachedFromWindow(v: View) {
                job?.cancel()
                scope?.cancel()
            }
        })
    }

    private fun redraw(view: MapView, state: LoopState) {
        view.getMapAsync { map -> map.getStyle { style -> draw(style, if (state.kind == LoopKind.OFF) emptyList() else state.frames, state.shown) } }
    }

    private fun ids(frame: LoopFrame) = listOfNotNull(
        frame.satelliteTiles?.let { "wx-loop-sat-${frame.valid}" to it },
        frame.radarTiles?.let { "wx-loop-radar-${frame.valid}" to it },
    )

    fun draw(style: Style, frames: List<LoopFrame>, shown: Int) {
        val wanted = frames.flatMapIndexed { i, f -> ids(f).map { (id, url) -> Triple(id, url, i) } }
        val keep = wanted.map { it.first }.toSet()
        for (layer in style.layers.filter { it.id.startsWith("wx-loop-") && it.id !in keep }) {
            style.removeLayer(layer)
            style.removeSource(layer.id)
        }
        for ((id, url, i) in wanted) {
            val radar = id.startsWith("wx-loop-radar")
            val opacity = if (i == shown) (if (radar) RADAR_OPACITY else SATELLITE_OPACITY) else 0f
            val existing = style.getLayerAs<RasterLayer>(id)
            if (existing != null) {
                existing.setProperties(PropertyFactory.rasterOpacity(opacity))
                continue
            }
            val tiles = TileSet("2.2.0", url).apply {
                maxZoom = if (radar) 10f else 9f
                attribution = if (radar) "Radar: NWS NEXRAD via Iowa Environmental Mesonet" else "Satellite: NOAA GOES via nowCOAST"
            }
            style.addSource(RasterSource(id, tiles, 256))
            val layer = RasterLayer(id, id).withProperties(PropertyFactory.rasterFadeDuration(0f), PropertyFactory.rasterOpacity(opacity))
            layer.rasterOpacityTransition = TransitionOptions(0, 0)
            layer.minZoom = MapStyle.glZoom(3.0).toFloat()
            if (style.getLayer(MapStyle.ROUTE_SLOT) != null) style.addLayerBelow(layer, MapStyle.ROUTE_SLOT) else style.addLayer(layer)
        }
    }
}
