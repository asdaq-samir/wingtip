package app.wingtipmaps.android.welcome

import app.wingtipmaps.android.welcome.WelcomeModel.Ending
import app.wingtipmaps.android.welcome.WelcomeModel.Step
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The welcome's model on a memory kept in a variable: shown once, Skip
 *  from any page, Setup's reset, the sample flight, No Airplane first. */
class WelcomeModelTest {
    private var kept = false
    private val memory = WelcomeMemory(read = { kept }, write = { kept = it })

    @Test
    fun shownOnceThenNotAgain() {
        val model = WelcomeModel(memory)
        assertFalse(model.seen.value)
        model.finish(sample = false)
        assertTrue(model.seen.value)
        assertTrue(kept)
        // The next launch reads it back: not shown.
        assertTrue(WelcomeModel(WelcomeMemory(read = { kept }, write = { kept = it })).seen.value)
    }

    @Test
    fun skipFromAnyPageEndsItAndKeepsWhatWasSaid() {
        val model = WelcomeModel(memory)
        model.pickAirplane("c172")
        model.next()
        model.pickHome(" kmsn ")
        val outcome = model.skip()
        assertEquals(Ending.SKIPPED, outcome.ending)
        assertEquals("c172", outcome.airplane)
        assertEquals("KMSN", outcome.home)
        assertNull(outcome.route)
        assertTrue(model.seen.value)
    }

    @Test
    fun resetShowsItAgainFromTheFirstPage() {
        val model = WelcomeModel(memory)
        model.skip()
        memory.reset()
        assertFalse(model.seen.value)
        assertFalse(kept)
        model.open(airplane = "", home = null, steps = WelcomeModel.steps(askLocation = true, askNotifications = false))
        assertEquals(Step.AIRPLANE, model.state.value.step)
    }

    @Test
    fun sampleFlightIsMadisonToOshkosh() {
        val outcome = WelcomeModel(memory).finish(sample = true)
        assertEquals(Ending.SAMPLE, outcome.ending)
        assertEquals(WelcomeModel.Route("KMSN", "KOSH", emptyList()), outcome.route)
        assertNull(WelcomeModel(memory).finish(sample = false).route)
    }

    @Test
    fun noAirplaneIsTheDefault() {
        val model = WelcomeModel(memory)
        assertEquals("", model.state.value.airplane)
        assertEquals("", model.skip().airplane)
    }

    @Test
    fun pagesGoForwardAndBackAndAskOnlyWhatIsNeeded() {
        val model = WelcomeModel(memory)
        model.open(airplane = "", home = null, steps = WelcomeModel.steps(askLocation = false, askNotifications = true))
        val steps = model.state.value.steps
        assertEquals(listOf(Step.AIRPLANE, Step.HOME, Step.RULES, Step.NOTIFICATIONS, Step.FINISH), steps)
        assertFalse(model.back())
        repeat(10) { model.next() }
        assertEquals(Step.FINISH, model.state.value.step)
        assertTrue(model.back())
        assertEquals(Step.NOTIFICATIONS, model.state.value.step)
        assertFalse(model.state.value.forward)
    }
}
