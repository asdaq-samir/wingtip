package app.wingtipmaps.android.atc

import app.wingtipmaps.android.MainRule
import app.wingtipmaps.android.engine.generated.EngineContract
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

/** The ATC copilot's model over a fake radio and a fake engine: listening
 *  started and stopped with the flight, a call to us making a card, our
 *  readback checked, someone else's call making none, and nothing set
 *  until a tap. */
class AtcCopilotModelTest {
    @get:Rule val main = MainRule()

    private val call = "Cessna one two three alpha bravo, proceed direct Gopher, squawk four five one two"

    private class Radio : AtcListener {
        override val heard = MutableStateFlow<List<Heard>>(emptyList())
        override val listening = MutableStateFlow(false)
        override val error = MutableStateFlow<String?>(null)
        var onceSays: String? = null
        override fun start() { listening.value = true }
        override fun stop() { listening.value = false }
        override suspend fun once(): String? = onceSays
        fun say(id: Int, text: String, atMs: Long) { heard.value = heard.value + Heard(id, text, atMs, final = true) }
    }

    /** Ours by the call sign's words, as the engine reads it (AIM 4-2-3 c). */
    private class Rules : AtcRules {
        var priors = mutableListOf<EngineContract.AtcCallInputPrior?>()
        override fun call(text: String, tail: String?, prior: EngineContract.AtcCallInputPrior?): EngineContract.AtcCallAnswer {
            priors += prior
            return when {
                text.startsWith("Cessna one two three") -> EngineContract.AtcCallAnswer(
                    "to_us", Json.parseToJsonElement("""[{"kind":"direct","said":"gopher"},{"kind":"squawk","code":"4512"}]""").jsonArray,
                )
                text.endsWith("three alpha bravo") -> EngineContract.AtcCallAnswer("from_us", emptyList())
                else -> EngineContract.AtcCallAnswer("other", emptyList())
            }
        }
        override fun readback(cleared: String, said: String, tail: String?) =
            EngineContract.ReadbackCheckAnswer(if ("four five one two" in said) emptyList() else listOf(EngineContract.ReadbackCheckAnswerItemsItem("squawk", "4512", null, true)), "")
        override fun altitude(ft: Double) = "$ft ft"
    }

    @Test
    fun listeningFollowsTheFlightWithARegistration() {
        val radio = Radio()
        val model = AtcCopilotModel(radio, Rules())
        model.follow(AtcMode.FLYING, flying = true, tail = null)
        assertFalse(radio.listening.value)
        assertTrue(model.state.value.noTail)
        model.follow(AtcMode.FLYING, flying = true, tail = "n123ab")
        assertTrue(radio.listening.value)
        model.follow(AtcMode.FLYING, flying = false, tail = "N123AB")
        assertFalse(radio.listening.value)
        model.follow(AtcMode.OFF, flying = true, tail = "N123AB")
        assertFalse(radio.listening.value)
    }

    @Test
    fun aCallToUsMakesACardAndOurReadbackIsChecked() {
        val radio = Radio()
        val rules = Rules()
        val model = AtcCopilotModel(radio, rules)
        model.follow(AtcMode.FLYING, true, "N123AB")
        radio.say(1, call, 1_000)
        val card = model.state.value.card!!
        assertEquals(listOf("direct", "squawk"), card.items.map { it.kind })
        // Someone else's call: no card of its own.
        radio.say(2, "Skyhawk four five six, contact tower", 3_000)
        assertEquals(1, model.state.value.cards.size)
        // Our readback within the minute, the call carried as the prior.
        radio.say(3, "direct Gopher, squawk four five one two, Cessna three alpha bravo", 5_000)
        assertEquals(4.0, rules.priors.last()!!.agoS, 0.0)
        assertEquals(listOf("Readback complete"), AtcWords.readbackLines(model.state.value.card!!.readback!!.check))
    }

    @Test
    fun nothingIsSetUntilATapAndReadBackListensOnce() {
        val radio = Radio()
        val model = AtcCopilotModel(radio, Rules())
        model.follow(AtcMode.FLYING, true, "N123AB")
        radio.say(1, call, 1_000)
        assertNull(model.state.value.kept.squawk)
        val directed = mutableListOf<String>()
        model.act(0) { directed += it; null }
        model.act(1) { error("no direct for a code") }
        assertEquals(listOf("GOPHER"), directed)
        assertEquals("4512", model.state.value.kept.squawk)
        assertEquals(setOf(0, 1), model.state.value.card!!.set)
        // A Direct To that cannot be flown says why, and is not marked set.
        model.dismiss()
        assertNull(model.state.value.card)
        radio.say(2, "Cessna one two three alpha bravo, proceed direct Gopher, squawk four five one two", 90_000)
        model.act(0) { "Direct To needs your position" }
        assertEquals("Direct To needs your position", model.state.value.problem)
        assertTrue(model.state.value.card!!.set.isEmpty())
        // Read Back with the radio off: the microphone once, a short readback.
        radio.stop()
        radio.onceSays = "direct Gopher"
        model.readBack()
        val rb = model.state.value.card!!.readback!!
        assertEquals("direct Gopher", rb.said)
        assertTrue(AtcWords.readbackShort(rb.check))
    }
}
