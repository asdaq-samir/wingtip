package app.wingtipmaps.android.map

import app.wingtipmaps.android.design.generated.WingtipDimmer
import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.generated.mapDimWords
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.maplibre.android.maps.Style
import org.maplibre.android.style.expressions.Expression
import java.util.Locale

/**
 * The Dimmer over what is drawn on the chart, not the chart's tiles alone,
 * as the web's lib/map/gl/mapDim: at night every symbol's icons, every
 * line and every circle is drawn at the chart's own brightness as an
 * opacity (ChartLook.paint's brightnessMax: 0.5 by default, 0.3 at the
 * Dimmer's deepest), so nothing on the map is brighter than the chart
 * under it and the pilot's dark adaptation is kept (AIM 8-1-6). By day it
 * is 1. A light-haloed word is not faded with its halo: its night ink is
 * brought to the paper's light by colour (`wordLight`, `nightWord`) on
 * the halo kept whole, about 5:1 on it at the night's default Dimmer.
 *
 * One global state each (MapLibre's `global-state`), set as the chart is
 * painted (ChartMap.paint), so a Dimmer's move is a setGlobalStateProperty
 * with no layer made again. Rasters and fills are not touched. The
 * policy's names, tables and figures are design/tokens.json's map-dim
 * group (WingtipDimmer), and apps/web/src/lib/fixtures/mapDim.json holds
 * this to the web's and iOS's cases (MapDimTest).
 */
object MapDim {
    const val STATE = WingtipDimmer.STATE
    const val WORD_STATE = WingtipDimmer.WORD_STATE

    private val DIM: JsonArray = Json.array("coalesce", Json.array("global-state", STATE), 1)

    /** The figure the global state holds: the chart's brightness at
     *  night, 1 by day. */
    fun of(night: Boolean, chartBrightness: Float): Float = if (night) chartBrightness.coerceIn(0f, 1f) else 1f

    /** The dim and the words' light set on a style, at once for every
     *  layer that reads them. */
    fun set(style: Style, night: Boolean, chartBrightness: Float, contrast: Float) {
        style.setGlobalStateProperty(STATE, com.google.gson.JsonPrimitive(of(night, chartBrightness)))
        val words = wordLight(night, chartBrightness.toDouble(), contrast.toDouble())
        style.setGlobalStateProperty(WORD_STATE, com.google.gson.JsonPrimitive(words))
    }

    /** An opacity for a layer built in code: `base` times the dim. */
    fun opacity(base: Float = 1f): Expression =
        Expression.product(Expression.coalesce(Expression.globalState(STATE), Expression.literal(1f)), Expression.literal(base))

    /**
     * A constant colour times the dim, for a line or circle that must keep
     * its contrast with the chart at night (the web's DIM_BY_COLOUR):
     * black at none, itself at 1, as the chart's own raster-brightness-max
     * dims its inks, so the two darken together (the course's magenta over
     * the paper at the night's default Dimmer about 2.7 to 1, where
     * see-through it fell to 1.04 to 1). Its alpha is kept. A colour by
     * feature is a layer a colour instead, so a Dimmer's move lays no
     * source out again. The terrain hazard's tint is never dimmed.
     */
    fun colour(argb: Int): Expression = Expression.interpolate(
        Expression.linear(),
        Expression.coalesce(Expression.globalState(STATE), Expression.literal(1f)),
        Expression.stop(0f, Expression.color(argb and 0xFF000000.toInt())),
        Expression.stop(1f, Expression.color(argb)),
    )

    /** A light-haloed word's colour after dark, for a layer built in code
     *  (a TFR's number): the day ink's night word at the words' light. */
    fun word(dayHex: String): Expression = Expression.raw(atWordLight(JsonPrimitive(nightWord(dayHex))).toString())

    /** A style's colour at the words' light: black at none, itself at 1
     *  (the web's atNightLight). */
    fun atWordLight(colour: JsonElement): JsonArray =
        Json.array("interpolate", Json.array("linear"), Json.array("number", Json.array("global-state", WORD_STATE), 0), 0, "black", 1, colour)

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

    /** A layer with its opacities, its own or 1, times the dim; a
     *  light-haloed word's left whole, as its colour is dimmed instead. */
    fun layer(layer: JsonObject): JsonObject {
        val props = WingtipDimmer.OPACITY[layer["type"]?.jsonPrimitive?.content] ?: return layer
        val paint = layer["paint"]?.jsonObject.orEmpty().toMutableMap()
        val haloed = MapLabels.lightHaloed(layer)
        for (p in props) if (!(haloed && p == "text-opacity")) paint[p] = dimmedOpacity(paint[p])
        return JsonObject(layer + ("paint" to JsonObject(paint)))
    }

    /** A style with every line, circle and symbol layer dimmed. */
    fun style(root: JsonObject): JsonObject {
        val layers = root["layers"]?.jsonArray ?: return root
        return JsonObject(root + ("layers" to JsonArray(layers.map { layer(it.jsonObject) })))
    }

    /** The words' share of their night inks after dark, 0 by day: the
     *  engine's map_dim_words (the web's mapDimWords, one copy of the maths
     *  for every app, its cases apps/web/src/lib/fixtures/mapDim.json), the
     *  paper's light against the towered blue's, floored under the night's
     *  own contrast, in hundredths. Asked as the chart is painted, once a
     *  Dimmer's move. */
    fun wordLight(night: Boolean, brightness: Double, contrast: Double): Double =
        Engine.mapDimWords(night, brightness, contrast).getOrNull()?.words ?: if (night) WingtipDimmer.WORD_FLOOR.toDouble() else 0.0

    /** A day ink's night word: its night ink (map.label.night-ink) brought
     *  down to the towered blue's light (map-dim's nightWord), so at the
     *  words' light none is brighter than the paper; a colour not in the
     *  table keeps its own. */
    fun nightWord(dayHex: String): String = WingtipDimmer.NIGHT_WORD[dayHex.lowercase(Locale.US)] ?: dayHex

    /** A style's expression from plain values and elements. */
    private object Json {
        fun array(vararg parts: Any): JsonArray = JsonArray(
            parts.map {
                when (it) {
                    is JsonElement -> it
                    is String -> JsonPrimitive(it)
                    is Number -> JsonPrimitive(it)
                    else -> error("not a style value: $it")
                }
            },
        )
    }
}
