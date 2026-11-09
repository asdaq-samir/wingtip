package app.wingtipmaps.android.copilot

import app.wingtipmaps.android.MainRule
import app.wingtipmaps.android.api.generated.CopilotAround
import app.wingtipmaps.android.api.generated.CopilotField
import app.wingtipmaps.android.api.generated.EmergencyMetar
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.flight.OwnShip
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Rule
import org.junit.Test

/** The copilot's model over fakes of the planner, the engine and the
 *  voice: asked while flying, its first message shown and said once,
 *  OK putting it away, and nothing when off. */
class CopilotModelTest {
    @get:Rule val main = MainRule()

    private val flight = CopilotFlight("KMSN", null, "VFR", listOf(listOf(41.9, -88.2), listOf(43.1, -89.3)), 110.0, 115.0, 8.0, 40.0)
    private val fix = OwnShip.Fix(42.0, -88.4, 4500.0, 320.0, 110.0, 5.0, atMs = 1_000_000L)

    private class Voice : CopilotVoice {
        val said = mutableListOf<String>()
        override fun say(words: String) { said += words }
        override fun interrupt(words: String) { said += "!$words" }
    }

    private class Rules : CopilotRules {
        var input: EngineContract.CopilotWatchInput? = null
        override fun along(lat: Double, lon: Double, line: List<List<Double>>) = Along(leftNm = 70.0, leg = 0)
        override fun watch(input: EngineContract.CopilotWatchInput): EngineContract.CopilotWatchAnswer {
            this.input = input
            val msg = { id: String -> EngineContract.CopilotMessage(id = id, kind = "weather", level = "warning", title = "$id went IFR", say = "$id went IFR", detail = emptyList(), sources = emptyList(), elsewhere = false) }
            return EngineContract.CopilotWatchAnswer(messages = listOf(msg("KMSN"), msg("KJVL")), remainingNm = 70.0, reserveMin = 30.0)
        }
    }

    private val around = CopilotAround(
        areas = emptyList(), at = 0.0, itws = emptyList(), unavailable = emptyList(),
        fields = listOf(CopilotField(bearingDeg = 0.0, distanceNm = 70.0, ident = "KMSN", lat = 43.1, lon = -89.3, name = "Madison", runways = emptyList(), metar = EmergencyMetar(flightCategory = "VFR"))),
    )

    @Test
    fun theFirstMessageIsShownAndSaidOnce() {
        var asks = 0
        val rules = Rules()
        val voice = Voice()
        val model = CopilotModel({ _, _, dest, _, path -> asks++; assertEquals("KMSN", dest); assertEquals("42.0,-88.4;43.1,-89.3", path); around }, rules)
        model.look(CopilotMode.SPOKEN, flying = true, fix = fix, flight = flight, ahead = emptyList(), voice = voice, nowMs = 0)
        assertEquals(1, asks)
        assertEquals("KMSN", model.message.value!!.id)
        assertEquals(listOf("!KMSN went IFR"), voice.said)
        val input = rules.input!!
        assertEquals("VFR", input.fields.single().plannedCategory)
        assertEquals(70.0, input.remainingNm!!, 0.0)
        assertEquals(40.0, input.fuelGal!!, 0.0)
        // Looked at again soon after: not said again.
        model.look(CopilotMode.SPOKEN, true, fix.copy(atMs = 1_000_000L + 4_000), flight, emptyList(), voice, nowMs = 4_000)
        assertEquals(1, voice.said.size)
        model.dismiss()
        model.look(CopilotMode.SPOKEN, true, fix.copy(atMs = 1_000_000L + 8_000), flight, emptyList(), voice, nowMs = 8_000)
        assertEquals("KJVL", model.message.value!!.id)
        assertEquals(1, asks)
    }

    @Test
    fun offOrOnTheGroundItSaysNothing() {
        val model = CopilotModel({ _, _, _, _, _ -> around }, Rules())
        model.look(CopilotMode.OFF, true, fix, flight, emptyList(), null, nowMs = 0)
        assertNull(model.message.value)
        model.look(CopilotMode.ON, false, fix, flight, emptyList(), null, nowMs = 0)
        assertNull(model.message.value)
    }
}
