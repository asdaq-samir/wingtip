package app.wingtipmaps.android.route

import app.wingtipmaps.android.api.Leg
import app.wingtipmaps.android.format.Spoken

/**
 * A leg as TalkBack reads its row, one sentence for the whole row (each
 * row is one node, so a swipe moves a leg at a time): where it goes, the
 * cruise altitude, how far, the heading and the time, in the spoken forms
 * (Spoken). The heading is the magnetic heading where the planner sent
 * one, else the magnetic course, as the row writes it (decision 0011).
 * Pure, so it is held on the JVM (LegWordsTest).
 */
object LegWords {
    /** The nav log's row: "To KDLH, four thousand five hundred feet,
     *  twenty-four nautical miles, heading three one eight degrees
     *  magnetic, eighteen minutes". */
    fun row(leg: Leg): String = listOfNotNull(
        "To ${leg.to}",
        Spoken.altitude(leg.altitudeFt),
        // Flown whole in the climb or the descent: said, as the row shows it.
        when (leg.phase) {
            "climb" -> "in the climb"
            "descent" -> "in the descent"
            else -> null
        },
        Spoken.distance(leg.distanceNm),
        bearing(leg),
        leg.eteMin?.let(Spoken::duration),
    ).joinToString(", ")

    /** A checkpoint's row on the strip: "3. Lake Bemidji, heading three
     *  one eight degrees magnetic, twenty-four nautical miles, eighteen
     *  minutes". */
    fun checkpoint(number: Int, name: String, leg: Leg): String = listOfNotNull(
        "$number. $name",
        bearing(leg),
        Spoken.distance(leg.distanceNm),
        leg.eteMin?.let(Spoken::duration),
    ).joinToString(", ")

    /** The leg's heading said, or its course where no heading was sent. */
    fun bearing(leg: Leg): String {
        val heading = leg.magneticHeadingDeg
        return if (heading != null) "heading ${Spoken.headingMagnetic(heading)}"
        else "course ${Spoken.headingMagnetic(leg.magneticCourseDeg)}"
    }
}
