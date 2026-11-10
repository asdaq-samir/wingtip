package app.wingtipmaps.android.navigation

import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** The sheets over the map: a page opened from Settings closes back to it. */
class OverRequestsTest {
    @After
    fun clear() = OverRequests.closeAll()

    @Test
    fun aPageOpenedFromSettingsClosesBackToSettings() {
        OverRequests.open(Over.Settings)
        OverRequests.open(Over.Logbook)
        assertEquals(Over.Logbook, OverRequests.shown.value)
        OverRequests.close()
        assertEquals(Over.Settings, OverRequests.shown.value)
        OverRequests.close()
        assertNull(OverRequests.shown.value)
    }

    @Test
    fun theSameSheetOpenedAgainIsOneLevel() {
        OverRequests.open(Over.Settings)
        OverRequests.open(Over.Settings)
        OverRequests.close()
        assertNull(OverRequests.shown.value)
    }

    @Test
    fun closeAllGoesBackToTheMap() {
        OverRequests.open(Over.Settings)
        OverRequests.open(Over.About)
        OverRequests.closeAll()
        assertNull(OverRequests.shown.value)
        OverRequests.open(Over.Downloads)
        OverRequests.close()
        assertNull(OverRequests.shown.value)
    }
}
