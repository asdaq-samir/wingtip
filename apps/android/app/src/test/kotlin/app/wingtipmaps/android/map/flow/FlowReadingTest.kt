package app.wingtipmaps.android.map.flow

import app.wingtipmaps.android.engine.EngineException
import app.wingtipmaps.android.engine.generated.EngineContract
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** The badge's words from the engine's rules (FlowReading): its null is
 *  the hazard's none, but a rule that failed is no reading at all, never
 *  "None" for turbulence, icing or precipitation. The engine's own answers
 *  are its tests'; here the rule's Result is given. */
class FlowReadingTest {
    @Test
    fun theEnginesNullIsNone() {
        assertEquals("None", FlowReading.wordOrNone(Result.success(null), "None").getOrThrow())
        assertEquals("Moderate", FlowReading.wordOrNone(Result.success("Moderate"), "None").getOrThrow())
    }

    @Test
    fun aWindUnderAKnotIsCalmWithNoDirection() {
        // The shared fixture's half-knot case (flowSample.json): value 0.5, no direction, calm.
        val calmRead = EngineContract.FlowSampleAnswer(0.5, null, true)
        assertEquals("Calm", FlowReading.wind(calmRead, "Calm") { from, kt -> "$from $kt" })
        val westerly = EngineContract.FlowSampleAnswer(50.0, 270.0, false)
        assertEquals("270 50", FlowReading.wind(westerly, "Calm") { from, kt -> "$from $kt" })
    }

    @Test
    fun aFailedRuleIsAFailureNeverNone() {
        val failed = FlowReading.wordOrNone(Result.failure(EngineException("turbulence_category: no answer")), "None")
        assertTrue(failed.isFailure)
        assertEquals(null, failed.getOrNull())
    }
}
