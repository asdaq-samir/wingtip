package app.wingtipmaps.android.map

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import app.wingtipmaps.android.api.generated.Obstacle
import app.wingtipmaps.android.design.generated.WingtipColors
import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.engine.generated.hazardView
import app.wingtipmaps.android.flight.OwnShip
import app.wingtipmaps.android.format.Units
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.roundToLong

/**
 * The map's hazard colouring, ForeFlight's Hazard Advisor on the chart
 * (the web's features/plan-map/hazard): what the engine's `hazard_view`
 * is asked and how its answer is drawn. The rules are the engine's
 * (engine/crates/altitude/src/altitude/hazard.rs, where the clearances
 * and their 14 CFR 91.119 and 91.177 sources are): the altitude (the
 * GPS's at flying speed, the plan's cruise on the ground), whether to draw
 * and the red and amber lines, and each obstacle's level against them.
 * Nothing is compared here. A picture against one altitude, not TAWS.
 */
object Hazard {
    /** The Map card's Terrain Hazards, the engine's `setting`. */
    enum class Setting(val key: String, val label: String) { OFF("off", "Off"), ON("on", "On"), FLIGHT("flight", "In Flight") }

    /** The GPS height the colours are drawn from moves in steps of this,
     *  ft, so a height wandering a few feet does not paint the map again
     *  at every fix while level (the web's STEP_FT). */
    const val STEP_FT = 50.0

    /** The app's zoom from which the obstacles are asked and ringed, where
     *  a ring is more than a pixel (the web's obstacleBox, zoom 9). */
    const val OBSTACLE_APP_ZOOM = 9.0

    typealias View = EngineContract.HazardViewAnswer

    fun stepped(ft: Double?): Double? = ft?.let { (it / STEP_FT).roundToLong() * STEP_FT }

    /** The engine's question: the setting, own ship's speed and height (to
     *  STEP_FT), the plan's cruise, the pilot's clearance (null, the
     *  engine's default) and any obstacle tops to level. */
    fun input(setting: Setting, fix: OwnShip.Fix?, plannedFt: Double?, clearanceFt: Double?, topsFt: List<Double>? = null) =
        EngineContract.HazardViewInput(setting.key, fix?.groundspeedKt, stepped(fix?.altitudeFt), plannedFt, clearanceFt, topsFt)

    /** The engine's answer, or null where it gave none (Engine.rule has
     *  logged why); `rule` stands in for the engine in a JVM test. */
    fun view(input: EngineContract.HazardViewInput, rule: (EngineContract.HazardViewInput) -> Result<View> = ::ask): View? =
        rule(input).getOrNull()

    private fun ask(i: EngineContract.HazardViewInput): Result<View> =
        Engine.hazardView(i.setting, i.speedKt, i.gpsAltitudeFt, i.plannedAltitudeFt, i.clearanceFt, i.topsFt)

    /** The clearances Red Within offers and the one in force (the
     *  engine's clearances_ft and clearance_ft), asked with nothing drawn. */
    fun clearances(pickedFt: Double?): View? = view(input(Setting.OFF, null, null, pickedFt))

    /** Each obstacle top's level against `altitudeFt`, the very altitude the
     *  ground's colours are from. */
    fun levels(altitudeFt: Double, clearanceFt: Double?, topsFt: List<Double>): List<String?> =
        view(input(Setting.ON, null, altitudeFt, clearanceFt, topsFt))?.levels.orEmpty()

    /** A colour-relief stop: from this many metres, this colour. */
    data class Stop(val metres: Double, val argb: Int)

    // The chart's caution and warning, half and three fifths strong (the
    // web's 80 and 99 alpha), so the chart's words read through them.
    private val AMBER = WingtipColors.Chart.Caution.copy(alpha = 0.5f).toArgb()
    private val RED = WingtipColors.Chart.Warning.copy(alpha = 0.6f).toArgb()
    private val CLEAR = Color.Transparent.toArgb()

    /**
     * The colour-relief layer's stops for the engine's lines, feet MSL:
     * clear under the amber, amber from it, red over the red line. MapLibre's
     * color-relief takes only an interpolate on the elevation with literal
     * stops, so the colours step a metre wide rather than fade, as the web's
     * hazardColours.
     */
    fun reliefStops(warningFt: Double, cautionFt: Double): List<Stop> {
        val caution = cautionFt * Units.M_PER_FT
        val warning = warningFt * Units.M_PER_FT
        return listOf(
            Stop(minOf(-500.0, caution - 2), CLEAR),
            Stop(caution - 1, CLEAR),
            Stop(caution, AMBER),
            Stop(warning, AMBER),
            Stop(warning + 1, RED),
            Stop(maxOf(9000.0, warning + 2), RED),
        )
    }

    /** The box the obstacles are asked for: half degrees round the view's
     *  middle, a degree each way at most (the planner's
     *  /api/terrain/obstacles refuses one over two degrees). */
    data class Box(val south: Double, val west: Double, val north: Double, val east: Double)

    fun boxOf(lat: Double, lon: Double): Box {
        // In -180 to 180: past the antimeridian a world copy's middle is not.
        val wrapped = ((lon + 180.0) % 360.0 + 360.0) % 360.0 - 180.0
        fun down(v: Double) = floor(v * 2) / 2
        fun up(v: Double) = ceil(v * 2) / 2
        return Box(down(lat - 0.5), down(wrapped - 0.5), up(lat + 0.5), up(wrapped + 0.5))
    }

    /** The obstacles the engine levels red or amber as points with their
     *  level, longitude first; the clear ones left out. */
    fun obstaclesGeoJson(obstacles: List<Obstacle>, levels: List<String?>): String = buildJsonObject {
        put("type", "FeatureCollection")
        putJsonArray("features") {
            obstacles.forEachIndexed { i, o ->
                val level = levels.getOrNull(i)
                if (level != WARNING && level != CAUTION) return@forEachIndexed
                add(
                    buildJsonObject {
                        put("type", "Feature")
                        putJsonObject("properties") { put("level", level) }
                        putJsonObject("geometry") {
                            put("type", "Point")
                            putJsonArray("coordinates") { add(o.lon); add(o.lat) }
                        }
                    },
                )
            }
        }
    }.toString()

    const val WARNING = "warning"
    const val CAUTION = "caution"
}
