package app.wingtipmaps.android.plan

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** The pilot's home airport: the account's home base first, so it
 *  follows the pilot across devices, else the one kept on this phone. */
class HomeAirportTest {
    @Test
    fun theAccountsHomeBaseComesFirst() {
        assertEquals("KMSN", HomeAirport.mirrored("KMSN", "KJVL"))
    }

    @Test
    fun withNoneOnTheAccountThePhonesIsTheHome() {
        assertEquals("KJVL", HomeAirport.mirrored(null, "KJVL"))
        assertEquals("KJVL", HomeAirport.mirrored("  ", "KJVL"))
    }

    @Test
    fun anIdentIsTrimmedAndUpperCasedAsThePlannerReadsIt() {
        assertEquals("C81", HomeAirport.mirrored(" c81 ", null))
    }

    @Test
    fun noneAnywhereIsNoHome() {
        assertNull(HomeAirport.mirrored(null, null))
        assertNull(HomeAirport.mirrored("", ""))
    }
}
