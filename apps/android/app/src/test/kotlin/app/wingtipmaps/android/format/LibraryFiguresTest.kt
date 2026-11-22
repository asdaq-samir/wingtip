package app.wingtipmaps.android.format

import org.junit.Assert.assertEquals
import org.junit.Test

/** The documents library's two figures, as the web's lib/format writes
 *  them (megabytes, dayMonthYear). */
class LibraryFiguresTest {
    @Test
    fun aSizeIsWholeMegabytesFromOneAndTenthsBelow() {
        assertEquals("3 MB", Format.megabytes(3_200_000))
        assertEquals("0.4 MB", Format.megabytes(420_000))
        assertEquals("0.1 MB", Format.megabytes(1_000))
    }

    @Test
    fun anEditionsDayIsDayMonthYear() {
        assertEquals("3 Nov 2026", Format.day("2026-11-03"))
        assertEquals("10 Nov 2026", Format.day("2026-11-10T00:00:00Z"))
        assertEquals("soon", Format.day("soon"))
    }
}
