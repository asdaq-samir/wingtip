package app.wingtipmaps.android.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** The NOTAM list's coverage days as the web's notamCoverage.test.ts writes
 *  them (decision 0059): "NOTAMs heard since 19 Oct 2026, not a full set",
 *  "None heard since 19 Oct". */
class NotamCoverageTest {
    @Test
    fun theFeedsDayIsWrittenAsTheWebWritesIt() {
        assertEquals("19 Oct 2026", NotamCoverage.withYear("2026-10-19"))
        assertEquals("10 Nov 2026", NotamCoverage.withYear("2026-11-10T06:00:00Z"))
        assertEquals("19 Oct", NotamCoverage.short("2026-10-19"))
        assertNull(NotamCoverage.withYear(null))
        assertNull(NotamCoverage.short("soon"))
    }
}
