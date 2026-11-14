package app.wingtipmaps.android.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.Instant
import java.time.ZoneId

/** A TFR's times on the phone's clock with its zone and UTC, as the web's
 *  advisories.test holds tfrTimes. */
class TfrTimesTest {
    private val chicago = ZoneId.of("America/Chicago")
    private val now = Instant.parse("2026-10-01T12:00:00Z")

    @Test
    fun aSpanWithinADaySaysTheDayOnce() {
        assertEquals(
            TfrTimes.Form.SPAN to "Tue 6 Oct, 18:00 CDT (2300Z) – 20:00 CDT (0100Z)",
            TfrTimes.say("2026-10-06T23:00:00Z", "2026-10-07T01:00:00Z", now, chicago),
        )
    }

    @Test
    fun theYearIsSaidOnBothEndsWhereEitherIsNotThisYears() {
        assertEquals(
            TfrTimes.Form.SPAN to "Sun 1 Nov 2026, 01:00 CDT (0600Z) – Sun 14 Mar 2027, 01:00 CST (0700Z)",
            TfrTimes.say("2026-11-01T06:00:00Z", "2027-03-14T07:00:00Z", now, chicago),
        )
    }

    @Test
    fun anOpenEndIsUntilFurtherNotice() {
        assertEquals(TfrTimes.Form.FROM to "Thu 1 Oct, 11:00 CDT (1600Z)", TfrTimes.say("2026-10-01T16:00:00Z", null, now, chicago))
        assertNull(TfrTimes.say(null, null, now, chicago))
    }

    @Test
    fun itsPageOnTfrFaaGovNamesItsNumber() {
        assertEquals("https://tfr.faa.gov/tfr3/?page=detail_6_4116", TfrTimes.faaPage("6/4116"))
    }
}
