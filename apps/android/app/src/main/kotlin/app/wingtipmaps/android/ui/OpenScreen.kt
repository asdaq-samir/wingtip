package app.wingtipmaps.android.ui

import app.wingtipmaps.android.navigation.Over
import app.wingtipmaps.android.navigation.OverRequests
import app.wingtipmaps.android.navigation.ScreenRequests
import app.wingtipmaps.android.navigation.generated.Screen
import app.wingtipmaps.android.strip.FieldScreen

/**
 * Where each of the app's screens lives (design/screens.json), the one
 * place Android says so, now the sheet has one search and no tabs (the
 * owner, 2026-11-09): the plan, the search itself, a sheet over the map,
 * or one of the root's own sheets (the Brief, Nearest, Ask, the emergency
 * assistant). Each `when` is over the generated list, so a screen added
 * there fails the build here until it opens.
 */
internal object OpenScreen {
    sealed interface Where {
        /** The plan, the docked sheet's main page (the strip is its plan). */
        data object Plan : Where

        /** The one search, opened for typing: what the Airport tab was. */
        data object Search : Where

        data class Sheet(val over: Over) : Where

        data object Brief : Where

        data object Nearest : Where

        data object Ask : Where

        data object Emergency : Where

        /** Opened by its own link's keys (a shared flight), not by name. */
        data object None : Where
    }

    fun whereOf(screen: Screen): Where =
        when (screen) {
            Screen.FPL, Screen.NAVLOG -> Where.Plan
            Screen.AIRPORT -> Where.Search
            Screen.BRIEF -> Where.Brief
            Screen.NEAREST -> Where.Nearest
            Screen.ASK -> Where.Ask
            Screen.EMERGENCY -> Where.Emergency
            Screen.AIRPLANE, Screen.CHECKLISTS -> Where.Sheet(Over.Airplane)
            Screen.SETUP, Screen.MINIMUMS -> Where.Sheet(Over.Settings)
            Screen.LOGBOOK, Screen.COACH -> Where.Sheet(Over.Logbook)
            Screen.DOWNLOADS -> Where.Sheet(Over.Downloads)
            Screen.PASSENGERS -> Where.Sheet(Over.Passengers)
            Screen.ABOUT -> Where.Sheet(Over.About)
            Screen.SHARED -> Where.None
        }

    /** The screens the sheet opened takes from ScreenRequests itself: the
     *  Airplane's checklist, the Logbook's Coach. */
    val takenInside: Set<Screen> = setOf(Screen.CHECKLISTS, Screen.COACH)

    /** The app's screen a word typed or said in the search names
     *  (FieldCommands), where this phone has it. */
    fun screenOf(field: FieldScreen): Screen? =
        when (field) {
            FieldScreen.AIRPLANE -> Screen.AIRPLANE
            FieldScreen.LOGBOOK -> Screen.LOGBOOK
            FieldScreen.SETUP, FieldScreen.MAP -> Screen.SETUP
            FieldScreen.BRIEF -> Screen.BRIEF
            FieldScreen.NEAREST -> Screen.NEAREST
            FieldScreen.NAVLOG -> Screen.NAVLOG
            FieldScreen.FAVORITES, FieldScreen.RECENTS -> Screen.AIRPORT
            else -> null
        }

    /**
     * A screen's word from the search, opened: what is on this phone opens
     * by its name; the clearance card over the map; the rest is said to be
     * the web's for now, where it was asked.
     */
    fun field(screen: FieldScreen, routed: Boolean): String? {
        if (screen == FieldScreen.RADIO || screen == FieldScreen.CLEARANCE) {
            OverRequests.open(Over.Clearance)
            return null
        }
        val named = screenOf(screen)
            ?: return "${screen.name.lowercase().replaceFirstChar { it.uppercase() }.replace('_', ' ')} isn't on this phone yet."
        if (named in setOf(Screen.BRIEF, Screen.NAVLOG) && !routed) return "Plan a route first."
        ScreenRequests.ask(named)
        return null
    }
}
