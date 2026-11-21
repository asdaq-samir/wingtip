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
}
