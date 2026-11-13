package app.wingtipmaps.android.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.R
import app.wingtipmaps.android.Session
import app.wingtipmaps.android.about.AboutScreen
import app.wingtipmaps.android.aircraft.YourAirplanesPage
import app.wingtipmaps.android.airplane.AirplaneCard
import app.wingtipmaps.android.altitude.ProfileCard
import app.wingtipmaps.android.api.AskScreenModel
import app.wingtipmaps.android.briefing.PassengerScreen
import app.wingtipmaps.android.checklist.ChecklistKind
import app.wingtipmaps.android.checklist.ChecklistScreen
import app.wingtipmaps.android.clearance.ClearancePage
import app.wingtipmaps.android.coach.CoachScreen
import app.wingtipmaps.android.flight.OwnShip
import app.wingtipmaps.android.logbook.LogbookScreen
import app.wingtipmaps.android.offline.DownloadsScreen
import app.wingtipmaps.android.plates.PlateCard
import app.wingtipmaps.android.plates.PlatePick
import app.wingtipmaps.android.route.RouteLegCard
import app.wingtipmaps.android.search.SearchControl
import app.wingtipmaps.android.ui.sheet.CardExit
import app.wingtipmaps.android.ui.sheet.CardPage

/**
 * One card or page of the sheet (SheetPage), the same wherever it was
 * opened from -- the search, the map, a list, the plan, a link -- and in
 * every layout: its bar with ← and its name where the search was, ✕ at
 * the end (CardPage). What is opened inside it goes on its stack
 * (`sheet.push`), so Back comes back to it.
 *
 * @param showPlan every card closed and the plan shown: after Fly Here,
 *   Fly This Airplane, About's demo flight or the Brief's Plan the Route.
 */
@Composable
internal fun SheetCard(
    page: SheetPage,
    sheet: SheetNav,
    plan: Plan,
    session: Session,
    ownShip: OwnShip,
    ownShipOn: Boolean,
    assistant: AskScreenModel,
    airports: AirportModel,
    search: SearchControl,
    showPlan: () -> Unit,
) {
    val exit = remember(sheet) { CardExit(back = sheet::back, close = sheet::closeAll) }
    Box(Modifier.fillMaxSize().testTag(page.testId)) { Card(page, sheet, plan, session, ownShip, ownShipOn, assistant, airports, search, showPlan, exit) }
}

@Composable
private fun Card(
    page: SheetPage,
    sheet: SheetNav,
    plan: Plan,
    session: Session,
    ownShip: OwnShip,
    ownShipOn: Boolean,
    assistant: AskScreenModel,
    airports: AirportModel,
    search: SearchControl,
    showPlan: () -> Unit,
    exit: CardExit,
) {
    when (page) {
        SheetPage.Home, SheetPage.Plan -> {}
        is SheetPage.Airport -> AirportCard(page.ident, plan, exit, onDone = showPlan, model = airports)
        is SheetPage.Airplane -> AirplaneCard(page.at, plan, exit, onFlown = showPlan, onOpen = sheet::push)
        is SheetPage.Thing -> ThingCard(page.pick, plan, exit, onRouted = showPlan)
        is SheetPage.Leg -> RouteLegCard(page.index, plan, ownShipOn, exit)
        is SheetPage.Plate -> PlateCard(PlatePick(page.ident, page.procedure), exit)
        SheetPage.MapSettings -> MapCard(exit, open = sheet::push)
        SheetPage.Brief -> BriefPage(plan, session, exit, onSetRoute = showPlan)
        SheetPage.Nearest -> NearestPage(ownShip, plan, exit, onOpen = { sheet.push(SheetPage.Airport(it)) })
        SheetPage.Ask -> Page(stringResource(R.string.ask), exit) { AskScreen(plan = plan, session = session, ownShip = ownShip, client = assistant) }
        SheetPage.You -> YouCard(session, exit, open = sheet::push)
        SheetPage.PilotDetails -> Page(stringResource(R.string.pilot_details), exit) {
            // The one search is under the cards: they close for it, and
            // Pilot Details comes back with the field picked.
            PilotDetailsScreen(session) { onPicked ->
                sheet.closeAll()
                search.pickAirport(R.string.home_airport_pick) { ident -> onPicked(ident); sheet.show(SheetPage.PilotDetails) }
            }
        }
        SheetPage.Minimums -> Page(stringResource(R.string.minimums), exit) { MinimumsScreen() }
        SheetPage.Settings -> Page(stringResource(R.string.settings), exit) { SettingsScreen(open = sheet::push) }
        SheetPage.Atc -> Page(stringResource(R.string.atc), exit) { AtcPage() }
        SheetPage.Help -> Page(stringResource(R.string.help_and_about), exit) { HelpPage(open = sheet::push) }
        SheetPage.Logbook -> LogbookScreen(exit, onCoach = { sheet.push(SheetPage.Coach) })
        SheetPage.Coach -> CoachScreen(exit)
        SheetPage.Downloads -> Page(stringResource(R.string.offline_downloads), exit) { DownloadsScreen() }
        SheetPage.Passengers -> Page(stringResource(R.string.passenger_briefing), exit) { PassengerScreen(plan) }
        SheetPage.About -> Page(stringResource(R.string.about), exit) { AboutScreen(onDemo = showPlan) }
        SheetPage.Clearance -> {
            val fix by ownShip.fix.collectAsStateWithLifecycle()
            ClearancePage(plan, fix, exit, onEntered = showPlan)
        }
        SheetPage.YourAirplanes -> YourAirplanesPage(exit)
        SheetPage.Profile -> ProfileCard(plan, exit)
        is SheetPage.Checklist -> {
            val kind = ChecklistKind.entries.firstOrNull { it.name == page.kind } ?: ChecklistKind.NORMAL
            Page(stringResource(R.string.checklists_of, page.airplane.uppercase()), exit) { ChecklistScreen(airplane = page.airplane, kind = kind) }
        }
    }
}

/** A page whose screen draws no bar of its own, under the card's bar. */
@Composable
private fun Page(title: String, exit: CardExit, content: @Composable () -> Unit) {
    CardPage(title = title, exit = exit) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) { content() }
    }
}
