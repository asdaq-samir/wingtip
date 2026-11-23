package app.wingtipmaps.android.flight

import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import java.util.Locale

/** A target's height against own ship's in a notification, grouped as the
 *  FAA writes it on a phone set to Germany, where "%,d" wrote "1.200". */
class TrafficWordsTest {
    private val was = Locale.getDefault()

    @Before
    fun german() = Locale.setDefault(Locale.GERMANY)

    @After
    fun back() = Locale.setDefault(was)

    @Test
    fun aHeightIsGroupedWithACommaWhateverTheRegion() {
        assertEquals("1,200 ft above", Traffic.against(1180.0))
        assertEquals("500 ft below", Traffic.against(-520.0))
        assertEquals("at your height", Traffic.against(30.0))
    }

    /** Own height is marked to the nearest 10 ft, as the web and the
     *  iPhone mark it (Traffic.markedFt), so the 1,000 ft near band of a
     *  wandering GPS height gives one airplane one answer on all three. */
    @Test
    fun ownHeightIsMarkedToTheNearestTenFeet() {
        assertEquals(4510.0, Traffic.markedFt(4507.0)!!, 0.0)
        assertEquals(4500.0, Traffic.markedFt(4504.9)!!, 0.0)
        assertEquals(null, Traffic.markedFt(null))
    }
}
