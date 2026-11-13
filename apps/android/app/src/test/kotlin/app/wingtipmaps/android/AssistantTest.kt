package app.wingtipmaps.android

import app.wingtipmaps.android.api.AssistantConversation
import app.wingtipmaps.android.api.AssistantLine
import app.wingtipmaps.android.api.AssistantSource
import app.wingtipmaps.android.api.AssistantTurn
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** An answer's lines, as Gemini Nano makes them on the phone
 *  (ai/OnPhoneAsk), folded into the conversation as AskScreen shows it
 *  (api/Assistant.kt). */
class AssistantTest {
    private val metar = AssistantSource("metar:KMSN", "KMSN METAR 1852Z", "KMSN 031852Z 27012KT 10SM CLR 18/07 A3012")
    private val stream = listOf(
        AssistantLine.Tool("weather_at", "Checking the weather at KMSN"),
        AssistantLine.Text("KMSN is "),
        AssistantLine.Text("VFR: wind 270 at 12, "),
        AssistantLine.Text("visibility 10, clear below 12,000."),
        AssistantLine.Sources(listOf(metar)),
        AssistantLine.Done,
    )

    @Test
    fun theStreamBecomesOneAnswerWithItsSources() {
        var conversation = AssistantConversation().ask("What's the weather at KMSN?")
        assertTrue(conversation.answering)
        assertEquals(2, conversation.turns.size)
        for (line in stream) {
            conversation = conversation.take(line)
            // The tool's words stand only until the answer's text starts.
            if (line is AssistantLine.Tool) assertEquals("Checking the weather at KMSN", conversation.status)
            if (line is AssistantLine.Text) assertNull(conversation.status)
        }
        assertFalse(conversation.answering)
        val answer = conversation.turns[1]
        assertEquals(AssistantTurn.Role.ASSISTANT, answer.role)
        assertEquals("KMSN is VFR: wind 270 at 12, visibility 10, clear below 12,000.", answer.content)
        assertEquals(listOf("metar:KMSN"), answer.sources.map { it.id })
        assertNull(answer.problem)
        // The whole conversation goes to the model with the next question.
        val next = conversation.ask("And the crosswind?")
        assertEquals(listOf("What's the weather at KMSN?", answer.content, "And the crosswind?"), next.messages.map { it.content })
        assertEquals(listOf("user", "assistant", "user"), next.messages.map { it.role })
    }

    @Test
    fun aProblemIsSaidUnderTheAnswer() {
        val conversation = AssistantConversation().ask("Brief me")
            .take(AssistantLine.Text("Winds aloft "))
            .take(AssistantLine.Problem("The winds aloft could not be fetched."))
        assertFalse(conversation.answering)
        assertEquals("Winds aloft ", conversation.turns.last().content)
        assertEquals("The winds aloft could not be fetched.", conversation.turns.last().problem)
        // An answer cut off before a word is not given to the model again.
        val empty = AssistantConversation().ask("Brief me").broke("Ask needs Gemini Nano on this phone.")
        assertEquals("Ask needs Gemini Nano on this phone.", empty.turns.last().problem)
        assertEquals(listOf("Brief me"), empty.messages.map { it.content })
    }

    @Test
    fun anAnswerMadeOnThePhoneIsMarkedSo() {
        val conversation = AssistantConversation().ask("Brief me").take(AssistantLine.OnPhone)
        assertTrue(conversation.turns.last().onPhone)
    }
}
