package app.wingtipmaps.android.format

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** A figure typed on a phone set to a region that writes a decimal comma. */
class TypedTest {
    @Test
    fun aDecimalCommaIsTheDecimalPoint() {
        assertEquals(8.5, Typed.number("8,5")!!, 0.0)
        assertEquals(113.9, Typed.number(" 113,90 ")!!, 0.0)
    }

    @Test
    fun aCommaGroupingThousandsIsNot() {
        assertEquals(4500.0, Typed.number("4,500")!!, 0.0)
        assertEquals(1234.5, Typed.number("1,234.5")!!, 0.0)
        assertEquals(1234.5, Typed.number("1.234,5")!!, 0.0)
        assertEquals(12_500_000.0, Typed.number("12,500,000")!!, 0.0)
    }

    @Test
    fun aPlainFigureAndNoFigure() {
        assertEquals(8.5, Typed.number("8.5")!!, 0.0)
        assertNull(Typed.number(""))
        assertNull(Typed.number("abc"))
    }
}
