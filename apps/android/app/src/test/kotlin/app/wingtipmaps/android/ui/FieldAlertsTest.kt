package app.wingtipmaps.android.ui

import app.wingtipmaps.android.api.generated.NotamsRanked
import app.wingtipmaps.android.api.generated.RankedNotam
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The airport card's alert card keeps the engine's closures and the
 *  TFRs near the field, in its order, and says when each is in force. */
class FieldAlertsTest {
    private fun notam(id: String, rank: Int, closed: Boolean = false, kind: String = "notam", raw: String = "!OSH 11/001 OSH RWY 18/36 CLSD", inForce: Boolean? = null, starts: String? = null, ends: String? = null) =
        RankedNotam(closed = closed, id = id, kind = kind, rank = rank, raw = raw, reasons = emptyList(), runways = emptyList(), score = 0, tied = false, top = false, inForce = inForce, starts = starts, ends = ends)

    @Test
    fun keepsClosuresAndTfrsInTheEnginesOrderAtMostThree() {
        val ranked = NotamsRanked(
            notams = listOf(
                notam("taxiway", 1),
                notam("tfr", 4, kind = "tfr"),
                notam("runway", 2, closed = true),
                notam("field", 3, closed = true),
                notam("another", 5, closed = true),
            ),
            top = 3,
        )
        assertEquals(listOf("runway", "field", "tfr"), FieldAlerts.of(ranked).map { it.id })
        assertTrue(FieldAlerts.of(null).isEmpty())
        assertTrue(FieldAlerts.of(NotamsRanked(notams = listOf(notam("lights", 1)), top = 1)).isEmpty())
    }

    @Test
    fun dropsTheHeadOfWhoSentItAndItsNumber() {
        assertEquals("RWY 18/36 CLSD", FieldAlerts.body("!OSH 11/001 OSH RWY 18/36 CLSD"))
        assertEquals("!OSH", FieldAlerts.body("!OSH"))
    }

    @Test
    fun saysWhenInUtcWithTheDay() {
        assertEquals(FieldAlerts.When.Now("Nov 12 1432Z"), FieldAlerts.whenOf(notam("a", 1, inForce = true, ends = "2026-11-12T14:32:00Z")))
        assertEquals(FieldAlerts.When.Now(null), FieldAlerts.whenOf(notam("a", 1, inForce = true)))
        // A naive time from the feed is UTC.
        assertEquals(FieldAlerts.When.Coming("Nov 10 0900Z", null), FieldAlerts.whenOf(notam("a", 1, inForce = false, starts = "2026-11-10T09:00:00")))
        assertNull(FieldAlerts.whenOf(notam("a", 1)))
    }
}
