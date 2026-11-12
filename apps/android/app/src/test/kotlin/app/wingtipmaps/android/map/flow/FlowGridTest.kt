package app.wingtipmaps.android.map.flow

import app.wingtipmaps.android.engine.EngineException
import app.wingtipmaps.android.engine.generated.EngineContract
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The flow layer's pictures read as the weather service wrote them
 * (services/weather/app/flow_grid.py png), and the value at a point asked
 * of the engine's flow_cell and flow_sample, held to the shared fixture
 * (apps/web/src/lib/fixtures/flowSample.json, on the test's classpath by
 * build.gradle.kts). The engine does not load on the JVM, so the rules
 * here answer from the fixture and check they were asked what it asks;
 * EngineFixturesTest runs the engine itself on the same file.
 */
class FlowGridTest {
    private val json = Json { ignoreUnknownKeys = true }
    private val fixture: JsonObject = Json.parseToJsonElement(
        checkNotNull(javaClass.classLoader!!.getResource("flowSample.json")) { "flowSample.json is not on the test's classpath" }.readText(),
    ).jsonObject

    private fun pixel(red: Int, green: Int = red, alpha: Int = 255) = (alpha shl 24) or (red shl 16) or (green shl 8)

    /** Rules that answer one cell and one sample, keeping what they were asked. */
    private class Asked(val cell: EngineContract.FlowCellAnswer?, val sample: Result<EngineContract.FlowSampleAnswer?>) : FlowGrid.Rules {
        var cellIn: EngineContract.FlowCellInput? = null
        var sampleIn: EngineContract.FlowSampleInput? = null

        override fun cell(input: EngineContract.FlowCellInput): Result<EngineContract.FlowCellAnswer?> {
            cellIn = input
            return Result.success(cell)
        }

        override fun sample(input: EngineContract.FlowSampleInput): Result<EngineContract.FlowSampleAnswer?> {
            sampleIn = input
            return sample
        }
    }

    @Test
    fun aPointIsAskedOfTheEngineAsTheFixtureAsksIt() {
        val read = EngineContract.FlowSampleAnswer(42.0, null)
        for (case in fixture.getValue("cells").jsonArray.map { it.jsonObject }) {
            val want = json.decodeFromJsonElement<EngineContract.FlowCellInput>(case.getValue("input"))
            val cell = json.decodeFromJsonElement<EngineContract.FlowCellAnswer?>(case.getValue("answer"))
            // Each pixel its own red, so the bytes handed on show which it was.
            val argb = IntArray(want.width * want.height) { pixel(it * 10, 0) }
            val grid = FlowGrid.decode(argb, want.width, want.height, want.bounds, listOf(0.0, 100.0), vector = false)
            val rules = Asked(cell, Result.success(read))
            val got = grid.valueAt(want.lat, want.lon, rules).getOrThrow()
            assertEquals(want, rules.cellIn)
            if (cell == null) {
                // Off the picture: no reading, and nothing more asked.
                assertNull(got)
                assertNull(rules.sampleIn)
            } else {
                assertEquals(read, got)
                val asked = rules.sampleIn!!
                assertEquals(cell.pixels.map { listOf(it * 10.0, 0.0, 255.0) }, asked.pixels)
                assertEquals(cell.fx, asked.fx, 0.0)
                assertEquals(cell.fy, asked.fy, 0.0)
                assertEquals(listOf(0.0, 100.0), asked.unscale)
            }
        }
    }

    @Test
    fun theWindsPixelsAreHandedOnWithTheirAlpha() {
        // The fixture's calm between a westerly and an easterly: red 255
        // and 0, alpha as given, a pixel with none at alpha 0.
        val grid = FlowGrid.decode(intArrayOf(pixel(255, 128), pixel(0, 128, alpha = 0)), 2, 1, listOf(0.0, 0.0, 2.0, 1.0), listOf(-50.0, 50.0), vector = true)
        val rules = Asked(EngineContract.FlowCellAnswer(listOf(0, 1, 0, 1), 0.5, 0.0), Result.success(null))
        assertNull(grid.valueAt(0.5, 1.0, rules).getOrThrow())
        assertEquals(listOf(255.0, 128.0, 255.0), rules.sampleIn!!.pixels[0])
        assertEquals(listOf(0.0, 128.0, 0.0), rules.sampleIn!!.pixels[1])
        assertTrue(rules.sampleIn!!.vector)
    }

    @Test
    fun aFailedRuleIsAFailureNeverNone() {
        val grid = FlowGrid.decode(intArrayOf(pixel(0), pixel(0), pixel(0), pixel(0)), 2, 2, listOf(0.0, 0.0, 2.0, 2.0), listOf(0.0, 1.0), vector = false)
        val rules = Asked(EngineContract.FlowCellAnswer(listOf(0, 1, 2, 3), 0.0, 0.0), Result.failure(EngineException("flow_sample: no answer")))
        assertTrue(grid.valueAt(1.0, 1.0, rules).isFailure)
    }

    @Test
    fun aPixelIsItsRedBetweenTheLeastAndTheMost() {
        // The temperature's unscale, -75 to 52.5 C: 0 is -75, 255 is 52.5;
        // alpha 0 is none. Only for painting the picture (Painted).
        val grid = FlowGrid.decode(intArrayOf(pixel(0), pixel(255), pixel(150, alpha = 0), pixel(150)), 2, 2, listOf(0.0, 0.0, 2.0, 2.0), listOf(-75.0, 52.5), vector = false)
        assertEquals(-75.0, grid.at(0, 0), 1e-4)
        assertEquals(52.5, grid.at(1, 0), 1e-4)
        assertTrue(grid.at(0, 1).isNaN())
    }
}
