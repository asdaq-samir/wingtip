package app.wingtipmaps.android

import androidx.compose.runtime.Composable
import androidx.compose.runtime.State
import androidx.compose.runtime.produceState
import kotlinx.coroutines.delay
import java.time.LocalDate
import java.time.ZoneId
import kotlin.time.Clock
import kotlin.time.Instant
import kotlin.time.toJavaInstant

/**
 * The app's one wall clock: Kotlin's own (kotlin.time.Clock, the
 * standard library's), read here and nowhere else, so every screen and
 * model agrees on what now is and a test sets it in one place. Intervals
 * that must not jump with the phone's clock (frame times, the process's
 * start) stay on SystemClock's monotonic one.
 */
object AppClock {
    /** The clock read; Clock.System on the phone, a fixed one in a test. */
    @Volatile
    var clock: Clock = Clock.System

    /** Now, Kotlin's Instant. */
    fun now(): Instant = clock.now()

    /** Now, in milliseconds since 1970 (UTC), as the app keeps times. */
    fun nowMs(): Long = clock.now().toEpochMilliseconds()

    /** Now, java.time's Instant, for the code that works in java.time. */
    fun javaNow(): java.time.Instant = clock.now().toJavaInstant()

    /** Today's date where `zone` is (the phone's own by default). */
    fun today(zone: ZoneId = ZoneId.systemDefault()): LocalDate = javaNow().atZone(zone).toLocalDate()

    /** The clock read again every `everyMs` while a screen shows it: one
     *  ticking now for the lines that count up ("2 min ago") and the
     *  marks that go stale, in place of a loop of their own on each. */
    @Composable
    fun ticking(everyMs: Long = 1_000L): State<Long> = produceState(nowMs(), everyMs) {
        while (true) {
            delay(everyMs)
            value = nowMs()
        }
    }
}
