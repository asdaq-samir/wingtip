package app.wingtipmaps.android.map

import android.content.Context
import app.wingtipmaps.android.design.generated.WingtipColors
import app.wingtipmaps.android.design.generated.WingtipMapLabel
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.util.Locale
import kotlin.math.roundToInt

/**
 * The map's words after the style is written (MapStyle), as the web's
 * labelText, labelHalo and labelInk letter them (lib/map/gl/layers/common):
 *
 * - **Larger Map Labels** (the Map card's switch, the owner, 2026-11-21):
 *   every symbol layer's text size times the pilot's font scale, never
 *   under 1 nor over the tokens' map.label.scale-max (1.2), so a chart's
 *   lettering stays a chart's; off, the map's words are their own size, as
 *   Apple Maps and ForeFlight keep theirs. MapLibre takes the zoom only as
 *   the input of the top interpolate or step, so the scale goes in each
 *   stop's output.
 * - **After dark** (rules.md 13.6): a light-haloed word turns to its night
 *   ink (map.label.night-ink: the field's blue and magenta, the VFR green,
 *   the fixes' dark, each lighter) on the tag's dark halo at
 *   map.label.halo-night, as Apple Maps letters its dark map; the white
 *   halo left the coloured idents at about 2.5:1 over the dimmed chart, the
 *   night inks on the dark halo 6.5:1 or more. A colour not in the table
 *   keeps its own.
 */
object MapLabels {
    private val json = Json { ignoreUnknownKeys = true }

    /** How far the map's words grow: the font scale with the switch on,
     *  1 to scale-max; 1 off. */
    fun scale(on: Boolean, context: Context): Float =
        if (!on) 1f else context.resources.configuration.fontScale.coerceIn(1f, WingtipMapLabel.SCALE_MAX)

    /** The style with its words scaled and, at night, inked for the dark. */
    fun adjust(style: String, scale: Float, night: Boolean): String {
        if (scale == 1f && !night) return style
        val root = json.parseToJsonElement(style).jsonObject
        val layers = root["layers"]?.jsonArray ?: return style
        val out = JsonObject(root + ("layers" to JsonArray(layers.map { layer(it.jsonObject, scale, night) })))
        return out.toString()
    }

    fun layer(layer: JsonObject, scale: Float, night: Boolean): JsonObject {
        if (layer["type"]?.jsonPrimitive?.content != "symbol") return layer
        var out = layer
        val layout = layer["layout"]?.jsonObject
        val size = layout?.get("text-size")
        if (scale != 1f && layout != null && size != null) {
            out = JsonObject(out + ("layout" to JsonObject(layout + ("text-size" to scaled(size, scale)))))
        }
        val paint = layer["paint"]?.jsonObject
        val halo = paint?.get("text-halo-color")?.let { (it as? JsonPrimitive)?.content?.lowercase(Locale.US) }
        if (night && paint != null && halo == WingtipColors.Chart.CASING_HEX) {
            val inked = paint + ("text-halo-color" to JsonPrimitive(NIGHT_HALO)) + (paint["text-color"]?.let { "text-color" to nightInk(it) } ?: return out)
            out = JsonObject(out + ("paint" to JsonObject(inked)))
        }
        return out
    }

    /** A size times the scale: a number, or each output of a top
     *  interpolate (after its input, every second element) or step. */
    fun scaled(size: JsonElement, scale: Float): JsonElement {
        (size as? JsonPrimitive)?.doubleOrNull?.let { return JsonPrimitive(it * scale) }
        val parts = (size as? JsonArray) ?: return size
        val head = (parts.firstOrNull() as? JsonPrimitive)?.content
        // ["interpolate", type, input, z0, v0, z1, v1, ...]; ["step", input, v0, z1, v1, ...].
        val first = when (head) {
            "interpolate" -> 4
            "step" -> 2
            else -> return JsonArray(listOf(JsonPrimitive("*"), size, JsonPrimitive(scale)))
        }
        return JsonArray(
            parts.mapIndexed { i, part ->
                if (i >= first && (i - first) % 2 == 0) JsonArray(listOf(JsonPrimitive("*"), part, JsonPrimitive(scale))) else part
            },
        )
    }

    /** A day ink's night one: a colour from the table, or a match on what
     *  an expression gives, a colour not in it keeping its own. */
    fun nightInk(day: JsonElement): JsonElement {
        (day as? JsonPrimitive)?.let { p -> return WingtipMapLabel.NIGHT_INK[p.content.lowercase(Locale.US)]?.let(::JsonPrimitive) ?: day }
        val pairs = WingtipMapLabel.NIGHT_INK.flatMap { (d, n) -> listOf(JsonPrimitive(d), JsonPrimitive(n)) }
        return JsonArray(listOf(JsonPrimitive("match"), day) + pairs + day)
    }

    /** The tag's dark at map.label.halo-night, from the token's colour. */
    private val NIGHT_HALO: String = WingtipColors.Chart.Tag.let { tag ->
        String.format(Locale.US, "rgba(%d, %d, %d, %.2f)", (tag.red * 255).roundToInt(), (tag.green * 255).roundToInt(), (tag.blue * 255).roundToInt(), WingtipMapLabel.HALO_NIGHT)
    }
}
