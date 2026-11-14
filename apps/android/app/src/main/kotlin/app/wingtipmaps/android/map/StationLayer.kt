package app.wingtipmaps.android.map

import android.view.View
import androidx.core.graphics.toColorInt
import app.wingtipmaps.android.design.generated.WingtipColors
import app.wingtipmaps.android.design.generated.WingtipMap
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.launch
import kotlinx.serialization.json.add
import kotlinx.serialization.json.addJsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject
import org.maplibre.android.maps.MapView
import org.maplibre.android.maps.Style
import org.maplibre.android.style.expressions.Expression
import org.maplibre.android.style.layers.Layer
import org.maplibre.android.style.layers.Property
import org.maplibre.android.style.layers.PropertyFactory
import org.maplibre.android.style.layers.SymbolLayer
import org.maplibre.android.style.sources.GeoJsonSource

/**
 * The airport weather drawn beside the chart's own symbols (the owner's
 * pick, 2026-11-10), as MapLibre symbol layers over a GeoJSON source of
 * the reporting fields' marks (FieldMark, StationMarks' work), as the
 * web's AirportWeatherGl: close in, the station model's wind barb for
 * every reported wind and its two lines of visibility and ceiling;
 * farther out, from a region's scale, the barb only where the wind earns
 * one (the owner, 2026-11-12: barbs as the Aviation Weather Center's map
 * draws them, in place of arrows), red past the picked airplane's
 * demonstrated crosswind at every zoom; and at the plan's fields, the
 * getting-worse badge. The
 * ring or dot round the symbol itself is the symbol's own picture
 * (AirportWeatherMarks). It follows its own flow, as ForecastAreasLayer
 * does, so the map's holder only hands it the view; a style set anew has
 * it drawn again.
 */
object StationLayer {
    const val SOURCE = "wx-fields"
    const val BARB = "wx-barb"
    const val LINES = "wx-lines"
    const val FAR = "wx-wind"
    const val WORSE = "wx-worse"

    /** What is drawn now: the marks, and the settings they are drawn by. */
    data class Shown(val marks: List<FieldMark> = emptyList(), val settings: AirportWeather = AirportWeather())

    private val _shown = MutableStateFlow(Shown())
    val shown: StateFlow<Shown> = _shown.asStateFlow()

    fun show(marks: List<FieldMark>, settings: AirportWeather) {
        _shown.value = Shown(marks, settings)
    }

    fun follow(view: MapView) {
        var scope: CoroutineScope? = null
        var job: Job? = null
        view.addOnDidFinishLoadingStyleListener { redraw(view, _shown.value) }
        view.addOnAttachStateChangeListener(object : View.OnAttachStateChangeListener {
            override fun onViewAttachedToWindow(v: View) {
                val s = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
                scope = s
                job = s.launch { _shown.combine(MapLayersStore.weatherOn(view.context)) { shown, on -> if (on) shown else Shown() }.collect { redraw(view, it) } }
            }

            override fun onViewDetachedFromWindow(v: View) {
                job?.cancel()
                scope?.cancel()
            }
        })
    }

    private fun redraw(view: MapView, shown: Shown) {
        val density = view.resources.displayMetrics.density
        view.getMapAsync { map -> map.getStyle { style -> draw(style, shown, density) } }
    }

    private fun draw(style: Style, shown: Shown, density: Float) {
        val json = geoJson(shown.marks, shown.settings)
        val source = style.getSourceAs<GeoJsonSource>(SOURCE)
        if (source == null) {
            StationPictures.addTo(style, density)
            style.addSource(GeoJsonSource(SOURCE, json))
            for (layer in layers()) {
                if (style.getLayer(MapStyle.AIRPORTS) != null) style.addLayerAbove(layer, MapStyle.AIRPORTS) else style.addLayer(layer)
            }
        } else {
            source.setGeoJson(json)
        }
        // The station model from its zoom, or not at all; farther out the
        // barbs the wind earns, from FAR_FROM to where the station model
        // takes over.
        val from = shown.settings.stationFromZoom
        for (id in listOf(BARB, LINES)) {
            val layer = style.getLayer(id) ?: continue
            layer.setProperties(PropertyFactory.visibility(if (from == null) Property.NONE else Property.VISIBLE))
            if (from != null) layer.minZoom = from.toFloat()
        }
        style.getLayer(FAR)?.maxZoom = (from ?: MAX_ZOOM).toFloat()
    }

    /** No wind drawn out past a region's scale (the owner's iPhone at zoom
     *  3, 2026-11-12: the country one tangle of barbs), smaller there and
     *  growing in to their own size by Leaflet's 9: the tokens'
     *  map.zoom-barb-far-from and -full, the web's too. */
    private const val FAR_FROM = WingtipMap.ZOOM_BARB_FAR_FROM.toDouble()
    private const val FAR_FULL = WingtipMap.ZOOM_BARB_FULL.toDouble()
    private const val MAX_ZOOM = 24.0

    /** The barb from the field toward where the wind is from, turned by
     *  its direction; a variable wind, which no barb can point, "VRB05"
     *  under the field, red where the barb would be. The words give way
     *  where they don't fit; close in, the barb never does. */
    private fun wind(id: String, filter: Expression): SymbolLayer {
        val ink = Expression.color(WingtipColors.Chart.FIX_INK_HEX.toColorInt())
        val red = Expression.color(WingtipColors.Chart.WARNING_HEX.toColorInt())
        return SymbolLayer(id, SOURCE).withFilter(filter).withProperties(
            PropertyFactory.iconImage(Expression.coalesce(Expression.get("barb"), Expression.literal(""))),
            PropertyFactory.iconRotate(Expression.coalesce(Expression.get("from"), Expression.literal(0.0))),
            PropertyFactory.iconRotationAlignment(Property.ICON_ROTATION_ALIGNMENT_MAP),
            PropertyFactory.iconAnchor(Expression.coalesce(Expression.get("anchor"), Expression.literal("center"))),
            PropertyFactory.iconAllowOverlap(true),
            PropertyFactory.iconIgnorePlacement(true),
            PropertyFactory.textField(Expression.coalesce(Expression.get("variable"), Expression.literal(""))),
            PropertyFactory.textFont(arrayOf(MapStyle.FONT)),
            PropertyFactory.textSize(11f),
            PropertyFactory.textAnchor(Property.TEXT_ANCHOR_TOP),
            PropertyFactory.textOffset(arrayOf(0f, 1.3f)),
            PropertyFactory.textPadding(1f),
            PropertyFactory.textOptional(true),
            PropertyFactory.textColor(Expression.switchCase(Expression.eq(Expression.get("over"), true), red, ink)),
            PropertyFactory.textHaloColor(Expression.color(WingtipColors.Chart.CASING_HEX.toColorInt())),
            PropertyFactory.textHaloWidth(2f),
        )
    }

    private fun layers(): List<Layer> {
        val ink = Expression.color(WingtipColors.Chart.FIX_INK_HEX.toColorInt())
        val casing = Expression.color(WingtipColors.Chart.CASING_HEX.toColorInt())
        val farthest = MapStyle.glZoom(MapStyle.AIRPORTS_FARTHEST_ZOOM).toFloat()
        return listOf(
            // Close in, the station model: every reported wind, calm its ring.
            wind(BARB, Expression.any(Expression.has("barb"), Expression.has("variable"))),
            SymbolLayer(LINES, SOURCE).withFilter(Expression.has("lines")).withProperties(
                PropertyFactory.textField(Expression.get("lines")),
                PropertyFactory.textFont(arrayOf(MapStyle.FONT)),
                PropertyFactory.textSize(11f),
                PropertyFactory.textAnchor(Property.TEXT_ANCHOR_RIGHT),
                PropertyFactory.textJustify(Property.TEXT_JUSTIFY_RIGHT),
                PropertyFactory.textOffset(arrayOf(-1.6f, 0f)),
                PropertyFactory.textColor(ink),
                PropertyFactory.textHaloColor(casing),
                PropertyFactory.textHaloWidth(2f),
                PropertyFactory.textAllowOverlap(true),
                PropertyFactory.textIgnorePlacement(true),
            ),
            // Farther out, only where the wind earns it, giving way to one
            // another rather than piled up.
            wind(FAR, Expression.eq(Expression.get("far"), true)).withProperties(
                PropertyFactory.iconAllowOverlap(false),
                PropertyFactory.iconIgnorePlacement(false),
                PropertyFactory.iconPadding(2f),
                PropertyFactory.iconSize(
                    Expression.interpolate(
                        Expression.linear(), Expression.zoom(),
                        Expression.stop(MapStyle.glZoom(FAR_FROM), 0.6f), Expression.stop(MapStyle.glZoom(FAR_FULL), 1f),
                    ),
                ),
            ).also { it.minZoom = MapStyle.glZoom(FAR_FROM).toFloat() },
            SymbolLayer(WORSE, SOURCE).withFilter(Expression.has("worse")).withProperties(
                PropertyFactory.iconImage(StationPictures.WORSE),
                PropertyFactory.iconTranslate(arrayOf(-WORSE_AT_DP, -WORSE_AT_DP)),
                PropertyFactory.iconTranslateAnchor(Property.ICON_TRANSLATE_ANCHOR_VIEWPORT),
                PropertyFactory.iconAllowOverlap(true),
                PropertyFactory.iconIgnorePlacement(true),
            ).also { it.minZoom = farthest },
        )
    }

    /** Where the badge sits from the field, up and to the left, dp:
     *  clear of the symbol's weather ring. */
    private const val WORSE_AT_DP = 13f

    /** Each mark a point with what its layers draw, a member left out
     *  where its layer draws nothing there: the barb or "VRB05" and the
     *  lines for the station model, `far` with the Wind Barbs switch on,
     *  the badge with its switch on. */
    fun geoJson(marks: List<FieldMark>, settings: AirportWeather): String = buildJsonObject {
        put("type", "FeatureCollection")
        putJsonArray("features") {
            if (settings.mode == AirportWeatherMode.OFF) return@putJsonArray
            for (m in marks) {
                addJsonObject {
                    put("type", "Feature")
                    putJsonObject("properties") {
                        put("ident", m.ident)
                        m.barb?.let {
                            put("barb", it)
                            put("from", m.fromDeg ?: 0.0)
                            // Calm's ring round the field; a barb's staff out from it.
                            put("anchor", if (it == StationPictures.CALM) "center" else "bottom")
                        }
                        m.variable?.let { put("variable", it) }
                        if (m.over) put("over", true)
                        m.lines?.let { put("lines", it) }
                        if (settings.windArrows && m.far) put("far", true)
                        if (settings.worse && m.worse) put("worse", true)
                    }
                    putJsonObject("geometry") {
                        put("type", "Point")
                        putJsonArray("coordinates") {
                            add(m.lon)
                            add(m.lat)
                        }
                    }
                }
            }
        }
    }.toString()
}
