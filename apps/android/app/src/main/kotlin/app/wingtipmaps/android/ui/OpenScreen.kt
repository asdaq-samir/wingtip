package app.wingtipmaps.android.ui

import app.wingtipmaps.android.navigation.generated.Screen
import app.wingtipmaps.android.strip.StripModel

/**
 * Where each of the app's screens lives (design/screens.json), the one
 * place Android says so: the tab it is on, the sheet over the map the
 * root opens, or the page a tab's own screen opens from ScreenRequests.
 * Each `when` is over the generated list, so a screen added there fails
 * the build here until it opens.
 */
internal object OpenScreen {
    /** The tab a screen is on; none for a sheet over every tab. */
    fun tabOf(screen: Screen): Tabs? =
        when (screen) {
            Screen.FPL, Screen.BRIEF, Screen.NAVLOG -> Tabs.FPL
            Screen.AIRPORT, Screen.NEAREST -> Tabs.AIRPORT
            Screen.AIRPLANE, Screen.CHECKLISTS -> Tabs.AIRPLANE
            Screen.SETUP, Screen.LOGBOOK, Screen.COACH, Screen.MINIMUMS, Screen.DOWNLOADS, Screen.PASSENGERS, Screen.ABOUT -> Tabs.SETUP
            Screen.ASK, Screen.EMERGENCY, Screen.SHARED -> null
        }

    /** The screens a tab's own screen opens (Setup's Logbook, the Airplane
     *  tab's checklist), left in ScreenRequests for it to take. */
    val pages: Set<Screen> = setOf(Screen.CHECKLISTS, Screen.LOGBOOK, Screen.COACH, Screen.DOWNLOADS, Screen.PASSENGERS, Screen.ABOUT)

    /** The strip's sheet over the map for a screen (the strip has no tabs);
     *  none where the root's own sheet opens it. */
    fun overOf(screen: Screen): StripModel.Over? =
        when (tabOf(screen)) {
            Tabs.AIRPLANE -> StripModel.Over.Airplane
            Tabs.SETUP -> StripModel.Over.Setup
            Tabs.FPL, Tabs.AIRPORT, null -> null
        }
}
