package app.wingtipmaps.android.map

import app.wingtipmaps.android.design.generated.WingtipColors
import app.wingtipmaps.android.map.MapStyle.e
import app.wingtipmaps.android.map.MapStyle.glZoom
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonObjectBuilder
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject

/**
 * The special-use areas from the tiles' `special_use` and
 * `special_use_labels` layers (the web's glStyle specialUseLayers and
 * glSuaLabels): each boundary a solid line and a hatched band of short
 * diagonal ticks along its inside, a restricted area drawn over a MOA it
 * lies in, and ForeFlight's tab on its boundary (the owner's screenshot
 * near Brady, TX, 2026-11-12): a dark tab bordered in the area's ink,
 * white bold type, its name over its altitudes, "M-BRADY NOR*:" over
 * "3600-17999", the long side along the line and just inside the area.
 * Plain JSON for MapStyle's first style; the pictures are OverlayPictures'.
 */
object SpecialUseLayers {
    /** The areas' inks (the web's SUA_INK), ForeFlight's over the
     *  sectional (the owner's screenshot over Lake Michigan, 2026-11-08):
     *  restricted, prohibited, warning and danger areas orange-brown, MOAs
     *  and alert areas magenta. By the FAA's TYPE_CODE (wingtip.sua TYPES). */
    const val RESTRICTED_INK = WingtipColors.Chart.SPECIAL_USE_HEX
    val MOA_INK = MapStyle.AIRSPACE_INK.getValue("C").colour
    private val RESTRICTED = listOf("P", "R", "W", "D")
    private val MOA = listOf("MOA", "A")
    const val HATCH_RESTRICTED = "sua|hatch|restricted"
    const val HATCH_MOA = "sua|hatch|moa"
    /** The tabs' pictures, by ink (the web's suaTab). */
    const val TAB_RESTRICTED = "sua|tab|restricted"
    const val TAB_MOA = "sua|tab|moa"

    /** The lines from Leaflet's 7, a few states across, as Class C; the
     *  tabs from 8, with the Class B, C and D tabs. */
    const val FROM = 7.0
    const val LABELS = "sua-labels"
    val IDS = listOf("sua-band", "sua-line", LABELS)

    private val restricted = e("match", e("get", "type"), RESTRICTED, true, false)

    /** The band and the line (the web's specialUseLayers). */
    fun lines(): List<JsonObject> {
        val filter = e("match", e("get", "type"), RESTRICTED + MOA, true, false)
        val order = e("case", restricted, 1, 0)
        return listOf(
            buildJsonObject {
                put("id", "sua-band")
                put("type", "line")
                from("special_use")
                put("minzoom", glZoom(FROM))
                put("filter", filter)
                putJsonObject("layout") {
                    put("line-join", "round")
                    put("line-sort-key", order)
                }
                putJsonObject("paint") {
                    put("line-pattern", e("case", restricted, HATCH_RESTRICTED, HATCH_MOA))
                    put("line-width", MapStyle.BAND_WIDTH)
                    put("line-offset", MapStyle.BAND_OFFSET)
                }
            },
            buildJsonObject {
                put("id", "sua-line")
                put("type", "line")
                from("special_use")
                put("minzoom", glZoom(FROM))
                put("filter", filter)
                putJsonObject("layout") {
                    put("line-join", "round")
                    put("line-cap", "round")
                    put("line-sort-key", order)
                }
                putJsonObject("paint") {
                    put("line-color", e("case", restricted, RESTRICTED_INK, MOA_INK))
                    put("line-width", e("interpolate", e("linear"), e("zoom"), glZoom(7.0), 2.0, glZoom(10.0), 3.0))
                }
            },
        )
    }

    /** A figure of the tab's as ForeFlight writes it: whole feet, no comma. */
    private fun feet(field: String) = e("to-string", e("round", e("get", field)))

    /** A limit in the tab's words, from the tiles' figure and its reference
     *  (services/jobs/charts/sua_labels.py `limit`, which turns the FAA's
     *  "to but not including" FL180 into 17999 as the FAA's CIFP does): the
     *  surface "SFC", above the ground "500AGL", a flight level "FL230", no
     *  ceiling "UNL", else feet MSL, "7000". */
    private fun limit(ft: String, ref: String) = e(
        "match", e("get", ref),
        "SFC", "SFC",
        "UNL", "UNL",
        "AGL", e("concat", feet(ft), "AGL"),
        "FL", e("concat", "FL", e("to-string", e("round", e("/", e("get", ft), 100)))),
        feet(ft),
    )

    /** "M-BRNWD 2 W*:" over "7000-17999": the charts job's name (its
     *  letter and the name, "*" where cut), then the floor and the ceiling. */
    val TAB_TEXT: JsonArray = e("concat", e("get", "label"), ":\n", limit("floor_ft", "floor_ref"), "-", limit("ceiling_ft", "ceiling_ref"))

    /** How far off its point a tab sits, ems towards the area's side:
     *  about half its two lines' height, so its edge meets the line. */
    private const val INSIDE_EM = 1.35

    /** The tabs' one layer, from the tiles' `special_use_labels` (the
     *  charts job's points, one an area on its longest side, `angle` its
     *  turn and `side` where the area lies); or where an older archive has
     *  none of them, the area's name alone along its `special_use`
     *  boundary, whose floor reads 0 for a floor the FAA gives above the
     *  ground, so its figures are not written. The map never turns
     *  (ChartMap), so the tiles' turn is the screen's. */
    fun labels(labelPoints: Boolean): JsonObject = buildJsonObject {
        put("id", LABELS)
        put("type", "symbol")
        from(if (labelPoints) "special_use_labels" else "special_use")
        put("minzoom", glZoom(MapStyle.AIRSPACE_LABELS_FROM))
        putJsonObject("layout") {
            put("text-font", e(MapStyle.FONT))
            put("text-size", e("interpolate", e("linear"), e("zoom"), glZoom(8.0), 11, glZoom(12.0), 13))
            put("text-line-height", 1.15)
            put("icon-image", e("case", restricted, TAB_RESTRICTED, TAB_MOA))
            put("icon-text-fit", "both")
            put("icon-text-fit-padding", e(2, 6, 2, 6))
            put("text-padding", 4)
            put("text-allow-overlap", false)
            put("icon-allow-overlap", false)
            // A restricted area's tab before a MOA's it lies in, as its line
            // is drawn over the MOA's.
            put("symbol-sort-key", e("case", restricted, 0, 1))
            if (labelPoints) {
                put("text-field", TAB_TEXT)
                put("text-rotate", e("get", "angle"))
                put("icon-rotate", e("get", "angle"))
                put("text-rotation-alignment", "map")
                put("icon-rotation-alignment", "map")
                // In the text's own turned frame: below it where `side` is 1,
                // above where it is -1.
                put("text-offset", e("case", e("==", e("get", "side"), 1), e("literal", e(0, INSIDE_EM)), e("literal", e(0, -INSIDE_EM))))
            } else {
                put("text-field", e("get", "name"))
                put("symbol-placement", "line")
                put("symbol-spacing", 480)
                put("text-rotation-alignment", "viewport")
                put("icon-rotation-alignment", "viewport")
                put("text-keep-upright", true)
                put("text-max-angle", 30)
            }
        }
        putJsonObject("paint") { put("text-color", WingtipColors.Chart.CASING_HEX) }
    }

    private fun JsonObjectBuilder.from(layer: String) {
        put("source", MapStyle.OVERLAY_SOURCE)
        put("source-layer", layer)
    }
}
