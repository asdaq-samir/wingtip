package app.wingtipmaps.android.ui

import app.wingtipmaps.android.navigation.CardRequests
import app.wingtipmaps.android.navigation.ScreenRequests
import app.wingtipmaps.android.navigation.generated.Screen
import app.wingtipmaps.android.strip.FieldScreen
import app.wingtipmaps.android.ui.OpenScreen.Where
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Where each screen a link names opens under the card rule: the plan,
 *  the search, or a card or page on the sheet's stack. */
class OpenScreenTest {
    @After
    fun clear() {
        CardRequests.take()
        ScreenRequests.take(Screen.entries.toSet())
    }

    @Test
    fun theTabsScreensOpenWhereTheirContentWent() {
        assertEquals(Where.Plan, OpenScreen.whereOf(Screen.FPL))
        assertEquals(Where.Plan, OpenScreen.whereOf(Screen.NAVLOG))
        assertEquals(Where.Search, OpenScreen.whereOf(Screen.AIRPORT))
        assertEquals(Where.Page(SheetPage.Airplane()), OpenScreen.whereOf(Screen.AIRPLANE))
        assertEquals(Where.Page(SheetPage.Settings), OpenScreen.whereOf(Screen.SETUP))
        // Minimums is You's own page now, the three homes of 2026-11-13.
        assertEquals(Where.Page(SheetPage.Minimums), OpenScreen.whereOf(Screen.MINIMUMS))
    }

    @Test
    fun thePagesOpenAsCardsOverTheSearch() {
        assertEquals(Where.Page(SheetPage.Logbook), OpenScreen.whereOf(Screen.LOGBOOK))
        assertEquals(Where.Page(SheetPage.Logbook), OpenScreen.whereOf(Screen.COACH))
        assertEquals(Where.Page(SheetPage.Downloads), OpenScreen.whereOf(Screen.DOWNLOADS))
        assertEquals(Where.Page(SheetPage.Passengers), OpenScreen.whereOf(Screen.PASSENGERS))
        assertEquals(Where.Page(SheetPage.About), OpenScreen.whereOf(Screen.ABOUT))
        assertEquals(Where.Page(SheetPage.Brief), OpenScreen.whereOf(Screen.BRIEF))
        assertEquals(Where.Page(SheetPage.Nearest), OpenScreen.whereOf(Screen.NEAREST))
        assertEquals(Where.Page(SheetPage.Ask), OpenScreen.whereOf(Screen.ASK))
    }

    @Test
    fun onlyEmergencyIsFullScreen() {
        val full = Screen.entries.filter { OpenScreen.whereOf(it) == Where.Emergency }
        assertEquals(listOf(Screen.EMERGENCY), full)
    }

    @Test
    fun everyScreenHasAPlace() {
        Screen.entries.forEach { assertNotNull(OpenScreen.whereOf(it)) }
    }

    @Test
    fun aWordTypedNamesAScreen() {
        assertEquals(Screen.AIRPLANE, OpenScreen.screenOf(FieldScreen.AIRPLANE))
        assertNull(OpenScreen.screenOf(FieldScreen.FUEL))
        assertEquals("Plan a route first.", OpenScreen.field(FieldScreen.BRIEF, routed = false))
    }

    @Test
    fun profileOpensItsCardAndMapItsSettings() {
        assertNull(OpenScreen.screenOf(FieldScreen.PROFILE))
        assertEquals("Plan a route first.", OpenScreen.field(FieldScreen.PROFILE, routed = false))
        assertNull(OpenScreen.field(FieldScreen.PROFILE, routed = true))
        assertEquals(SheetPage.Profile, CardRequests.take())
        assertNull(OpenScreen.field(FieldScreen.MAP, routed = false))
        assertEquals(SheetPage.MapSettings, CardRequests.take())
        assertNull(OpenScreen.field(FieldScreen.CLEARANCE, routed = false))
        assertEquals(SheetPage.Clearance, CardRequests.take())
    }

    @Test
    fun dryRunFliesWithARouteAndSaysSoWithout() {
        var flown = 0
        assertEquals("Plan a route first.", OpenScreen.field(FieldScreen.DRYRUN, routed = false) { flown++ })
        assertEquals(0, flown)
        assertNull(OpenScreen.field(FieldScreen.DRYRUN, routed = true) { flown++ })
        assertEquals(1, flown)
    }

    @Test
    fun noWordSaysItIsNotOnThisPhoneForTheRulesScreens() {
        listOf(FieldScreen.DRYRUN, FieldScreen.PROFILE, FieldScreen.MAP, FieldScreen.CLEARANCE, FieldScreen.RADIO).forEach { word ->
            val said = OpenScreen.field(word, routed = true)
            assertTrue("$word: $said", said == null)
        }
        CardRequests.take()
        ScreenRequests.take(Screen.entries.toSet())
    }
}
