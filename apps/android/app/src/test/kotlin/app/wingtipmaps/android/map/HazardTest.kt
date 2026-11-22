package app.wingtipmaps.android.map

import androidx.compose.ui.graphics.toArgb
import app.wingtipmaps.android.api.generated.Obstacle
import app.wingtipmaps.android.design.generated.WingtipColors
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.flight.OwnShip
import app.wingtipmaps.android.format.Units
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.double
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Test

/** The map's hazard colouring asked and drawn as the web's is, held to the
 *  shared fixture (apps/web/src/lib/fixtures/hazardView.json, on the
 *  test's classpath by build.gradle.kts). The engine does not load on the
 *  JVM: here the question the app builds is held to the fixture's input,
 *  and the drawing to its lines; EngineFixturesTest runs the engine on it. */
class HazardTest {
    private val json = Json { ignoreUnknownKeys = true }
    private val fixture = Json.parseToJsonElement(checkNotNull(javaClass.classLoader!!.getResource("hazardView.json")).readText()).jsonObject
    private val views = fixture.getValue("views").jsonArray.map { it.jsonObject }

    private fun JsonObject.number(key: String): Double? = get(key)?.jsonPrimitive?.doubleOrNull

    @Test
    fun theQuestionIsTheFixturesInputFromTheFixAndThePlan() {
        for (v in views) {
            val input = v.getValue("input").jsonObject
            val speed = input.number("speed_kt")
            val gps = input.number("gps_altitude_ft")
            val fix = if (speed == null && gps == null) null else OwnShip.Fix(32.0, -97.0, gps, null, speed, 5.0, 0)
            val setting = Hazard.Setting.entries.first { it.key == input.getValue("setting").jsonPrimitive.content }
            val tops = input["tops_ft"]?.jsonArray?.map { it.jsonPrimitive.double }
            val built = Hazard.input(setting, fix, input.number("planned_altitude_ft"), input.number("clearance_ft"), tops)
            assertEquals(v["why"].toString(), json.decodeFromJsonElement<EngineContract.HazardViewInput>(input), built)
        }
    }

    @Test
    fun theGpsHeightMovesInFiftyFootSteps() {
        assertEquals(8500.0, Hazard.stepped(8524.0)!!, 0.0)
        assertEquals(8550.0, Hazard.stepped(8526.0)!!, 0.0)
        assertEquals(null, Hazard.stepped(null))
        val fix = OwnShip.Fix(0.0, 0.0, 5512.0, null, 110.0, 5.0, 0)
        assertEquals(5500.0, Hazard.input(Hazard.Setting.FLIGHT, fix, null, null).gpsAltitudeFt!!, 0.0)
    }

    @Test
    fun theReliefStepsAtTheEnginesLinesInMetres() {
        // The fixture's first view: red over 4,500 ft, amber from 3,500.
        val expected = views[0].getValue("expected").jsonObject
        val warning = expected.number("warning_from_ft")!!
        val caution = expected.number("caution_from_ft")!!
        val stops = Hazard.reliefStops(warning, caution)
        val amber = WingtipColors.Chart.Caution.copy(alpha = 0.5f).toArgb()
        val red = WingtipColors.Chart.Warning.copy(alpha = 0.6f).toArgb()
        assertEquals(listOf(-500.0, 1065.8, 1066.8, 1371.6, 1372.6, 9000.0), stops.map { Math.round(it.metres * 10) / 10.0 })
        assertEquals(3500 * Units.M_PER_FT, stops[2].metres, 1e-9)
        assertEquals(listOf(0, 0, amber, amber, red, red), stops.map { it.argb })
    }

    @Test
    fun onlyTheRedAndAmberObstaclesAreRinged() {
        // The first view's tops levelled as the fixture says.
        val levels = views[0].getValue("expected").jsonObject.getValue("levels").jsonArray.map { it.jsonPrimitive.content }
        val obstacles = listOf(4501, 4500, 3500, 3499, 6000).mapIndexed { i, ft -> Obstacle(200, ft, 32.0 + i, true, -97.0, "TOWER") }
        val features = Json.parseToJsonElement(Hazard.obstaclesGeoJson(obstacles, levels)).jsonObject.getValue("features").jsonArray
        assertEquals(listOf("warning", "caution", "caution", "warning"), features.map { it.jsonObject["properties"]!!.jsonObject["level"]!!.jsonPrimitive.content })
        assertEquals(listOf(-97.0, 32.0), features[0].jsonObject["geometry"]!!.jsonObject["coordinates"]!!.jsonArray.map { it.jsonPrimitive.double })
    }

    @Test
    fun theObstaclesAreAskedInHalfDegreesRoundTheMiddle() {
        assertEquals(Hazard.Box(31.5, -98.0, 33.0, -96.5), Hazard.boxOf(32.2, -97.3))
        // A world copy's longitude, wrapped back.
        assertEquals(Hazard.boxOf(32.2, -97.3), Hazard.boxOf(32.2, 262.7))
    }
}
