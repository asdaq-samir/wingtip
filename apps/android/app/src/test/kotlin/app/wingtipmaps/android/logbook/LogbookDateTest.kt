package app.wingtipmaps.android.logbook

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** The logbook's ISO date and Material's date picker's day (UTC
 *  midnight) turn into each other unchanged, whatever the phone's zone. */
class LogbookDateTest {
    @Test
    fun aDateIsThePickersUtcMidnight() {
        // 2026-11-09T00:00:00Z.
        assertEquals(1_794_182_400_000L, LogbookDate.millis("2026-11-09"))
        assertEquals(1_794_182_400_000L, LogbookDate.millis(" 2026-11-09 "))
    }

    @Test
    fun thePickersDayReadsBackAsTheSameDate() {
        listOf("2026-01-01", "2026-02-28", "2028-02-29", "2026-12-31").forEach { iso ->
            assertEquals(iso, LogbookDate.iso(LogbookDate.millis(iso)!!))
        }
    }

    @Test
    fun aDateThatDoesNotReadOpensThePickerOnNoDay() {
        assertNull(LogbookDate.millis(""))
        assertNull(LogbookDate.millis("11/09/2026"))
    }
}
