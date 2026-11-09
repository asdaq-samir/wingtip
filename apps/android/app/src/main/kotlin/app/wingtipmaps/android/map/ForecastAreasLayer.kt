package app.wingtipmaps.android.map

import android.view.View
import androidx.core.graphics.toColorInt
import app.wingtipmaps.android.api.generated.RunArea
import app.wingtipmaps.android.design.generated.WingtipColors
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.json.add
import kotlinx.serialization.json.addJsonArray
import kotlinx.serialization.json.addJsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject
import org.maplibre.android.maps.MapView
import org.maplibre.android.maps.Style
import org.maplibre.android.style.expressions.Expression
import org.maplibre.android.style.layers.FillLayer
import org.maplibre.android.style.layers.Layer
import org.maplibre.android.style.layers.LineLayer
import org.maplibre.android.style.layers.PropertyFactory
import org.maplibre.android.style.sources.GeoJsonSource

/**
 * The advisory areas the forecast dry run is in at its time (the planner's
 * forecast run, ForecastPlay.areasAt): each outline filled, see-through,
 * and edged, under the route, while forecast mode is on. The map draws no
 * SIGMET or G-AIRMET areas of its own, so their inks are tokens the map
 * already has: a SIGMET in IFR's red, a G-AIRMET in special use
 * airspace's orange, the SPC's outlook in LIFR's purple. It follows its
 * own flow as NexradLayer follows the receiver, so the map's holder only
 * hands it the view; a style set anew has it drawn again.
 */
object ForecastAreasLayer {
    const val SOURCE = "forecast-areas"
    private const val FILL = "forecast-areas-fill"
    private const val EDGE = "forecast-areas-edge"

    private val _areas = MutableStateFlow<List<RunArea>>(emptyList())
    val areas: StateFlow<List<RunArea>> = _areas.asStateFlow()

    /** The areas to draw now; empty for none (forecast mode off). */
    fun show(areas: List<RunArea>) {
        _areas.value = areas
    }

    fun follow(view: MapView) {
        var scope: CoroutineScope? = null
        var job: Job? = null
        view.addOnDidFinishLoadingStyleListener { redraw(view, _areas.value) }
        view.addOnAttachStateChangeListener(object : View.OnAttachStateChangeListener {
            override fun onViewAttachedToWindow(v: View) {
                val s = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
                scope = s
                job = s.launch { _areas.collect { redraw(view, it) } }
            }

            override fun onViewDetachedFromWindow(v: View) {
                job?.cancel()
                scope?.cancel()
            }
        })
    }

    private fun redraw(view: MapView, areas: List<RunArea>) {
        view.getMapAsync { map -> map.getStyle { style -> draw(style, areas) } }
    }

    private fun draw(style: Style, areas: List<RunArea>) {
        val json = geoJson(areas)
        val source = style.getSourceAs<GeoJsonSource>(SOURCE)
        if (source != null) {
            source.setGeoJson(json)
            return
        }
        style.addSource(GeoJsonSource(SOURCE, json))
        val ink = Expression.match(
            Expression.get("kind"), Expression.color(WingtipColors.Category.LIFR_HEX.toColorInt()),
            Expression.stop("sigmet", Expression.color(WingtipColors.Category.IFR_HEX.toColorInt())),
            Expression.stop("gairmet", Expression.color(WingtipColors.Chart.SPECIAL_USE_HEX.toColorInt())),
        )
        val layers: List<Layer> = listOf(
            FillLayer(FILL, SOURCE).withProperties(PropertyFactory.fillColor(ink), PropertyFactory.fillOpacity(0.18f)),
            LineLayer(EDGE, SOURCE).withProperties(PropertyFactory.lineColor(ink), PropertyFactory.lineWidth(2f)),
        )
        for (layer in layers) if (style.getLayer(MapStyle.ROUTE_SLOT) != null) style.addLayerBelow(layer, MapStyle.ROUTE_SLOT) else style.addLayer(layer)
    }

    /** Each area a polygon with its kind, longitude first, its ring
     *  closed; an outline of fewer than three points left out. */
    fun geoJson(areas: List<RunArea>): String = buildJsonObject {
        put("type", "FeatureCollection")
        putJsonArray("features") {
            for (area in areas) {
                val ring = area.coords.filter { it.size >= 2 }
                if (ring.size < 3) continue
                val closed = if (ring.first() == ring.last()) ring else ring + listOf(ring.first())
                addJsonObject {
                    put("type", "Feature")
                    putJsonObject("properties") { put("kind", area.kind) }
                    putJsonObject("geometry") {
                        put("type", "Polygon")
                        putJsonArray("coordinates") {
                            addJsonArray { for (p in closed) addJsonArray { add(p[1]); add(p[0]) } }
                        }
                    }
                }
            }
        }
    }.toString()
}
