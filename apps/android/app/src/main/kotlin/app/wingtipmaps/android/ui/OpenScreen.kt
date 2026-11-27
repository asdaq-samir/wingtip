package app.wingtipmaps.android.ui

import app.wingtipmaps.android.Extra
import app.wingtipmaps.android.Extras
import app.wingtipmaps.android.format.Format
import app.wingtipmaps.android.navigation.CardRequests
import app.wingtipmaps.android.navigation.ScreenRequests
import app.wingtipmaps.android.navigation.generated.Screen
import app.wingtipmaps.android.strip.FieldScreen

/**
 * Where each of the app's screens lives (design/screens.json), the one
 * place Android says so (the card rule, the owner, 2026-11-10): the plan,
 * the search itself, a card or a page on the sheet's stack over the
 * search (SheetPage), the emergency assistant among them. Each `when` is over the generated list, so a screen added there
 * fails the build here until it opens.
 */
internal object OpenScreen {
    sealed interface Where {
        /** The plan, the docked sheet's main page (the strip is its plan). */
        data object Plan : Where

        /** The one search, opened for typing: what the Airport tab was. */
        data object Search : Where

        /** A card or a page over the search. */
        data class Page(val page: SheetPage) : Where

        /** Opened by its own link's keys (a shared flight), not by name. */
        data object None : Where
    }

    fun whereOf(screen: Screen): Where =
        when (screen) {
            Screen.FPL -> Where.Plan
            Screen.NAVLOG -> Where.Page(SheetPage.NavLog)
            // The carousel's Search page, by its own name or the old Airport tab's.
            Screen.SEARCH, Screen.AIRPORT -> Where.Search
            // The Brief, and its own tools full screen over it, which the
            // Brief opens as it takes them (BriefPage).
            Screen.BRIEF, Screen.SCRATCHPAD, Screen.BALANCE -> Where.Page(SheetPage.Brief)
            Screen.NEAREST -> Where.Page(SheetPage.Nearest)
            Screen.ASK -> Where.Page(SheetPage.Ask)
            Screen.EMERGENCY -> Where.Page(SheetPage.Emergency)
            // The airplane flown now: its one card, its checklist on the card's stack.
            Screen.AIRPLANE, Screen.CHECKLISTS -> Where.Page(SheetPage.Airplane())
            Screen.SETUP -> Where.Page(SheetPage.Settings)
            Screen.MINIMUMS -> Where.Page(SheetPage.Minimums)
            Screen.DOCUMENTS -> Where.Page(SheetPage.Documents)
            Screen.LOGBOOK, Screen.COACH -> Where.Page(SheetPage.Logbook)
            Screen.FLIGHTS -> Where.Page(SheetPage.Flights)
            Screen.DOWNLOADS -> Where.Page(SheetPage.Downloads)
            Screen.PASSENGERS -> Where.Page(SheetPage.Passengers)
            Screen.ABOUT -> Where.Page(SheetPage.About)
            Screen.SHARED -> Where.None
        }

    /** The screens the page opened takes from ScreenRequests itself: the
     *  airplane card's checklist, the Logbook's Coach, the Brief's tools. */
    val takenInside: Set<Screen> = setOf(Screen.CHECKLISTS, Screen.COACH, Screen.SCRATCHPAD, Screen.BALANCE)

    /** The app's screen a word typed or said in the search names
     *  (FieldCommands), where this phone has it; "profile" is a card (pageOf). */
    fun screenOf(field: FieldScreen): Screen? =
        when (field) {
            FieldScreen.AIRPLANE -> Screen.AIRPLANE
            FieldScreen.LOGBOOK -> Screen.LOGBOOK
            FieldScreen.SETUP -> Screen.SETUP
            FieldScreen.BRIEF -> Screen.BRIEF
            FieldScreen.NEAREST -> Screen.NEAREST
            FieldScreen.NAVLOG -> Screen.NAVLOG
            FieldScreen.FAVORITES, FieldScreen.RECENTS -> Screen.AIRPORT
            else -> null
        }

    /** The cards a word opens that are not screens of design/screens.json. */
    fun pageOf(field: FieldScreen): SheetPage? =
        when (field) {
            FieldScreen.RADIO, FieldScreen.CLEARANCE -> SheetPage.Clearance
            FieldScreen.MAP -> SheetPage.MapSettings
            FieldScreen.PROFILE -> SheetPage.Profile
            else -> null
        }

    /** The words that need a route to open. */
    private val needRoute = setOf(FieldScreen.BRIEF, FieldScreen.NAVLOG, FieldScreen.PROFILE, FieldScreen.DRYRUN)

    /**
     * A screen's word from the search, opened: what is on this phone opens
     * by its name; the clearance card and the map's settings as cards; the
     * dry run flown over the map (`onDryRun`); the rest is said to be the
     * web's for now, where it was asked. The radio's clearance card opens
     * only while Settings' Extras has the ATC Copilot on (`atc`).
     */
    fun field(screen: FieldScreen, routed: Boolean, atc: Boolean = Extras.now(Extra.ATC_COPILOT), onDryRun: () -> Unit = {}): String? {
        if (screen in needRoute && !routed) return "Plan a route first."
        pageOf(screen)?.let {
            if (it == SheetPage.Clearance && !atc) return "Turn on ATC Copilot in Settings, under Extras."
            CardRequests.open(it)
            return null
        }
        if (screen == FieldScreen.DRYRUN) {
            onDryRun()
            return null
        }
        val named = screenOf(screen)
            ?: return "${Format.capital(screen.name.lowercase()).replace('_', ' ')} is not on this phone yet."
        ScreenRequests.ask(named)
        return null
    }
}
