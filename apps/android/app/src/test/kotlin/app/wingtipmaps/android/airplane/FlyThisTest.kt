package app.wingtipmaps.android.airplane

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Fly This Airplane: the plan's airplane made the one shown, none assumed. */
class FlyThisTest {
    private val stock = setOf("c172", "pa28")

    @Test
    fun anOwnAirplaneOfAStockTypeIsFlownOnItsBook() {
        val record = OwnRecord(tail = "N3429J", type = "PA28")
        assertEquals(FlyThis.Choice(aircraft = "pa28", tail = "N3429J"), FlyThis.choice("N3429J", null, record, stock))
    }

    @Test
    fun anNNumberWithNoStockTypeIsFlownWithNoBook() {
        // The FAA registry's airplane, no record: no type is assumed.
        assertEquals(FlyThis.Choice(aircraft = "", tail = "N130SH"), FlyThis.choice("n130sh", null, null, stock))
        val glasair = OwnRecord(tail = "N55GX", type = "GLAS")
        assertEquals(FlyThis.Choice(aircraft = "", tail = "N55GX"), FlyThis.choice("N55GX", null, glasair, stock))
    }

    @Test
    fun aTypeAloneIsFlownWithNoNNumber() {
        assertEquals(FlyThis.Choice(aircraft = "c172", tail = ""), FlyThis.choice(null, "C172", null, stock))
    }

    @Test
    fun theAirplaneFlownIsKnown() {
        val flown = AirplaneNow(aircraft = "pa28", tail = "N3429J")
        assertTrue(FlyThis.isFlown(AirplaneNow(tail = "n3429j"), flown))
        assertFalse(FlyThis.isFlown(AirplaneNow(tail = "N130SH"), flown))
        assertTrue(FlyThis.isFlown(AirplaneNow(aircraft = "c172"), AirplaneNow(aircraft = "c172")))
        assertFalse(FlyThis.isFlown(AirplaneNow(aircraft = "c172"), flown))
    }
}
