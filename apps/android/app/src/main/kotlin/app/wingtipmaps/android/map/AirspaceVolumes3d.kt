package app.wingtipmaps.android.map

import app.wingtipmaps.android.design.generated.WingtipColors
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
 * MapLibre Native has no 3D ground (see docs/NATIVE-ANDROID.md, "3D"), so
 * the map stands at sea level: an MSL figure is drawn as it is, and a
 * figure above the ground (AGL, or SFC with a figure) has no ground to
 * stand on and is left out, as the web leaves a volume out until its
 * terrain is in.
 */
object AirspaceVolumes3d {
    /** Metres in a foot: the international foot, exactly 0.3048 m (NIST
     *  Handbook 44, Appendix C). */
    const val M_PER_FT = 0.3048

    /** Where a volume with no top, or one above it, is drawn to, ft MSL:
     *  the floor of Class A (14 CFR 71.33), the top of the airspace a VFR
     *  pilot flies in. A drawing bound, not a rule: Class A itself is
     *  never drawn, and the card writes the FAA's own figure. */
    const val UNLIMITED_DRAWN_TO_FT = 18_000.0

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

    /** Whether a height is above the ground rather than the sea: AGL, and
     *  SFC with a figure (the FAA's special use airspace service codes a
     *  500 ft AGL floor as SFC with 500, wingtip.sua._height_ft). */
    fun aboveGround(ft: Double?, ref: String?): Boolean {
        val r = (ref ?: "MSL").uppercase()
        return r == "AGL" || (r == "SFC" && ft != null && ft != 0.0)
    }

    /** A volume's floor and top, metres MSL, the top no higher than
     *  UNLIMITED_DRAWN_TO_FT; null where it needs the ground (none on this
     *  map) or nothing is left to draw. The NASR file's ceiling is MSL
     *  (wingtip.airspace_at._ceiling); a special use area's carries its own
     *  reference. A flight level (STD) is drawn as if MSL. */
    fun span(floorFt: Double?, floorRef: String?, ceilingFt: Double?, ceilingRef: String?): Pair<Double, Double>? {
        if (aboveGround(floorFt, floorRef) || aboveGround(ceilingFt, ceilingRef)) return null
        val floorM = (floorFt ?: 0.0) * M_PER_FT
        val top = UNLIMITED_DRAWN_TO_FT * M_PER_FT
        val ceilingM = if (ceilingFt == null) top else min(top, ceilingFt * M_PER_FT)
        return if (ceilingM > floorM) floorM to ceilingM else null
    }

    /**
     * The planner's features as one GeoJSON collection for the
     * extrusions: each kind drawn from its zoom on (KINDS), with its
     * `kind`, `base_m` and `height_m`; the planner's own fields kept
     * besides, so a tap reads what the card needs.
     */
    fun geoJson(features: JsonArray, appZoom: Double): String = buildJsonObject {
        put("type", "FeatureCollection")
        putJsonArray("features") {
            for (element in features) {
                val f = element as? JsonObject ?: continue
                val p = f["properties"] as? JsonObject ?: continue
                val geometry = f["geometry"] as? JsonObject ?: continue
                val kind = kindOf(p)
                val ink = KINDS[kind] ?: continue
                if (appZoom < ink.from) continue
                val ceilingRef = if (text(p["layer"]) == "airspace") "MSL" else text(p["ceiling_ref"])
                val (floorM, ceilingM) = span(number(p["floor_ft"]), text(p["floor_ref"]), number(p["ceiling_ft"]), ceilingRef) ?: continue
                add(
                    buildJsonObject {
                        put("type", "Feature")
                        put("geometry", geometry)
                        putJsonObject("properties") {
                            p.forEach { (k, v) -> if (v is JsonPrimitive) put(k, v) }
                            put("kind", kind)
                            put("base_m", floorM)
                            put("height_m", ceilingM)
                        }
                    },
                )
            }
        }
    }.toString()

    private fun text(v: JsonElement?): String? = (v as? JsonPrimitive)?.takeIf { it.isString || it.content != "null" }?.content?.ifEmpty { null }

    private fun number(v: JsonElement?): Double? = (v as? JsonPrimitive)?.doubleOrNull
}
