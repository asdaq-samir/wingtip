package app.wingtipmaps.android.map.flow

import app.wingtipmaps.android.api.generated.WeatherArea
import app.wingtipmaps.android.design.generated.WingtipColors
import app.wingtipmaps.android.design.generated.WingtipMapLabel
import app.wingtipmaps.android.map.MapDim
import app.wingtipmaps.android.map.MapLabels
import app.wingtipmaps.android.map.MapStyle
import kotlinx.serialization.json.add
import kotlinx.serialization.json.addJsonArray
import kotlinx.serialization.json.addJsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject
import org.maplibre.android.maps.Style
import org.maplibre.android.style.expressions.Expression
import org.maplibre.android.style.layers.Layer
import org.maplibre.android.style.layers.LineLayer
import org.maplibre.android.style.layers.Property
import org.maplibre.android.style.layers.PropertyFactory
import org.maplibre.android.style.layers.SymbolLayer
import org.maplibre.android.style.sources.GeoJsonSource
import java.util.Locale

/**
 * The G-AIRMETs for the hour Model Weather shows (ModelWeatherLayer's),
 * dashed, each with AWC's short hazard label along it. At night dimmed
 * with the chart by their colour, as MapDim.colour dims a constant one
 * (the owner's "Dim by colour", 2026-11-27): each outline's own colour
 * runs to black with the chart's brightness, so nothing is brighter than
 * the chart under it (AIM 8-1-6), and the words take map.label.night-ink's
 * lighter ink on the tag's dark halo, left whole (MapLabels.NIGHT_HALO),
 * where they were the day's ink on a white halo at full light (the
 * round-7 phones audit's NA1).
 */
internal object AirmetLayer {
    private const val SOURCE = "flow-gairmets"
    private const val LINE = "flow-gairmet-line"
    private const val LABEL = "flow-gairmet-label"
    private var night = false

    /** Each G-AIRMET's colour by its hazard, as aviationweather.gov's map
     *  tells them apart (the web's weatherColours AREA_COLOURS). */
    private val AREA_INKS = mapOf(
        "Icing" to WingtipColors.Weather.ICING_HEX, "ICE" to WingtipColors.Weather.ICING_HEX,
        "Turbulence" to WingtipColors.Weather.TURBULENCE_HEX, "TURB" to WingtipColors.Weather.TURBULENCE_HEX,
        "IFR conditions" to WingtipColors.Weather.IFR_HEX, "IFR" to WingtipColors.Weather.IFR_HEX,
        "Mountains obscured" to WingtipColors.Weather.MOUNTAINS_HEX, "MTN OBSCN" to WingtipColors.Weather.MOUNTAINS_HEX,
        "Low-level wind shear" to WingtipColors.Weather.SHEAR_HEX, "Strong surface winds" to WingtipColors.Weather.WIND_HEX,
        "ASH" to WingtipColors.Weather.ASH_HEX,
    )

    /** A hazard's words' ink after dark (map.label.night-ink): turbulence's by its text ink, the deeper amber the
     *  table is keyed on; a colour not in the table keeps its own. */
    fun nightInk(day: String): String {
        val key = if (day == WingtipColors.Weather.TURBULENCE_HEX) WingtipColors.Weather.TURBULENCE_TEXT_HEX else day
        return WingtipMapLabel.NIGHT_INK[key.lowercase(Locale.US)] ?: day
    }

    /** Each G-AIRMET an outline closed back at its first point, longitude
     *  first, with its colour, its words' night ink and its label. */
    fun geoJson(areas: List<WeatherArea>, labels: Map<String, String>): String = buildJsonObject {
        put("type", "FeatureCollection")
        putJsonArray("features") {
            for (a in areas) {
                val ring = a.coords.filter { it.size >= 2 }
                if (ring.size < 2) continue
                addJsonObject {
                    put("type", "Feature")
                    putJsonObject("properties") {
                        val colour = AREA_INKS[a.hazard.orEmpty()] ?: WingtipColors.Weather.OTHER_HEX
                        put("colour", colour)
                        put("night", nightInk(colour))
                        put("label", labels[a.hazard.orEmpty()] ?: a.hazard.orEmpty())
                    }
                    putJsonObject("geometry") {
                        put("type", "LineString")
                        putJsonArray("coordinates") { for (p in ring + listOf(ring.first())) addJsonArray { add(p[1]); add(p[0]) } }
                    }
                }
            }
        }
    }.toString()

    /** The outlines and their words on `style` from `json`, each layer put by `below`; taken off for null. */
    fun draw(style: Style, json: String?, below: (Style, Layer) -> Unit) {
        if (json == null) {
            for (id in listOf(LABEL, LINE)) style.getLayer(id)?.let(style::removeLayer)
            style.getSource(SOURCE)?.let(style::removeSource)
            return
        }
        val source = style.getSourceAs<GeoJsonSource>(SOURCE)
        if (source != null) {
            source.setGeoJson(json)
            return
        }
        style.addSource(GeoJsonSource(SOURCE, json))
        val line = LineLayer(LINE, SOURCE).withProperties(
            PropertyFactory.lineColor(dimmed("colour")),
            PropertyFactory.lineWidth(1.5f),
            PropertyFactory.lineDasharray(arrayOf(3f, 2.5f)),
        )
        val label = SymbolLayer(LABEL, SOURCE).withProperties(
            PropertyFactory.symbolPlacement(Property.SYMBOL_PLACEMENT_LINE),
            PropertyFactory.textField(Expression.get("label")),
            PropertyFactory.textFont(arrayOf(MapStyle.FONT)),
            PropertyFactory.textSize(MapLabels.lateSize(WingtipMapLabel.SIZE_SMALL)),
            PropertyFactory.symbolSpacing(320f),
            PropertyFactory.textHaloWidth(WingtipMapLabel.HALO),
        )
        below(style, line)
        below(style, label)
        paint(style, night)
    }

    /** The words' ink and halo by day or night, set as night turns (ChartMap.paint); the Dimmer's steps need
     *  nothing, as the colours read the chart's dim themselves. */
    fun paint(style: Style, night: Boolean) {
        this.night = night
        style.getLayerAs<SymbolLayer>(LABEL)?.setProperties(
            PropertyFactory.textColor(dimmed(if (night) "night" else "colour")),
            PropertyFactory.textHaloColor(if (night) MapLabels.NIGHT_HALO else WingtipColors.Chart.CASING_HEX),
        )
    }

    /** A feature's colour (its property `key`) times the chart's dim, as MapDim.colour does a constant one:
     *  black at none, itself at 1 (by day the dim is 1). */
    private fun dimmed(key: String): Expression = Expression.interpolate(
        Expression.linear(),
        Expression.coalesce(Expression.globalState(MapDim.STATE), Expression.literal(1f)),
        Expression.stop(0f, Expression.color(android.graphics.Color.BLACK)),
        Expression.stop(1f, Expression.toColor(Expression.get(key))),
    )
}
