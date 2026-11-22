package app.wingtipmaps.android.plan

import java.time.Instant
import java.time.ZoneId

/**
 * When the flight leaves, as the plan's time pill sets it (the web's
 * DepartPicker since the owner's ask of 2026-11-21: one button showing
 * the time, a tap opening the hours and the minutes): the clock's hour
 * and minute picked are the next time the device's clock reads them,
 * today or, where that has gone by, tomorrow, sent to the planner as an
 * instant in UTC (its `depart`). Pure, for a unit test.
 */
object DepartTime {
    /** A minute's grace, so the time picked as it is now is now, not tomorrow. */
    private const val GRACE_MIN = 1L

    /** The next `hour`:`minute` on the clock in `zone` from `nowMs`, as an instant. */
    fun next(hour: Int, minute: Int, nowMs: Long, zone: ZoneId = ZoneId.systemDefault()): String {
        val now = Instant.ofEpochMilli(nowMs).atZone(zone)
        val today = now.withHour(hour).withMinute(minute).withSecond(0).withNano(0)
        val at = if (today.isBefore(now.minusMinutes(GRACE_MIN))) today.plusDays(1) else today
        return at.toInstant().toString()
    }

    /** The hour and minute the picker opens at: the plan's time, else now's. */
    fun hourMinute(departMs: Long?, nowMs: Long, zone: ZoneId = ZoneId.systemDefault()): Pair<Int, Int> {
        val at = Instant.ofEpochMilli(departMs ?: nowMs).atZone(zone)
        return at.hour to at.minute
    }
}
