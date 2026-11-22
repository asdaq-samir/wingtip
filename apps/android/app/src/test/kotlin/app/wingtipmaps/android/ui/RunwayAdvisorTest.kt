package app.wingtipmaps.android.ui

import app.wingtipmaps.android.engine.generated.EngineContract
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** The advisor's words said once each: the engine's answers for the
 *  shared cases' first two (apps/web/src/lib/fixtures/runwayProximity.json,
 *  "On runway 27" rolling west, then approaching 9-27), spoken as each
 *  key first comes and never again for a distance closing. The answers
 *  themselves are the engine's (engine/facade/tests/runway_proximity.rs);
 *  the JVM's unit tests carry no engine library. */
class RunwayAdvisorTest {
    private fun answer(state: String, spoken: String?, key: String, holdShortFt: Int? = null) =
        EngineContract.RunwayProximityAnswer(state = state, closed = false, holdShortFt = holdShortFt, spoken = spoken, key = key)

    @Test
    fun eachKeyIsSaidOnceAndADistanceClosingIsNot() {
        val on = answer("on_runway", "On runway two seven", "on_runway|9-27|1|")
        val (first, said) = RunwayAdvisor.toSay(on, null)
        assertEquals("On runway two seven", first)
        assertNull(RunwayAdvisor.toSay(on, said).first)
        val near = answer("approaching", "Approaching runway niner, two seven", "approaching|9-27||HS 1", holdShortFt = 140)
        val (next, saidNext) = RunwayAdvisor.toSay(near, said)
        assertEquals("Approaching runway niner, two seven", next)
        assertNull(RunwayAdvisor.toSay(near.copy(holdShortFt = 60), saidNext).first)
    }

    @Test
    fun noAnswerOrNoWordsSaysNothing() {
        assertEquals(null to "k", RunwayAdvisor.toSay(null, "k"))
        val clear = answer("clear", null, "clear|||")
        assertEquals(null to "clear|||", RunwayAdvisor.toSay(clear, "on_runway|9-27|1|"))
    }
}
