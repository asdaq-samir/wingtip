package app.wingtipmaps.android

import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.LocalDate
import java.time.ZoneOffset
import kotlin.time.Clock
import kotlin.time.Instant

/** The app's one clock: every reading is the clock set, so a test that
 *  sets it sets now for the whole app. */
class AppClockTest {
    @After
    fun tearDown() {
        AppClock.clock = Clock.System
    }

    @Test
    fun everyReadingIsTheClockSet() {
        val at = Instant.parse("2026-11-12T23:30:00Z")
        AppClock.clock = object : Clock {
            override fun now(): Instant = at
        }
        assertEquals(at, AppClock.now())
        assertEquals(at.toEpochMilliseconds(), AppClock.nowMs())
        assertEquals(java.time.Instant.parse("2026-11-12T23:30:00Z"), AppClock.javaNow())
        assertEquals(LocalDate.of(2026, 11, 12), AppClock.today(ZoneOffset.UTC))
        // Already tomorrow two hours east of Greenwich.
        assertEquals(LocalDate.of(2026, 11, 13), AppClock.today(ZoneOffset.ofHours(2)))
    }
}
