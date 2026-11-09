package app.wingtipmaps.android.map

import android.graphics.Color
import androidx.core.graphics.toColorInt
import app.wingtipmaps.android.design.generated.WingtipColors
import app.wingtipmaps.android.emergency.EmergencyModel
import kotlinx.serialization.json.add
import kotlinx.serialization.json.addJsonArray
import kotlinx.serialization.json.addJsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject
import org.maplibre.android.maps.Style
import org.maplibre.android.style.expressions.Expression
import org.maplibre.android.style.layers.CircleLayer
import org.maplibre.android.style.layers.Layer
import org.maplibre.android.style.layers.LineLayer
import org.maplibre.android.style.layers.Property
import org.maplibre.android.style.layers.PropertyFactory
import org.maplibre.android.style.sources.GeoJsonSource

/** The emergency assistant's line on the map: from own ship to the field
 *  picked (EmergencyModel), as the web's EmergencyGl draws it. */
data class EmergencyLine(val fromLat: Double, val fromLon: Double, val toLat: Double, val toLon: Double) {
    companion object {
        /** The line while the assistant has both ends; none otherwise. */
        fun of(state: EmergencyModel.State): EmergencyLine? {
            val fix = state.fix ?: return null
            val to = state.picked ?: return null
            return EmergencyLine(fix.lat, fix.lon, to.lat, to.lon)
        }
    }
}

/**
 * The line and the ring round the field, in the emergency red on a white
 * casing so it reads over any chart, over the route and under own ship
 * (the web's EmergencyGl layers). Empty while the assistant is shut.
 */
object EmergencyLayer {
    const val SOURCE = "emergency"
    private const val CASING = "emergency-line-casing"
    private const val LINE = "emergency-line"
    private const val FIELD = "emergency-field"

    fun draw(style: Style, line: EmergencyLine?, below: String) {
        val json = geoJson(line)
        val source = style.getSourceAs<GeoJsonSource>(SOURCE)
        if (source != null) {
            source.setGeoJson(json)
            return
        }
        style.addSource(GeoJsonSource(SOURCE, json))
        val red = WingtipColors.Chart.EMERGENCY_HEX.toColorInt()
        val isLine = Expression.eq(Expression.get("kind"), Expression.literal("to"))
        val layers: List<Layer> = listOf(
            LineLayer(CASING, SOURCE).withProperties(PropertyFactory.lineColor(Color.WHITE), PropertyFactory.lineWidth(7f), PropertyFactory.lineCap(Property.LINE_CAP_ROUND))
                .withFilter(isLine),
            LineLayer(LINE, SOURCE).withProperties(PropertyFactory.lineColor(red), PropertyFactory.lineWidth(4f), PropertyFactory.lineCap(Property.LINE_CAP_ROUND))
                .withFilter(isLine),
            CircleLayer(FIELD, SOURCE).withProperties(
                PropertyFactory.circleRadius(16f), PropertyFactory.circleOpacity(0f),
                PropertyFactory.circleStrokeColor(red), PropertyFactory.circleStrokeWidth(4f),
            ).withFilter(Expression.eq(Expression.get("kind"), Expression.literal("field"))),
        )
        for (layer in layers) if (style.getLayer(below) != null) style.addLayerBelow(layer, below) else style.addLayer(layer)
    }

    /** The line and the field's point as GeoJSON, longitude first; no
     *  feature with no line. */
    fun geoJson(line: EmergencyLine?): String = buildJsonObject {
        put("type", "FeatureCollection")
        putJsonArray("features") {
            if (line != null) {
                addJsonObject {
                    put("type", "Feature")
                    putJsonObject("properties") { put("kind", "to") }
                    putJsonObject("geometry") {
                        put("type", "LineString")
                        putJsonArray("coordinates") {
                            addJsonArray { add(line.fromLon); add(line.fromLat) }
                            addJsonArray { add(line.toLon); add(line.toLat) }
                        }
                    }
                }
                addJsonObject {
                    put("type", "Feature")
                    putJsonObject("properties") { put("kind", "field") }
                    putJsonObject("geometry") {
                        put("type", "Point")
                        putJsonArray("coordinates") { add(line.toLon); add(line.toLat) }
                    }
                }
            }
        }
    }.toString()
}
