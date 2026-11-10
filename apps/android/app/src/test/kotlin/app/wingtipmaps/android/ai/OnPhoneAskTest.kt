package app.wingtipmaps.android.ai

import app.wingtipmaps.android.api.AssistantContext
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class OnPhoneAskTest {
    @Test
    fun saysAToolAsWords() {
        assertEquals("Find airport KPAO", OnPhoneAsk.label("findAirport", "KPAO"))
        assertEquals("Planned route", OnPhoneAsk.label("plannedRoute", ""))
    }

    @Test
    fun noAirplaneMeansNoAirplaneFigure() {
        // The owner's rule: nothing assumes an airplane.
        val words = OnPhoneAsk.contextWords(AssistantContext(dep = "KPAO", dest = "KSQL"))
        assertTrue(words, "The route planned: KPAO KSQL." in words)
        assertTrue(words, "give no airplane figure" in words)
    }
}
