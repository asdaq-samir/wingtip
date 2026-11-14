package app.wingtipmaps.android.ui

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
            // TODO(claude/carousel-web): Screen.SEARCH, the carousel's Search
            // page (design/screens.json "search"), joins AIRPORT here once
            // that branch's generated screens are merged.
            Screen.AIRPORT -> Where.Search
            Screen.BRIEF -> Where.Page(SheetPage.Brief)
            Screen.NEAREST -> Where.Page(SheetPage.Nearest)
            Screen.ASK -> Where.Page(SheetPage.Ask)
            Screen.EMERGENCY -> Where.Page(SheetPage.Emergency)
            // The airplane flown now: its one card, its checklist on the card's stack.
            Screen.AIRPLANE, Screen.CHECKLISTS -> Where.Page(SheetPage.Airplane())
            Screen.SETUP -> Where.Page(SheetPage.Settings)
            Screen.MINIMUMS -> Where.Page(SheetPage.Minimums)
            Screen.LOGBOOK, Screen.COACH -> Where.Page(SheetPage.Logbook)
            Screen.FLIGHTS -> Where.Page(SheetPage.Flights)
            Screen.DOWNLOADS -> Where.Page(SheetPage.Downloads)
            Screen.PASSENGERS -> Where.Page(SheetPage.Passengers)
            Screen.ABOUT -> Where.Page(SheetPage.About)
            Screen.SHARED -> Where.None
        }

    /** The screens the page opened takes from ScreenRequests itself: the
     *  airplane card's checklist, the Logbook's Coach. */
    val takenInside: Set<Screen> = setOf(Screen.CHECKLISTS, Screen.COACH)

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
     * web's for now, where it was asked.
     */
    fun field(screen: FieldScreen, routed: Boolean, onDryRun: () -> Unit = {}): String? {
        if (screen in needRoute && !routed) return "Plan a route first."
        pageOf(screen)?.let {
            CardRequests.open(it)
            return null
        }
        if (screen == FieldScreen.DRYRUN) {
            onDryRun()
            return null
        }
        val named = screenOf(screen)
            ?: return "${screen.name.lowercase().replaceFirstChar { it.uppercase() }.replace('_', ' ')} isn't on this phone yet."
        ScreenRequests.ask(named)
        return null
    }
}
