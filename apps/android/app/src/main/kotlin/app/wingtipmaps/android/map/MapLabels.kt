package app.wingtipmaps.android.map

import android.content.Context
import app.wingtipmaps.android.design.generated.WingtipColors
import app.wingtipmaps.android.design.generated.WingtipMapLabel
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.maplibre.android.maps.Style
import org.maplibre.android.style.expressions.Expression
import org.maplibre.android.style.layers.PropertyFactory
import org.maplibre.android.style.layers.PropertyValue
import org.maplibre.android.style.layers.SymbolLayer
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
 *   stop's output. The layers added after the style is in take the same
 *   scale (`late`, `lateSize`).
 * - **After dark** (rules.md 13.6): a light-haloed word turns to its night
 *   ink (map.label.night-ink: the field's blue and magenta, the VFR green,
 *   the fixes' dark, each lighter) on the tag's dark halo at
 *   map.label.halo-night, as Apple Maps letters its dark map; the white
 *   halo left the coloured idents at about 2.5:1 over the dimmed chart, the
 *   night inks on the dark halo 6.5:1 or more. A colour not in the table
 *   keeps its own.
 */
object MapLabels {
    /** How far the map's words grow: the font scale with the switch on,
     *  1 to scale-max; 1 off. */
    fun scale(on: Boolean, context: Context): Float = capped(on, context.resources.configuration.fontScale)

    /** The font scale as the map's words take it: 1 to scale-max with the
     *  switch on, 1 off. */
    fun capped(on: Boolean, fontScale: Float): Float = if (!on) 1f else fontScale.coerceIn(1f, WingtipMapLabel.SCALE_MAX)

    /**
     * The scale of the words drawn after the style is in -- the station
     * model's winds and lines, the AIRMETs' names, the 3D shelves' tabs and
     * the plates' fix tags -- the style's own, set as each style is written
     * (`styled`). A new style takes every layer off, and each is added
     * again over it with this size, so a change of the switch reaches
     * them too.
     */
    @Volatile
    var late: Float = 1f
        internal set

    /** The scale for a style about to be written, kept for the late layers. */
    fun styled(on: Boolean, context: Context): Float = scale(on, context).also { late = it }

    /** A late layer's text size, `dp` at the style's scale. */
    fun lateSize(dp: Float): Float = dp * late

    /** The style with its words scaled and, at night, inked for the dark. */
    fun adjust(style: JsonObject, scale: Float, night: Boolean): JsonObject {
        if (scale == 1f && !night) return style
        val layers = style["layers"]?.jsonArray ?: return style
        return JsonObject(style + ("layers" to JsonArray(layers.map { layer(it.jsonObject, scale, night) })))
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

    /**
     * The words of a style already in, changed in place as Larger Map
     * Labels or the dark theme turns: each symbol layer of the style as
     * MapStyle wrote it (`written`, before `adjust`) given its size and
     * inks again, and each late layer's plain size by the change of scale,
     * so neither turn sets a new style and asks for every tile again. A
     * late picture (PlateLayer's tags) takes the scale when next drawn.
     */
    fun relabel(style: Style, written: List<JsonObject>, scale: Float, night: Boolean) {
        val was = late
        late = scale
        val ids = HashSet<String>()
        for (day in written) {
            if (day["type"]?.jsonPrimitive?.content != "symbol") continue
            val id = day["id"]?.jsonPrimitive?.content ?: continue
            ids += id
            val layer = style.getLayerAs<SymbolLayer>(id) ?: continue
            val now = layer(day, scale, night)
            val props = listOfNotNull(
                now["layout"]?.jsonObject?.get("text-size")?.let { PropertyValue("text-size", live(it)) },
                now["paint"]?.jsonObject?.get("text-color")?.let { PropertyValue("text-color", live(it)) },
                now["paint"]?.jsonObject?.get("text-halo-color")?.let { PropertyValue("text-halo-color", live(it)) },
            )
            if (props.isNotEmpty()) layer.setProperties(*props.toTypedArray())
        }
        if (scale == was) return
        for (layer in style.layers) {
            if (layer !is SymbolLayer || layer.id in ids) continue
            // A plain size only (lateSize's); an expression's value is no Float.
            val size = layer.textSize.takeIf { it.isValue }?.value ?: continue
            layer.setProperties(PropertyFactory.textSize(size * scale / was))
        }
    }

    /** A style's value as a layer takes it: a number, a colour's words,
     *  or an expression. */
    private fun live(value: JsonElement): Any =
        (value as? JsonPrimitive)?.let { it.doubleOrNull?.toFloat() ?: it.content } ?: Expression.raw(value.toString())

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
