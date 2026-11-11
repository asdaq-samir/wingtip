package app.wingtipmaps.android.ai

import app.wingtipmaps.android.MainRule
import app.wingtipmaps.android.api.Assistant
import app.wingtipmaps.android.api.AssistantClient
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

/** The gateway's word on the Claude features (the owner's decision of
 *  2026-11-10: off until the subscription is decided), read failing
 *  closed, and every server-Claude call refused before it is made. */
class ClaudeGateTest {
    @get:Rule val main = MainRule()

    @After
    fun off() = ClaudeGate.set(ClaudeGate.OFF, developer = false)

    @Test
    fun onOnlyForEveryoneOrADeveloperWhereDevelopersHaveIt() {
        assertTrue(ClaudeGate.on(ClaudeGate.EVERYONE, developer = false))
        assertTrue(ClaudeGate.on(ClaudeGate.DEVELOPERS, developer = true))
        assertFalse(ClaudeGate.on(ClaudeGate.DEVELOPERS, developer = false))
        assertFalse(ClaudeGate.on(ClaudeGate.OFF, developer = true))
        // Not yet read, or a word this build does not know: off.
        assertFalse(ClaudeGate.on(null, developer = true))
        assertFalse(ClaudeGate.on("SOME_DAY", developer = true))
    }

    @Test
    fun offUntilTheGatewayHasSaidOtherwise() {
        assertFalse(ClaudeGate.on.value)
        ClaudeGate.set(ClaudeGate.EVERYONE, developer = false)
        assertTrue(ClaudeGate.on.value)
    }

    @Test
    fun theServerAssistantIsNeverAskedWhileOff() {
        assertThrows(ClaudeGate.Off::class.java) { runBlocking { Assistant.stream(Assistant.Ask(emptyList())).toList() } }
        assertThrows(ClaudeGate.Off::class.java) { ClaudeGate.require() }
    }

    @Test
    fun askOffersNothingWithoutNanoOrClaude() {
        assertFalse(AiOffered.of(Nano.Status.UNAVAILABLE, claude = false))
        assertTrue(AiOffered.of(Nano.Status.AVAILABLE, claude = false))
        assertTrue(AiOffered.of(Nano.Status.UNAVAILABLE, claude = true))
    }

    @Test
    fun aQuestionAskedAnywayIsSaidNotSent() {
        val client = AssistantClient()
        client.ask("What is the ceiling at KMSN?", null)
        val last = client.conversation.value.turns.last()
        assertEquals("That isn't available on this phone.", last.problem)
    }
}
