package app.wingtipmaps.android.map

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.maplibre.android.maps.Style
import org.maplibre.android.style.expressions.Expression

/**
 * The Dimmer over what is drawn on the chart, not the chart's tiles alone
 * (the web's lib/map/gl/mapDim.ts; the round-4 phones audit, 2026-11-27:
 * at night the Dimmer darkened Android's chart while its fields, weather
 * marks and traffic stayed at full light). At night every symbol's words
 * and icons, every line and every circle is drawn at the chart's own
 * brightness as an opacity (ChartLook.paint's brightnessMax: 0.5 by
 * default, 0.3 at the Dimmer's deepest), so nothing on the map is
 * brighter than the chart under it and the pilot's dark adaptation is
 * kept (AIM 8-1-6). By day it is 1: a light halo made see-through would
 * only lose its words in the chart's ink.
 *
 * One global state (MapLibre's `global-state`), set as the chart is
 * painted (ChartMap.paint), read by each such opacity, so a Dimmer's
 * move is one setGlobalStateProperty with no layer made again. Rasters
 * (the chart, imagery, a plate: their own brightness) and fills (the
 * airspace's and the weather's washes, already faint) are not touched.
 */
object MapDim {
    const val STATE = "mapDim"

    /** The opacities dimmed, by layer type. */
    private val DIMMED = mapOf(
        "line" to listOf("line-opacity"),
        "circle" to listOf("circle-opacity", "circle-stroke-opacity"),
        "symbol" to listOf("icon-opacity", "text-opacity"),
    )

    private val json = Json { ignoreUnknownKeys = true }

    private val DIM: JsonArray = JsonArray(listOf(JsonPrimitive("coalesce"), JsonArray(listOf(JsonPrimitive("global-state"), JsonPrimitive(STATE))), JsonPrimitive(1)))

    /** The figure the global state holds: the chart's brightness at
     *  night, 1 by day. */
    fun of(night: Boolean, chartBrightness: Float): Float = if (night) chartBrightness.coerceIn(0f, 1f) else 1f

    /** The dim set on a style in, at once for every layer that reads it. */
    fun set(style: Style, night: Boolean, chartBrightness: Float) {
        style.setGlobalStateProperty(STATE, com.google.gson.JsonPrimitive(of(night, chartBrightness)))
    }

    /** An opacity for a layer built in code: `base` times the dim. */
    fun opacity(base: Float = 1f): Expression =
        Expression.product(Expression.coalesce(Expression.globalState(STATE), Expression.literal(1f)), Expression.literal(base))

    /** One opacity times the dim. MapLibre takes the zoom only as the
     *  input of a top-level interpolate or step, so there the dim goes
     *  into each stop's output; anything else is multiplied whole. A
     *  legacy function object is left as written. */
    fun dimmedOpacity(value: JsonElement?): JsonElement {
        fun times(v: JsonElement) = JsonArray(listOf(JsonPrimitive("*"), DIM, v))
        if (value is JsonObject) return value
        val op = (value as? JsonArray)?.firstOrNull()?.let { (it as? JsonPrimitive)?.content }
        if (value is JsonArray && op != null && op.startsWith("interpolate")) {
            return JsonArray(value.mapIndexed { i, s -> if (i >= 3 && i % 2 == 0) times(s) else s })
        }
        if (value is JsonArray && op == "step") {
            return JsonArray(value.mapIndexed { i, s -> if (i == 2 || (i > 2 && i % 2 == 0)) times(s) else s })
        }
        return times(value ?: JsonPrimitive(1))
    }

    /** A layer with its opacities, its own or 1, times the dim. */
    fun layer(layer: JsonObject): JsonObject {
        val props = DIMMED[layer["type"]?.jsonPrimitive?.content] ?: return layer
        val paint = layer["paint"]?.jsonObject.orEmpty().toMutableMap()
        for (p in props) paint[p] = dimmedOpacity(paint[p])
        return JsonObject(layer + ("paint" to JsonObject(paint)))
    }

    /** A style's JSON with every line, circle and symbol layer dimmed. */
    fun style(style: String): String {
        val root = json.parseToJsonElement(style).jsonObject
        val layers = root["layers"]?.jsonArray ?: return style
        return JsonObject(root + ("layers" to JsonArray(layers.map { layer(it.jsonObject) }))).toString()
    }
}
