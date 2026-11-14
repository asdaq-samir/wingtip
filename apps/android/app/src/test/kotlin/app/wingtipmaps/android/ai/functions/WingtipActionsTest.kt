package app.wingtipmaps.android.ai.functions

import app.wingtipmaps.android.api.AirportSuggestion
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** What an agent is told of fields (decision 0043): a closed field found
 *  by a search is labelled and listed after the open ones, and a route
 *  through one is never planned. */
class WingtipActionsTest {
    @Test
    fun aClosedFieldIsLabelledAndListedLast() {
        val found = WingtipActions.found(
            listOf(
                AirportSuggestion(ident = "00MO", name = "Cooper Flying Service", closed = "Closed indefinitely"),
                AirportSuggestion(ident = "C81", name = "Campbell", municipality = "Grayslake", region = "IL"),
            ),
        )
        assertEquals(listOf("C81", "00MO"), found.map { it.ident })
        assertNull(found[0].closed)
        assertEquals("Closed indefinitely", found[1].closed)
        assertEquals("Grayslake, IL", found[0].place)
    }

    @Test
    fun aRouteThroughAClosedFieldIsRefused() {
        assertEquals(
            "00MO is closed indefinitely (NASR): it cannot be planned as a landing field.",
            WingtipActions.refusal(mapOf("C81" to null, "00MO" to "Closed indefinitely", "IL11" to null)),
        )
        assertNull(WingtipActions.refusal(mapOf("C81" to null, "IL11" to "")))
    }
}
