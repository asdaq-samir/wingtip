package app.wingtipmaps.android.route

import app.wingtipmaps.android.api.Leg
import org.junit.Assert.assertEquals
import org.junit.Test

/** A leg's row as TalkBack reads it: every figure in its spoken form, the
 *  heading where the planner sent one and the course where it did not. */
class LegWordsTest {
    private fun leg(mh: Double?, ete: Double?) = Leg(
        altitudeFt = 4500.0, distanceNm = 24.0, from = "KDPA", magneticCourseDeg = 312.0, magneticVariationDeg = -3.0,
        to = "KJVL", trueCourseDeg = 309.0, magneticHeadingDeg = mh, eteMin = ete,
    )

    @Test
    fun aRowSaysWhereHowHighHowFarWhichWayAndHowLong() {
        assertEquals(
            "To KJVL, four thousand five hundred feet, twenty-four nautical miles, heading three one eight degrees magnetic, eighteen minutes",
            LegWords.row(leg(mh = 318.0, ete = 18.0)),
        )
    }

    @Test
    fun withNoAirplaneTheCourseAndNoTime() {
        assertEquals(
            "To KJVL, four thousand five hundred feet, twenty-four nautical miles, course three one two degrees magnetic",
            LegWords.row(leg(mh = null, ete = null)),
        )
    }

    @Test
    fun aCheckpointLeadsWithItsNumberAndName() {
        assertEquals(
            "3. Lake Bemidji, heading three one eight degrees magnetic, twenty-four nautical miles, one hour five minutes",
            LegWords.checkpoint(3, "Lake Bemidji", leg(mh = 318.0, ete = 65.0)),
        )
    }
}
