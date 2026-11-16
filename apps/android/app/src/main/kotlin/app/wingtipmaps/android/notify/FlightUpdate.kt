package app.wingtipmaps.android.notify

import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.format.Format
import kotlin.math.roundToInt

/**
 * A flight in progress as Android's Live Update shows it (the status
 * bar's chip and the promoted notification, FlightNotification), the twin
 * of the iPhone's Live Activity (FlightActivityAttributes and
 * FlightActivityContent): the route's ends, the next point and the
 * minutes to it, the miles and the time still to fly, the arrival, and
 * the fuel the plan expects left. Every figure is the engine's `in_flight`
 * answer for the last fix (InFlight), carried as a number and written by
 * Format as every figure is; nothing is worked out here.
 */
data class FlightUpdate(
    val dep: String,
    val dest: String,
    /** The next point ahead and the minutes to it; null past the last. */
    val nextFix: String?,
    val nextEteMin: Double?,
    /** The miles still to fly, and the minutes and the arrival they point
     *  at; null where the engine has no speed to work them. */
    val toGoNm: Double,
    val destEteMin: Double?,
    val etaMs: Long?,
    /** Gallons the plan expects left here (the planned burn counted down,
     *  never the airplane's gauge); null with no airplane picked, since an
     *  assumed airplane's fuel is no figure at all (docs/decisions/0011). */
    val fuelLeftGal: Double?,
    /** How far along the route, 0 to 1, for the progress bar. */
    val along: Double,
    val atMs: Long,
    /** The miles to the next point, the engine's, for the chip and the
     *  title where there is no time to it. */
    val nextNm: Double? = null,
    /** Each leg's miles, the planner's nav log's, so the bar has a
     *  segment a leg and a point at each waypoint between them. */
    val legsNm: List<Double> = emptyList(),
) {
    /** The status bar's chip: the minutes to the next point, else to the
     *  destination, as the iPhone's compact Dynamic Island has it; with
     *  no time to either (no speed to work one), the miles to the next
     *  point, else to the destination. */
    val chip: String get() = (nextEteMin ?: destEteMin)?.let(Format::duration) ?: Format.distance(nextNm ?: toGoNm)

    /** "Next PIPER in 12m", the notification's title; "Next PIPER, 12.0 nm"
     *  with no time to it. */
    val title: String get() = when {
        nextFix == null -> "To $dest"
        nextEteMin != null -> "Next $nextFix in ${Format.duration(nextEteMin)}"
        nextNm != null -> "Next $nextFix, ${Format.distance(nextNm)}"
        else -> "Next $nextFix"
    }

    /** The Live Update's bar: its segments' lengths, its points'
     *  positions and the airplane's place, all on one scale. */
    data class Bar(val segments: List<Int>, val points: List<Int>, val progress: Int)

    /**
     * The bar as Android's progress-centric notification draws a journey:
     * one segment a leg, in tenths of a mile so a short leg still has a
     * length, and a point at each waypoint between legs (the ends are the
     * bar's own). With no legs, one segment of `steps`.
     */
    fun bar(steps: Int): Bar {
        val lengths = legsNm.map { (it * 10).roundToInt().coerceAtLeast(1) }
        if (lengths.isEmpty()) return Bar(listOf(steps), emptyList(), progress(steps))
        val max = lengths.sum()
        val points = lengths.runningReduce(Int::plus).dropLast(1)
        return Bar(lengths, points, (along.coerceIn(0.0, 1.0) * max).roundToInt())
    }

    /** "1h 5m · 102.0 nm to KDLH · 18.4 gal planned left". */
    val text: String get() {
        val distance = Format.distance(toGoNm)
        val toGo = destEteMin?.let { "${Format.duration(it)} · $distance" } ?: distance
        return listOfNotNull("$toGo to $dest", fuelLeftGal?.let { "${Format.fuel(it)} planned left" }).joinToString(" · ")
    }

    /** "C81 → KDLH · arriving 14:07". */
    val route: String get() = "$dep → $dest" + (etaMs?.let { " · arriving ${Format.clock(it)}" } ?: "")

    /** The progress bar's position in `steps`. */
    fun progress(steps: Int): Int = (along.coerceIn(0.0, 1.0) * steps).roundToInt()

    companion object {
        /**
         * The update for a fix, or null with nothing to show: not under
         * way, no route, or no answer from the engine for this fix.
         *
         * @param airplaneChosen whether an airplane is picked; with none
         *   there is no fuel to show.
         * @param legsNm each leg's miles, for the bar's segments.
         */
        fun of(
            progress: EngineContract.InFlightAnswer?,
            underway: Boolean,
            dep: String,
            dest: String,
            airplaneChosen: Boolean,
            nowMs: Long,
            legsNm: List<Double> = emptyList(),
        ): FlightUpdate? {
            if (!underway || progress == null || dest.isEmpty()) return null
            val next = progress.next
            val destination = progress.destination
            // The fuel the plan expects in the tanks now, the engine's
            // (in_flight's fuel_now_gal: from the last fuel stop passed, the
            // tanks filled there, less the start and taxi allowance; the
            // aviation audit's AV-4), planning data as the nav log's fuel
            // column is. No subtraction here.
            val fuelLeft = if (airplaneChosen) progress.fuelNowGal else null
            return FlightUpdate(
                dep = dep,
                dest = dest,
                nextFix = next?.name,
                nextEteMin = next?.eteMin,
                toGoNm = progress.leftNm,
                destEteMin = destination?.eteMin,
                etaMs = destination?.etaS?.let { (it * 1000).toLong() },
                fuelLeftGal = fuelLeft,
                along = if (progress.totalNm > 0) progress.alongNm / progress.totalNm else 0.0,
                atMs = nowMs,
                nextNm = next?.distanceNm,
                legsNm = legsNm,
            )
        }

        /**
         * Whether a new update is worth posting: a glance at the status
         * bar wants the next point the moment it changes, and Android
         * limits how often an app's notification changes, so otherwise
         * only every `everyMs`.
         */
        fun due(update: FlightUpdate, last: FlightUpdate?, everyMs: Long): Boolean {
            if (last == null) return true
            if (update.nextFix != last.nextFix || update.dest != last.dest) return true
            return update.atMs - last.atMs >= everyMs
        }
    }
}
