package app.wingtipmaps.android.ui

import app.wingtipmaps.android.navigation.Over
import app.wingtipmaps.android.navigation.generated.Screen
import app.wingtipmaps.android.strip.FieldScreen
import app.wingtipmaps.android.ui.OpenScreen.Where
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

/** Where each screen a link names opens, now the tabs are gone. */
class OpenScreenTest {
    @Test
    fun theTabsScreensOpenWhereTheirContentWent() {
        assertEquals(Where.Plan, OpenScreen.whereOf(Screen.FPL))
        assertEquals(Where.Plan, OpenScreen.whereOf(Screen.NAVLOG))
        assertEquals(Where.Search, OpenScreen.whereOf(Screen.AIRPORT))
        assertEquals(Where.Sheet(Over.Airplane), OpenScreen.whereOf(Screen.AIRPLANE))
        assertEquals(Where.Sheet(Over.Settings), OpenScreen.whereOf(Screen.SETUP))
    }

    @Test
    fun theAccountMenusPagesOpenInTheirSheets() {
        assertEquals(Where.Sheet(Over.Logbook), OpenScreen.whereOf(Screen.LOGBOOK))
        assertEquals(Where.Sheet(Over.Logbook), OpenScreen.whereOf(Screen.COACH))
        assertEquals(Where.Sheet(Over.Downloads), OpenScreen.whereOf(Screen.DOWNLOADS))
        assertEquals(Where.Sheet(Over.Passengers), OpenScreen.whereOf(Screen.PASSENGERS))
        assertEquals(Where.Sheet(Over.About), OpenScreen.whereOf(Screen.ABOUT))
    }

    @Test
    fun everyScreenHasAPlace() {
        Screen.entries.forEach { assertNotNull(OpenScreen.whereOf(it)) }
    }

    @Test
    fun aWordTypedNamesAScreen() {
        assertEquals(Screen.AIRPLANE, OpenScreen.screenOf(FieldScreen.AIRPLANE))
        assertEquals(Screen.SETUP, OpenScreen.screenOf(FieldScreen.MAP))
        assertNull(OpenScreen.screenOf(FieldScreen.FUEL))
        assertEquals("Plan a route first.", OpenScreen.field(FieldScreen.BRIEF, routed = false))
    }
}
