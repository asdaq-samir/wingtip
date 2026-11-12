package app.wingtipmaps.android.map

import app.wingtipmaps.android.api.generated.AirportPlace
import app.wingtipmaps.android.design.generated.WingtipColors
import app.wingtipmaps.android.engine.generated.EngineContract
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.add
import kotlinx.serialization.json.addJsonArray
import kotlinx.serialization.json.addJsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject
import kotlin.math.asin
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin

/**
 * A field's way in for the 3D view (Map3dLayer), the web's
 * approachScene.ts: every figure is the engine's `approach_scene`
 * (engine/crates/route/src/approach/scene.rs, where each is sourced) --
 * the centrelines, the glidepath to each threshold, the approach's line
 * and the pattern's ring -- and this only turns its answer into lines.
 * MapLibre Native draws a line on the ground only (no line elevation, no
 * 3D ground), so each is draped: the glidepath runs along its centreline
 * and the ring is drawn round the field, their heights on the field's card
 * rather than in the air. Pure, so it is tested without a map.
 */
object ApproachScene3d {
    /** The engine's input from what the field's card shows (/api/airport),
     *  its closed runways left out; no approach picked (the phone's route
     *  carries no procedure picks yet). */
    fun input(field: AirportPlace): EngineContract.ApproachSceneInput = EngineContract.ApproachSceneInput(
        lat = field.lat,
        lon = field.lon,
        elevationFt = field.elevationFt,
        patternFt = field.pattern?.altitudeFt,
        runways = field.runways.filterNot { it.closed }.map { r ->
            EngineContract.ApproachSceneInputRunwaysItem(
                lengthFt = r.lengthFt?.toDouble(),
                runwayEnds = r.runwayEnds.orEmpty().map { e ->
                    EngineContract.ApproachSceneInputRunwaysItemRunwayEndsItem(ident = e.ident, lat = e.lat, lon = e.lon, headingTrueDeg = e.headingTrueDeg)
                },
            )
        },
        drawing = null,
    )

    /** Each line's role, which the layers colour it by. */
    const val CENTRELINE = "centreline"
    const val GLIDEPATH = "glidepath"
    const val PROCEDURE = "procedure"
    const val PATTERN = "pattern"

    /** The roles' inks, the chart's tokens (the web's CHART.centreline,
     *  glidepath, procedure and pattern). */
    val INKS = mapOf(
        CENTRELINE to WingtipColors.Chart.CENTRELINE_HEX,
        GLIDEPATH to WingtipColors.Chart.GLIDEPATH_HEX,
        PROCEDURE to WingtipColors.Chart.PROCEDURE_HEX,
        PATTERN to WingtipColors.Chart.PATTERN_HEX,
    )

    /** The ring's points, one each 5 degrees round (the web's RING_POINTS). */
    private const val RING_POINTS = 72

    /** The earth's mean radius in nautical miles (the web's lib/geo
     *  EARTH_NM): a spherical earth, within a few metres over a pattern's
     *  mile or two. */
    private const val EARTH_NM = 3440.065

    /** Where a great circle from a point on a true bearing reaches `nm` out
     *  (the web's lib/geo destination). */
    fun destination(lat: Double, lon: Double, bearingDeg: Double, nm: Double): Pair<Double, Double> {
        val d = nm / EARTH_NM
        val b = Math.toRadians(bearingDeg)
        val lat1 = Math.toRadians(lat)
        val lon1 = Math.toRadians(lon)
        val lat2 = asin(sin(lat1) * cos(d) + cos(lat1) * sin(d) * cos(b))
        val lon2 = lon1 + atan2(sin(b) * sin(d) * cos(lat1), cos(d) - sin(lat1) * sin(lat2))
        return Math.toDegrees(lat2) to ((Math.toDegrees(lon2) + 540) % 360) - 180
    }

    private fun latLon(point: List<JsonElement>): Pair<Double, Double>? {
        val lat = (point.getOrNull(0) as? JsonPrimitive)?.doubleOrNull ?: return null
        val lon = (point.getOrNull(1) as? JsonPrimitive)?.doubleOrNull ?: return null
        return lat to lon
    }

    /** The scene's lines on the ground, each with its `role`, longitude
     *  first as GeoJSON has it. */
    fun geoJson(scene: EngineContract.ApproachSceneAnswer): String {
        val lines = buildList {
            scene.centrelines.forEach { add(CENTRELINE to it.points.mapNotNull(::latLon)) }
            scene.glidepaths.forEach { add(GLIDEPATH to it.points.mapNotNull(::latLon)) }
            scene.path?.let { add(PROCEDURE to it.mapNotNull(::latLon)) }
            scene.ring?.let { ring ->
                val centre = latLon(ring.center)
                if (centre != null) add(PATTERN to (0..RING_POINTS).map { i -> destination(centre.first, centre.second, 360.0 * i / RING_POINTS, ring.radiusNm) })
            }
        }
        return buildJsonObject {
            put("type", "FeatureCollection")
            putJsonArray("features") {
                for ((role, points) in lines) {
                    if (points.size < 2) continue
                    addJsonObject {
                        put("type", "Feature")
                        putJsonObject("properties") { put("role", role) }
                        putJsonObject("geometry") {
                            put("type", "LineString")
                            putJsonArray("coordinates") { for ((lat, lon) in points) addJsonArray { add(lon); add(lat) } }
                        }
                    }
                }
            }
        }.toString()
    }
}
