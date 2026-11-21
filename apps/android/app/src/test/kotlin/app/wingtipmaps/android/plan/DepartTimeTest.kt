package app.wingtipmaps.android.plan

import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.Instant
import java.time.ZoneId

/** The time pill's pick: the next time the clock reads it, today or
 *  tomorrow, sent as an instant in UTC; and where the picker opens. */
class DepartTimeTest {
    private val chicago = ZoneId.of("America/Chicago")

    // 2026-11-21 14:30 in Chicago (CST, UTC-6).
    private val now = Instant.parse("2026-11-21T20:30:00Z").toEpochMilli()

    @Test
    fun aTimeLaterTodayIsToday() {
        assertEquals("2026-11-21T21:00:00Z", DepartTime.next(15, 0, now, chicago))
    }

    @Test
    fun aTimeGoneByIsTomorrow() {
        assertEquals("2026-11-22T15:00:00Z", DepartTime.next(9, 0, now, chicago))
    }

    @Test
    fun theTimeAsItIsNowIsNow() {
        assertEquals("2026-11-21T20:30:00Z", DepartTime.next(14, 30, now + 30_000, chicago))
    }

    @Test
    fun thePickerOpensAtThePlansTimeElseNow() {
        assertEquals(14 to 30, DepartTime.hourMinute(null, now, chicago))
        assertEquals(15 to 0, DepartTime.hourMinute(Instant.parse("2026-11-21T21:00:00Z").toEpochMilli(), now, chicago))
    }
}
