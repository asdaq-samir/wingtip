package app.wingtipmaps.android.clearance

import app.wingtipmaps.android.MainRule
import app.wingtipmaps.android.api.generated.ClearanceAsk
import app.wingtipmaps.android.api.generated.ClearancePlaces
import app.wingtipmaps.android.api.generated.SpokenPlace
import app.wingtipmaps.android.atc.AtcListener
import app.wingtipmaps.android.atc.Heard
import app.wingtipmaps.android.engine.generated.EngineContract
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

/** The clearance card's model over a fake radio, a fake engine and a fake
 *  planner: typed words read into a clearance, its places looked up once
 *  they settle, a read back checked, the radio followed until the pilot
 *  types, and Enter's route and altitude. */
@OptIn(ExperimentalCoroutinesApi::class)
class ClearanceModelTest {
    @get:Rule val main = MainRule(StandardTestDispatcher())

    private val said = "cleared to the Madison airport via radar vectors Janesville then as filed maintain three thousand expect five thousand squawk four five one two"

    private class Radio : AtcListener {
        override val heard = MutableStateFlow<List<Heard>>(emptyList())
        override val listening = MutableStateFlow(false)
        override val error = MutableStateFlow<String?>(null)
        var onceSays: String? = null
        override fun start() { listening.value = true }
        override fun stop() { listening.value = false }
        override suspend fun once(): String? = onceSays
    }

    private object Rules : ClearanceRules {
        override fun read(text: String) = Result.success(
            if ("cleared" !in text) Clearance(EngineContract.Clearance(route = emptyList(), asFiled = false, vfr = false, classB = false), emptyList())
            else Clearance(
                EngineContract.Clearance(
                    limit = "madison airport", route = emptyList(), asFiled = true, maintainFt = 3000, vfr = false, expectFt = 5000, squawk = "4512", classB = false,
                ),
                listOf(ClearedItem("vectors"), ClearedItem("places", said = "janesville")),
            ),
        )
        override fun cleared(text: String, found: ClearancePlaces?, dep: String, stops: List<String>, dest: String) =
            Result.success(Cleared(dep, listOfNotNull(found?.route?.firstOrNull()?.firstOrNull()?.ident) + stops, found?.limit?.ident ?: dest, emptyList()))
        override fun readback(cleared: String, said: String) = Result.success(
            EngineContract.ReadbackCheckAnswer(
                if ("four five one two" in said) emptyList() else listOf(EngineContract.ReadbackCheckAnswerItemsItem("squawk", "4512", null, true)), "",
            ),
        )
        override fun altitude(ft: Int) = "%,d ft".format(ft)
    }

    private val asked = mutableListOf<ClearanceAsk>()
    private val places: suspend (ClearanceAsk) -> ClearancePlaces = {
        asked += it
        ClearancePlaces(limit = SpokenPlace(said = "madison airport", ident = "KMSN", sure = true), route = listOf(listOf(SpokenPlace(said = "janesville", ident = "JVL", sure = true))))
    }

    private fun model(radio: Radio? = Radio()) = ClearanceModel(radio, Rules, places).also {
        it.flight(ClearanceModel.Flight("KDPA", listOf("KRFD"), "KMSN", "41.9,-88.2"))
    }

    @Test
    fun typedWordsAreReadAndTheirPlacesFoundOnceSettled() = runTest(main.dispatcher) {
        val m = model()
        m.type(said)
        assertTrue(m.state.value.heard)
        assertFalse(m.state.value.ready)
        assertEquals("Maintain 3,000 ft, expect 5,000 ft", m.state.value.altitudes)
        advanceUntilIdle()
        assertEquals(1, asked.size)
        assertEquals(listOf("janesville"), asked[0].route)
        assertEquals("41.9,-88.2", asked[0].near)
        assertTrue(m.state.value.ready)
        assertEquals(listOf("JVL", "KRFD"), m.state.value.cleared?.stops)
    }

    @Test
    fun aReadBackIsCheckedLineByLine() = runTest(main.dispatcher) {
        val m = model()
        m.type(said)
        m.typeReadback("five thousand, squawk four five one two")
        val c = m.state.value.clearance!!
        assertEquals(listOf(ClearanceWords.Line(true, "Limit, route, altitude, expected altitude and squawk read back")), ClearanceWords.readbackLines(c, m.state.value.check!!))
        m.typeReadback("five thousand")
        assertEquals(ClearanceWords.Line(false, "Squawk 4512 not read back"), ClearanceWords.readbackLines(c, m.state.value.check!!).last())
    }

    @Test
    fun theRadioIsFollowedUntilThePilotTypes() = runTest(main.dispatcher) {
        val radio = Radio()
        val m = model(radio)
        advanceUntilIdle()
        radio.heard.value = listOf(Heard(1, said, 0, final = true))
        advanceUntilIdle()
        assertEquals(said, m.state.value.text)
        m.type("typed")
        radio.heard.value = radio.heard.value + Heard(2, "november one two three", 1, final = true)
        advanceUntilIdle()
        assertEquals("typed", m.state.value.text)
    }

    @Test
    fun readBackAgainTakesTheNextTransmission() = runTest(main.dispatcher) {
        val radio = Radio().apply { onceSays = "squawk four five one two" }
        val m = model(radio)
        m.type(said)
        m.readBackAgain()
        advanceUntilIdle()
        assertEquals("squawk four five one two", m.state.value.readback)
        assertFalse(m.state.value.readingBack)
    }

    @Test
    fun enterFliesTheAltitudeToExpect() = runTest(main.dispatcher) {
        val m = model()
        assertNull(m.entry())
        m.type(said)
        advanceUntilIdle()
        assertEquals(ClearanceModel.Entry("KDPA", listOf("JVL", "KRFD"), "KMSN", 5000.0), m.entry())
    }

    @Test
    fun theRouteIsComparedWithTheOneFiled() {
        val same = ClearanceWords.compare(listOf("KRFD"), "KMSN", Cleared("KDPA", listOf("KRFD"), "KMSN", emptyList()))
        assertTrue(same.same)
        val other = ClearanceWords.compare(listOf("KRFD"), "KMSN", Cleared("KDPA", listOf("JVL"), "KMSN", emptyList()))
        assertEquals("JVL instead of KRFD.", other.words)
    }
}
