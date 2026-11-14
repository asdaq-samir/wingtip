package app.wingtipmaps.android.map

import app.wingtipmaps.android.design.generated.WingtipColors
import app.wingtipmaps.android.design.generated.WingtipMap
import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.engine.generated.airspaceShelfLabel
import app.wingtipmaps.android.engine.generated.airspaceVolumeSpan
import app.wingtipmaps.android.format.Units
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min

/**
 * The airspace the 3D view stands up (Map3dLayer), each volume whole as
 * the planner sends it from the cycle's pack (GET /api/airspace/volumes,
 * wingtip.airspace_volumes): the web's airspaceVolumes.ts and
 * airspaceHeights.ts, as MapLibre Native's fill-extrusion layer takes
 * them -- a feature's `base_m` and `height_m`, metres, which it stands
 * the polygon between. Whole polygons, not the overlay tiles' pieces: a
 * volume cut at each tile's edge stood each piece on its own and broke
 * into slabs with stepped tops (the web's move to the volumes endpoint).
 * Pure, so it is tested without a map.
 *
 * How high each stands is the engine's (`airspace_volume_span`), as the
 * web's: the FAA's codes and descriptors read, the top drawn no higher
 * than Class A's floor. MapLibre Native has no 3D ground (see
 * docs/NATIVE-ANDROID.md, "3D"), so the map stands at sea level and asks
 * with no ground: a limit above the ground (AGL, or SFC with a figure)
 * has nothing to stand on and the rule leaves it out, as the web leaves a
 * volume out until its terrain is in.
 */
object AirspaceVolumes3d {
    /** A kind's ink, how see-through, and the app's zoom it is drawn from
     *  (the web's KINDS): far out only Class B and the special use areas,
     *  C from 9, D and surface E from 10. */
    data class Ink(val hex: String, val opacity: Float, val from: Double)

    /** By kind, in the order drawn (the faintest first). The special use
     *  kinds by the FAA's TYPE_CODE as the chart splits them (the web's
     *  SUA_INK): prohibited, restricted, warning and danger areas orange;
     *  MOAs and alert areas the Class C magenta. */
    val KINDS: Map<String, Ink> = linkedMapOf(
        "E" to Ink(WingtipColors.Chart.AIRSPACE_MAGENTA_HEX, 0.08f, 10.0),
        "D" to Ink(WingtipColors.Chart.AIRSPACE_BLUE_HEX, 0.14f, 10.0),
        "moa" to Ink(WingtipColors.Chart.AIRSPACE_MAGENTA_HEX, 0.13f, 7.0),
        "restricted" to Ink(WingtipColors.Chart.SPECIAL_USE_HEX, 0.16f, 7.0),
        "C" to Ink(WingtipColors.Chart.AIRSPACE_MAGENTA_HEX, 0.2f, 9.0),
        "B" to Ink(WingtipColors.Chart.AIRSPACE_BLUE_HEX, 0.22f, 7.0),
    )

    private val SUA_RESTRICTED = setOf("P", "R", "W", "D")

    /** The box asked for (the planner's south, west, north, east). */
    data class Box(val south: Double, val west: Double, val north: Double, val east: Double)

    /** The view's box out to the next half degree, so a pan within it asks
     *  nothing new, and no more than six degrees from its middle each way
     *  (the planner's MAX_SPAN_DEG), the web's boxOf. */
    fun boxOf(view: MapRest): Box {
        val span = 6.0
        val lat = (view.south + view.north) / 2
        val lon = (view.west + view.east) / 2
        fun half(v: Double, up: Boolean) = (if (up) ceil(v * 2) else floor(v * 2)) / 2
        return Box(
            south = half(max(view.south, lat - span), false),
            west = half(max(view.west, lon - span), false),
            north = half(min(view.north, lat + span), true),
            east = half(min(view.east, lon + span), true),
        )
    }

    /** The classes asked for at the app's zoom (Leaflet's levels, MapLibre's plus one). */
    fun classesAt(appZoom: Double): List<String> = listOf("B", "C", "D", "E").filter { appZoom >= KINDS.getValue(it).from }

    /** A feature's kind: its class, or a special use area's ink. */
    fun kindOf(p: JsonObject): String =
        if (text(p["layer"]) == "special_use") {
            if (text(p["type"]) in SUA_RESTRICTED) "restricted" else "moa"
        } else {
            text(p["class"]) ?: ""
        }

    /** A volume's limits as its data set has them, for the engine
     *  (`airspace_volume_span`): the NASR file's ceiling is MSL
     *  (wingtip.airspace_at._ceiling), its floor SFC, AGL or MSL; a special
     *  use area carries the FAA's own codes and descriptors (wingtip.sua),
     *  a TFR its references (the web's heightsOf). No ground: this map has
     *  none, so a limit above the ground is left out by the rule. */
    fun spanInput(p: JsonObject): EngineContract.AirspaceVolumeSpanInput = EngineContract.AirspaceVolumeSpanInput(
        floor = EngineContract.SpecialUseTabLimit(number(p["floor_ft"]), text(p["floor_ref"]), text(p["floor_desc"])),
        ceiling = EngineContract.SpecialUseTabLimit(
            number(p["ceiling_ft"]),
            if (text(p["layer"]) == "airspace") "MSL" else text(p["ceiling_ref"]),
            text(p["ceiling_desc"]),
        ),
    )

    /** The engine's floor and top, ft MSL, and whether the volume holds
     *  any of the plan's altitudes (Engine.rule logs a failure). */
    private fun engineSpan(input: EngineContract.AirspaceVolumeSpanInput) = Engine.airspaceVolumeSpan(input.floor, input.ceiling, input.ground, input.altitudesFt)

    /** The plan's altitudes, ft MSL, the volumes are held against: each
     *  leg's own (the nav log's), set as the plan changes (MapPane); null
     *  with no plan, when nothing fades (the web's planAltitudes). */
    private val _planAltitudes = MutableStateFlow<List<Double>?>(null)
    val planAltitudes: StateFlow<List<Double>?> = _planAltitudes.asStateFlow()

    fun planAltitudes(legsFt: List<Double?>) {
        val ft = legsFt.filterNotNull().map { Math.round(it).toDouble() }.distinct()
        _planAltitudes.value = ft.ifEmpty { null }
    }

    /** How strongly a volume is drawn: as its kind with no plan, stronger
     *  where it holds the plan's altitudes, fainter where it does not (the
     *  tokens' airspace-held and -faded); one extrusion layer each, as a
     *  layer's opacity is its own, not a feature's. */
    enum class Strength(val times: Double) { NONE(1.0), HELD(WingtipMap.AIRSPACE_HELD), FADED(WingtipMap.AIRSPACE_FADED) }

    /**
     * A volume's colour: its class's ink mixed toward the tokens' dark
     * (airspace-floor-low) at a surface floor and toward their light
     * (airspace-floor-high) at airspace-shade-top-ft and over, through the
     * ink itself half way, so a Class B's shelves step up in shade as they
     * do in altitude (the owner, 2026-11-14: "the class B airspace shelves
     * are not differentiating altitudes"; the web's shadeOf). "#rrggbb".
     */
    fun shadeOf(ink: String, floorFt: Double): String {
        val t = (floorFt / WingtipMap.AIRSPACE_SHADE_TOP_FT).coerceIn(0.0, 1.0)
        val (toward, by) = if (t < 0.5) WingtipColors.Chart.AIRSPACE_FLOOR_LOW_HEX to (0.5 - t) * 2 else WingtipColors.Chart.AIRSPACE_FLOOR_HIGH_HEX to (t - 0.5) * 2
        val a = rgb(ink)
        val b = rgb(toward)
        val k = by * WingtipMap.AIRSPACE_SHADE_MIX
        val mixed = a.indices.map { i -> Math.round(a[i] + (b[i] - a[i]) * k).toInt() }
        return String.format(java.util.Locale.US, "#%02x%02x%02x", mixed[0], mixed[1], mixed[2])
    }

    private fun rgb(hex: String): List<Int> = hex.removePrefix("#").let { h -> listOf(0, 2, 4).map { h.substring(it, it + 2).toInt(16) } }

    /** A shelf's altitudes as the sectional writes them, its ceiling over
     *  its floor in hundreds ("100\n30"), the engine's
     *  `airspace_shelf_label`; null for what the chart writes none for (a
     *  Class E surface area, a special use area, a TFR). */
    fun shelfText(p: JsonObject): String? {
        if (text(p["layer"]) != "airspace") return null
        val cls = text(p["class"]) ?: return null
        return Engine.airspaceShelfLabel(cls, number(p["floor_ft"]), text(p["floor_ref"]), number(p["ceiling_ft"]), (p["ceiling_excluded"] as? JsonPrimitive)?.content == "true")
            .getOrNull()?.text
    }

    /**
     * The planner's features as one GeoJSON collection for the
     * extrusions: each kind drawn from its zoom on (KINDS), with its
     * `kind`, `base_m` and `height_m`; the planner's own fields kept
     * besides, so a tap reads what the card needs.
     */
    fun geoJson(
        features: JsonArray,
        appZoom: Double,
        altitudes: List<Double>? = null,
        span: (EngineContract.AirspaceVolumeSpanInput) -> Result<EngineContract.AirspaceVolumeSpanAnswer?> = ::engineSpan,
    ): String = buildJsonObject {
        put("type", "FeatureCollection")
        putJsonArray("features") {
            for (element in features) {
                val f = element as? JsonObject ?: continue
                val p = f["properties"] as? JsonObject ?: continue
                val geometry = f["geometry"] as? JsonObject ?: continue
                val kind = kindOf(p)
                val ink = KINDS[kind] ?: continue
                if (appZoom < ink.from) continue
                // Nothing to draw, or a rule that failed (logged): the
                // volume is left out rather than drawn at a guess.
                val v = span(spanInput(p).copy(altitudesFt = altitudes)).getOrNull() ?: continue
                val strength = when (v.holds) {
                    null -> Strength.NONE
                    true -> Strength.HELD
                    false -> Strength.FADED
                }
                add(
                    buildJsonObject {
                        put("type", "Feature")
                        put("geometry", geometry)
                        putJsonObject("properties") {
                            p.forEach { (k, v) -> if (v is JsonPrimitive) put(k, v) }
                            put("kind", kind)
                            put("base_m", v.floorFt * Units.M_PER_FT)
                            put("height_m", v.ceilingFt * Units.M_PER_FT)
                            put("floor_ft", v.floorFt)
                            put("shade", shadeOf(ink.hex, v.floorFt))
                            put("strength", strength.name)
                        }
                    },
                )
            }
        }
    }.toString()

    /**
     * One label a shelf, its altitudes (shelfText) at the southernmost
     * point of its ring, the camera's side when the map faces north: its
     * words, its class for its tab, its floor (the lower placed first) and
     * whether the plan is at it. MapLibre Native lifts no symbol off the
     * ground, so the label stands at the shelf's foot on the chart, where
     * the web's stands on its top.
     */
    fun shelfLabels(features: JsonArray, altitudes: List<Double>? = null): String = buildJsonObject {
        put("type", "FeatureCollection")
        putJsonArray("features") {
            for (element in features) {
                val f = element as? JsonObject ?: continue
                val p = f["properties"] as? JsonObject ?: continue
                val words = shelfText(p) ?: continue
                val at = southernmost(f["geometry"] as? JsonObject) ?: continue
                val held = altitudes == null || engineSpan(spanInput(p).copy(altitudesFt = altitudes)).getOrNull()?.holds != false
                add(
                    buildJsonObject {
                        put("type", "Feature")
                        putJsonObject("geometry") {
                            put("type", "Point")
                            putJsonArray("coordinates") { add(JsonPrimitive(at.first)); add(JsonPrimitive(at.second)) }
                        }
                        putJsonObject("properties") {
                            put("text", words)
                            put("class", text(p["class"]))
                            put("floor_ft", number(p["floor_ft"]) ?: 0.0)
                            put("held", held)
                        }
                    },
                )
            }
        }
    }.toString()

    /** The southernmost point of a polygon's or multipolygon's outer rings. */
    private fun southernmost(geometry: JsonObject?): Pair<Double, Double>? {
        val coords = geometry?.get("coordinates") as? JsonArray ?: return null
        val rings = when (text(geometry["type"])) {
            "Polygon" -> listOfNotNull(coords.firstOrNull() as? JsonArray)
            "MultiPolygon" -> coords.mapNotNull { (it as? JsonArray)?.firstOrNull() as? JsonArray }
            else -> emptyList()
        }
        return rings.flatMap { ring -> ring.mapNotNull { pt -> (pt as? JsonArray)?.let { a -> number(a.getOrNull(0))?.let { lon -> number(a.getOrNull(1))?.let { lat -> lon to lat } } } } }
            .minByOrNull { it.second }
    }

    private fun text(v: JsonElement?): String? = (v as? JsonPrimitive)?.takeIf { it.isString || it.content != "null" }?.content?.ifEmpty { null }

    private fun number(v: JsonElement?): Double? = (v as? JsonPrimitive)?.doubleOrNull
}
