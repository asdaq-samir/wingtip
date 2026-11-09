package app.wingtipmaps.android.map

import android.view.View
import androidx.core.graphics.toColorInt
import app.wingtipmaps.android.design.generated.WingtipColors
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.receiver.Receiver
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
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
import org.maplibre.android.style.layers.PropertyFactory
import org.maplibre.android.style.sources.GeoJsonSource

/**
 * FIS-B's NEXRAD over the chart from the cockpit's receiver (the engine's
 * `receiver_nexrad`): each level's rectangles filled in its token's colour
 * (design/tokens.json's chart.nexrad-1 to -7), see-through, under the
 * overlays' lines and the route. It follows the receiver itself, so the
 * map's holder only hands it the view; a style set anew (a cycle change)
 * has it drawn again. Not for avoiding weather close in: FIS-B's NEXRAD is
 * minutes old (AIM 4-5-9's table, a regional image every 2.5 minutes).
 */
object NexradLayer {
    const val SOURCE = "nexrad"
    private const val FILL = "nexrad-fill"

    private val inks = listOf(
        WingtipColors.Chart.NEXRAD_1_HEX, WingtipColors.Chart.NEXRAD_2_HEX, WingtipColors.Chart.NEXRAD_3_HEX,
        WingtipColors.Chart.NEXRAD_4_HEX, WingtipColors.Chart.NEXRAD_5_HEX, WingtipColors.Chart.NEXRAD_6_HEX,
        WingtipColors.Chart.NEXRAD_7_HEX,
    )

    /** The view, drawn on now and whenever the receiver's NEXRAD changes,
     *  for as long as it is on the screen. */
    fun follow(view: MapView) {
        val receiver = Receiver.of(view.context)
        var scope: CoroutineScope? = null
        var job: Job? = null
        view.addOnDidFinishLoadingStyleListener { redraw(view, receiver.nexrad.value) }
        view.addOnAttachStateChangeListener(object : View.OnAttachStateChangeListener {
            override fun onViewAttachedToWindow(v: View) {
                val s = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
                scope = s
                job = s.launch { receiver.nexrad.collect { redraw(view, it) } }
            }

            override fun onViewDetachedFromWindow(v: View) {
                job?.cancel()
                scope?.cancel()
            }
        })
    }

    private fun redraw(view: MapView, nexrad: EngineContract.ReceiverNexradAnswer?) {
        view.getMapAsync { map -> map.getStyle { style -> draw(style, nexrad) } }
    }

    fun draw(style: Style, nexrad: EngineContract.ReceiverNexradAnswer?) {
        val json = geoJson(nexrad)
        val source = style.getSourceAs<GeoJsonSource>(SOURCE)
        if (source != null) {
            source.setGeoJson(json)
            return
        }
        style.addSource(GeoJsonSource(SOURCE, json))
        val colour = Expression.match(
            Expression.get("level"), Expression.color(inks[0].toColorInt()),
            *inks.mapIndexed { i, hex -> Expression.stop(i + 1, Expression.color(hex.toColorInt())) }.toTypedArray(),
        )
        val layer = FillLayer(FILL, SOURCE).withProperties(PropertyFactory.fillColor(colour), PropertyFactory.fillOpacity(0.5f))
        if (style.getLayer(MapStyle.ROUTE_SLOT) != null) style.addLayerBelow(layer, MapStyle.ROUTE_SLOT) else style.addLayer(layer)
    }

    /** Each rectangle a polygon with its level, longitude first. */
    fun geoJson(nexrad: EngineContract.ReceiverNexradAnswer?): String = buildJsonObject {
        put("type", "FeatureCollection")
        putJsonArray("features") {
            for (level in nexrad?.levels.orEmpty()) {
                for (r in level.rects) {
                    if (r.size != 4) continue
                    val (south, west, north, east) = r
                    addJsonObject {
                        put("type", "Feature")
                        putJsonObject("properties") { put("level", level.level.toInt()) }
                        putJsonObject("geometry") {
                            put("type", "Polygon")
                            putJsonArray("coordinates") {
                                addJsonArray {
                                    for ((lon, lat) in listOf(west to south, east to south, east to north, west to north, west to south)) {
                                        addJsonArray { add(lon); add(lat) }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }.toString()
}
