package app.wingtipmaps.android.map

import android.graphics.PointF
import android.util.Log
import android.view.View
import androidx.core.graphics.toColorInt
import app.wingtipmaps.android.AppClock
import app.wingtipmaps.android.api.Planner
import app.wingtipmaps.android.api.generated.Tfr
import app.wingtipmaps.android.api.planned
import app.wingtipmaps.android.design.generated.WingtipColors
import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.engine.generated.tfrRead
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.json.addJsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject
import org.maplibre.android.maps.MapLibreMap
import org.maplibre.android.maps.MapView
import org.maplibre.android.maps.Style
import org.maplibre.android.style.expressions.Expression
import org.maplibre.android.style.layers.FillLayer
import org.maplibre.android.style.layers.Layer
import org.maplibre.android.style.layers.LineLayer
import org.maplibre.android.style.layers.PropertyFactory
import org.maplibre.android.style.sources.GeoJsonSource
import java.time.Instant

/**
 * The temporary flight restrictions, always: a hazard a pilot must know
 * of near the route (14 CFR 91.103, 91.137-91.145, 99.7), with no switch
 * to lose it by (the owner, 2026-11-14; docs/design/rules.md 8), as the
 * web's TfrGl draws them. Each area from the planner's GET tfrs
 * (tfr.faa.gov's list, wingtip.tfr) a fill and its edge in the FAA's TFR
 * red: in force a solid line over a red wash, not yet in force dashed
 * over a fainter one. Fetched as the map is shown and again every ten
 * minutes while it is, as the web's tfrsQuery; it follows its own flow as
 * ForecastAreasLayer does, so the map's holder only hands it the view,
 * and a style set anew has it drawn again. A tap inside one opens its
 * card (pick; MapPick.Tfr, the same card a link `tfr=` opens).
 */
object TfrLayer {
    private const val TAG = "TfrLayer"
    const val SOURCE = "tfrs"
    private const val FILL = "tfrs-fill"
    private const val FILL_LATER = "tfrs-fill-later"
    private const val LINE = "tfrs-line"
    private const val LINE_LATER = "tfrs-line-later"
    private const val REFRESH_MS = 10 * 60_000L

    /** The list as last heard: none yet, and whether the last ask failed
     *  (its card says so in place, lib/problems' rule). */
    data class Heard(val tfrs: List<Tfr>? = null, val failed: Boolean = false, val atMs: Long = 0L)

    private val _heard = MutableStateFlow(Heard())
    val heard: StateFlow<Heard> = _heard.asStateFlow()

    /** Whether a TFR is in force at `nowMs`: one with no times is taken
     *  as so, as the web's inForce. */
    fun inForce(tfr: Tfr, nowMs: Long): Boolean {
        val from = tfr.effective?.let(::epochMs) ?: Long.MIN_VALUE
        val to = tfr.expires?.let(::epochMs) ?: Long.MAX_VALUE
        return nowMs in from..to
    }

    /** Its levels and the rule it is under in the engine's words
     *  (`tfr_read`), for its card, asked here as the list's holder. */
    fun read(tfr: Tfr): Result<EngineContract.TfrReadAnswer> = Engine.tfrRead(
        kind = tfr.kind, rule = tfr.rule, title = tfr.title,
        floorFt = tfr.floorFt, floorRef = tfr.floorRef, ceilingFt = tfr.ceilingFt, ceilingRef = tfr.ceilingRef,
    )

    private fun epochMs(iso: String): Long? = runCatching { Instant.parse(iso).toEpochMilli() }.getOrNull()

    fun follow(view: MapView) {
        var scope: CoroutineScope? = null
        view.addOnDidFinishLoadingStyleListener { redraw(view) }
        view.addOnAttachStateChangeListener(object : View.OnAttachStateChangeListener {
            override fun onViewAttachedToWindow(v: View) {
                val s = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
                scope = s
                s.launch {
                    while (true) {
                        fetch()
                        redraw(view)
                        delay(REFRESH_MS)
                    }
                }
            }

            override fun onViewDetachedFromWindow(v: View) {
                scope?.cancel()
            }
        })
    }

    private suspend fun fetch() {
        val asked = runCatching { Planner.api.tfrs().planned().tfrs }
        asked.exceptionOrNull()?.let { Log.w(TAG, "The TFRs failed: ${it.message}") }
        val last = _heard.value
        // A failed refresh keeps the list last heard on the map.
        _heard.value = Heard(asked.getOrNull() ?: last.tfrs, asked.isFailure, AppClock.nowMs())
    }

    private fun redraw(view: MapView) {
        val heard = _heard.value
        val tfrs = heard.tfrs ?: return
        view.getMapAsync { map -> map.getStyle { style -> draw(style, geoJson(tfrs, heard.atMs)) } }
    }

    private fun draw(style: Style, json: String) {
        val source = style.getSourceAs<GeoJsonSource>(SOURCE)
        if (source != null) {
            source.setGeoJson(json)
            return
        }
        style.addSource(GeoJsonSource(SOURCE, json))
        val red = WingtipColors.Chart.TFR_HEX.toColorInt()
        val active = Expression.get("active")
        val later = Expression.not(active)
        val layers: List<Layer> = listOf(
            FillLayer(FILL, SOURCE).withFilter(active).withProperties(PropertyFactory.fillColor(red), PropertyFactory.fillOpacity(0.14f)),
            FillLayer(FILL_LATER, SOURCE).withFilter(later).withProperties(PropertyFactory.fillColor(red), PropertyFactory.fillOpacity(0.06f)),
            LineLayer(LINE, SOURCE).withFilter(active).withProperties(
                PropertyFactory.lineColor(red), PropertyFactory.lineWidth(2.5f), PropertyFactory.lineJoin("round"),
            ),
            LineLayer(LINE_LATER, SOURCE).withFilter(later).withProperties(
                PropertyFactory.lineColor(red), PropertyFactory.lineWidth(2f), PropertyFactory.lineDasharray(arrayOf(3f, 2.5f)),
            ),
        )
        for (layer in layers) if (style.getLayer(MapStyle.ROUTE_SLOT) != null) style.addLayerBelow(layer, MapStyle.ROUTE_SLOT) else style.addLayer(layer)
    }

    /** Each TFR a feature with its NOTAM number and whether it is in
     *  force when the list was heard, its areas the planner's GeoJSON. */
    fun geoJson(tfrs: List<Tfr>, nowMs: Long): String = buildJsonObject {
        put("type", "FeatureCollection")
        putJsonArray("features") {
            for (tfr in tfrs) {
                addJsonObject {
                    put("type", "Feature")
                    putJsonObject("properties") {
                        put("id", tfr.notamId)
                        put("active", inForce(tfr, nowMs))
                    }
                    put("geometry", tfr.geometry)
                }
            }
        }
    }.toString()

    /** The TFR a tap at `p` is inside, where it is one the list holds. */
    fun pick(map: MapLibreMap, p: PointF): MapPick.Tfr? {
        val style = map.style ?: return null
        val ids = listOf(FILL, FILL_LATER).filter { style.getLayer(it) != null }
        if (ids.isEmpty()) return null
        val id = map.queryRenderedFeatures(p, *ids.toTypedArray()).firstNotNullOfOrNull { it.getStringProperty("id") } ?: return null
        return if (_heard.value.tfrs?.any { it.notamId == id } == true) MapPick.Tfr(id) else null
    }
}
