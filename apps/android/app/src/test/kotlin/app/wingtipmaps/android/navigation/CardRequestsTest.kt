package app.wingtipmaps.android.navigation

import app.wingtipmaps.android.map.MapPick
import app.wingtipmaps.android.ui.SheetPage
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** A card asked for elsewhere -- a route point's More Info, an alert, the
 *  strip's checkpoint -- is taken once, as the card a tap would open.
 *  (OverRequests, the sheets over the map, went with the card rule.) */
class CardRequestsTest {
    @After
    fun clear() {
        CardRequests.take()
    }

    @Test
    fun aPickIsItsCard() {
        CardRequests.open(MapPick.Airport("KOSH"))
        assertEquals(SheetPage.Airport("KOSH"), CardRequests.take())
        assertNull(CardRequests.take())
    }

    @Test
    fun aPageIsTakenOnce() {
        CardRequests.open(SheetPage.Clearance)
        assertEquals(SheetPage.Clearance, CardRequests.wanted.value)
        assertEquals(SheetPage.Clearance, CardRequests.take())
        assertNull(CardRequests.wanted.value)
    }

    @Test
    fun theLastAskedWins() {
        CardRequests.open(MapPick.RouteLeg(3))
        CardRequests.open(SheetPage.MapSettings)
        assertEquals(SheetPage.MapSettings, CardRequests.take())
    }
}
