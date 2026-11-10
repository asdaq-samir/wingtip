package app.wingtipmaps.android.map

import android.view.View
import androidx.core.graphics.toColorInt
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
 * the reporting fields' marks (FieldMark, StationMarks' work): close in,
 * the station model's wind barb and its two lines of visibility and
 * ceiling; at any zoom, the wind arrow and its figures where the wind is
 * worth drawing; and at the plan's fields, the getting-worse badge. The
 * ring or dot round the symbol itself is the symbol's own picture
 * (AirportWeatherMarks). It follows its own flow, as ForecastAreasLayer
 * does, so the map's holder only hands it the view; a style set anew has
 * it drawn again.
 */
object StationLayer {
    const val SOURCE = "wx-fields"
    const val BARB = "wx-barb"
    const val LINES = "wx-lines"
    const val ARROW = "wx-arrow"
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
                job = s.launch { _shown.collect { redraw(view, it) } }
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
        // The station model from its zoom, or not at all.
        val from = shown.settings.stationFromZoom
        for (id in listOf(BARB, LINES)) {
            val layer = style.getLayer(id) ?: continue
            layer.setProperties(PropertyFactory.visibility(if (from == null) Property.NONE else Property.VISIBLE))
            if (from != null) layer.minZoom = from.toFloat()
        }
    }

    /** Over the chart: the barb and arrow cased in white, so they keep to
     *  the field they are of and never push a field's symbol off. */
    private fun layers(): List<Layer> {
        val ink = Expression.color(WingtipColors.Chart.FIX_INK_HEX.toColorInt())
        val casing = Expression.color(WingtipColors.Chart.CASING_HEX.toColorInt())
        val farthest = MapStyle.glZoom(MapStyle.AIRPORTS_FARTHEST_ZOOM).toFloat()
        return listOf(
            SymbolLayer(BARB, SOURCE).withFilter(Expression.has("barb")).withProperties(
                PropertyFactory.iconImage(Expression.get("barb")),
                PropertyFactory.iconRotate(Expression.get("from")),
                PropertyFactory.iconRotationAlignment(Property.ICON_ROTATION_ALIGNMENT_MAP),
                PropertyFactory.iconAnchor(Expression.get("anchor")),
                PropertyFactory.iconAllowOverlap(true),
                PropertyFactory.iconIgnorePlacement(true),
            ),
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
            SymbolLayer(ARROW, SOURCE).withFilter(Expression.has("arrow")).withProperties(
                PropertyFactory.iconImage(Expression.get("arrow")),
                PropertyFactory.iconRotate(Expression.get("to")),
                PropertyFactory.iconRotationAlignment(Property.ICON_ROTATION_ALIGNMENT_MAP),
                PropertyFactory.iconTranslate(arrayOf(ARROW_AT_DP, -ARROW_AT_DP)),
                PropertyFactory.iconTranslateAnchor(Property.ICON_TRANSLATE_ANCHOR_VIEWPORT),
                PropertyFactory.textField(Expression.get("figures")),
                PropertyFactory.textFont(arrayOf(MapStyle.FONT)),
                PropertyFactory.textSize(11f),
                PropertyFactory.textAnchor(Property.TEXT_ANCHOR_LEFT),
                PropertyFactory.textTranslate(arrayOf(ARROW_AT_DP + 11f, -ARROW_AT_DP)),
                PropertyFactory.textTranslateAnchor(Property.TEXT_TRANSLATE_ANCHOR_VIEWPORT),
                PropertyFactory.textColor(
                    Expression.switchCase(Expression.eq(Expression.get("arrow"), StationPictures.ARROW_RED), Expression.color(WingtipColors.Chart.WARNING_HEX.toColorInt()), ink),
                ),
                PropertyFactory.textHaloColor(casing),
                PropertyFactory.textHaloWidth(2f),
                PropertyFactory.iconAllowOverlap(true),
                PropertyFactory.iconIgnorePlacement(true),
                PropertyFactory.textAllowOverlap(true),
                PropertyFactory.textIgnorePlacement(true),
            ).also { it.minZoom = farthest },
            SymbolLayer(WORSE, SOURCE).withFilter(Expression.has("worse")).withProperties(
                PropertyFactory.iconImage(StationPictures.WORSE),
                PropertyFactory.iconTranslate(arrayOf(-WORSE_AT_DP, -WORSE_AT_DP)),
                PropertyFactory.iconTranslateAnchor(Property.ICON_TRANSLATE_ANCHOR_VIEWPORT),
                PropertyFactory.iconAllowOverlap(true),
                PropertyFactory.iconIgnorePlacement(true),
            ).also { it.minZoom = farthest },
        )
    }

    /** Where the arrow sits from the field, up and to the right, and the
     *  badge, up and to the left, dp: clear of the symbol's weather ring. */
    private const val ARROW_AT_DP = 18f
    private const val WORSE_AT_DP = 13f

    /** Each mark a point with what its layers draw, a member left out
     *  where its layer draws nothing there: the barb and lines with the
     *  station model on, the arrow with the arrows on, the badge with it on. */
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
                        m.lines?.let { put("lines", it) }
                        if (settings.windArrows && m.arrow != null) {
                            put("arrow", if (m.arrow.red) StationPictures.ARROW_RED else StationPictures.ARROW)
                            put("to", m.arrow.toDeg)
                            put("figures", m.arrow.figures)
                        }
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
