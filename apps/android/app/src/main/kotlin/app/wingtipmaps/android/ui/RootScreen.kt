package app.wingtipmaps.android.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.semantics.hideFromAccessibility
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation3.scene.SceneStrategy
import app.wingtipmaps.android.Links
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.R
import app.wingtipmaps.android.Session
import app.wingtipmaps.android.airplane.AirplaneProfileHost
import app.wingtipmaps.android.api.AskScreenModel
import app.wingtipmaps.android.api.AssistantTurn
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.dryrun.DryRun
import app.wingtipmaps.android.flight.FlightModel
import app.wingtipmaps.android.logbook.AutoLogbookHost
import app.wingtipmaps.android.map.MapPick
import app.wingtipmaps.android.ready.ReadyToFlyHost
import app.wingtipmaps.android.route.RouteHome
import app.wingtipmaps.android.route.RouteUndoSnackbar
import app.wingtipmaps.android.route.hasPoints
import app.wingtipmaps.android.search.OneSearch
import app.wingtipmaps.android.search.rememberSearchControl
import app.wingtipmaps.android.share.SharedFlightHost
import app.wingtipmaps.android.share.SharedFlightModel
import app.wingtipmaps.android.strip.AnswerCard
import app.wingtipmaps.android.strip.StripLayout
import app.wingtipmaps.android.strip.StripModel
import app.wingtipmaps.android.ui.sheet.MapSheet
import app.wingtipmaps.android.ui.sheet.rememberMapSheetState
import app.wingtipmaps.android.widget.NextFlightFeed
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

/**
 * The map under the docked sheet, as Google Maps has it on Android and the
 * card rule of 2026-11-10 lays it out: the sheet's first row the one
 * search with its microphone and the avatar, which opens You (OneSearch),
 * and under it what the search shows with nothing typed, the plan on the
 * carousel's second page, turned to by the round button in the map's
 * left column (SheetSideButtons); a thing's card or a page -- a field, an
 * airplane, a fix, a leg, the Brief, You, Settings, the Map card -- takes the search's place with its name and ← (CardPage) and
 * fills the sheet below, on the sheet's own stack (MapViewModel, drawn by
 * Navigation 3, SheetPagesHost; SheetCard), the same card from every way
 * in. On a tablet or an unfolded phone the same stack sits in a panel
 * beside the map, and from expanded width a thing's card in a pane of its
 * own at the end, as the iPad's inspector (WidePanes, WideMap); on a half-folded phone the
 * map above the fold and the panel below (TabletopPanes); or the strip
 * layout (Settings' Layout), whose sheet shows the same cards. The sheet
 * is Material's standard bottom sheet (MapSheet), at its peek or
 * expanded; Back closes the top card first, then the next, and only with
 * no card open lowers the sheet, then leaves the app, the system's
 * predictive back showing where it goes. The emergency assistant is a
 * card too, opened at the sheet's full height (EmergencyCard).
 *
 * @param pending a link opened in the app (MainActivity); `onHandled`
 *   once it has been taken; `onLink` for one dropped on the window, to be
 *   opened as one sent to the app is.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RootScreen(pending: StateFlow<Links.Link?>, onHandled: () -> Unit, onLink: (Links.Link) -> Unit = {}) {
    val plan: Plan = hiltViewModel()
    val session: Session = hiltViewModel()
    val airports: AirportModel = hiltViewModel()
    val strip: StripModel = hiltViewModel()
    val assistant: AskScreenModel = hiltViewModel()
    val dryRun: DryRun = hiltViewModel()
    val map: MapViewModel = hiltViewModel()
    val ownShip = rememberOwnShipControl()
    val sheet = rememberMapSheetState(canHide = { map.top.swipeCloses })
    // The screen's Snackbars: a route edit's Undo (RouteUndoSnackbar).
    val snackbars = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    val resources = LocalResources.current
    val search = rememberSearchControl()
    // Under way: own ship on and at flying speed (the engine's `underway`), told as it changes.
    val underway by hiltViewModel<FlightModel>().underway.collectAsStateWithLifecycle()
    val flying = ownShip.on && underway
    val layout by rememberLayout()
    val stripLayout = layout == LayoutPreference.STRIP
    val wide = isWide()
    val fold = tabletopFold()
    val planState by plan.state.collectAsStateWithLifecycle()
    val pilot by session.pilot.collectAsStateWithLifecycle()
    val fix = ownShip.ownShip.fix
    val strips by strip.state.collectAsStateWithLifecycle()
    val conversation by assistant.conversation.collectAsStateWithLifecycle()

    // The sheet's cards and pages (SheetNav): a card opens at half, its
    // peek while it is open, and grows when pulled up; the plan raises the
    // sheet from the search's peek (the strip's by `map.raised`).
    val pages = rememberSheetNav(map, airports) { page ->
        when {
            // Emergency alone opens at the sheet's full height.
            page.covers -> if (!stripLayout) scope.launch { if (page.opensFull) sheet.expand() else sheet.lower() }
            stripLayout -> map.raise()
            else -> scope.launch { if (sheet.atPeek) sheet.expand() }
        }
    }
    val showPlan: () -> Unit = {
        if (stripLayout) {
            pages.closeAll()
            map.raise()
        } else {
            pages.show(SheetPage.Plan)
        }
    }
    val openField: (String) -> Unit = { ident -> pages.show(SheetPage.Airport(ident)) }
    val shared: SharedFlightModel = hiltViewModel()
    RootRequests(pending, onHandled, plan, pages, search, stripLayout, layout, showPlan, shared)

    // A tap on the map: the thing's one card, over the search (SheetPage.of).
    val onPick: (MapPick) -> Unit = { pick -> pages.show(SheetPage.of(pick)) }

    // The one search's line and picks, the same in every layout.
    val routed = planState.routed
    val askContext = { StripModel.contextOf(planState, fix.value, pilot) }
    val flyDryRun = {
        dryRun.start(planState)
        showPlan()
    }
    val doLine: (String) -> Unit = { line -> strip.submit(line, plan, pilot, fix.value, assistant, askContext()) { OpenScreen.field(it, routed, onDryRun = flyDryRun) } }
    val picks = SearchPicks(
        plan, fix::value, search.addingStop, search.stopAfter, search.picking, onAirport = openField, onPlan = showPlan,
        ask = { q -> strip.ask(q, assistant, askContext()) },
        say = strip::say, noRoute = { ident -> resources.getString(R.string.plan_a_route_first, ident) },
    )
    val searchRow: @Composable (String?) -> Unit = { problem ->
        OneSearch(
            plan, ownShip.ownShip, pilot, flying, problem ?: strips.problem, search,
            onLine = doLine, onPick = picks::pick, onProblem = strip::say,
        )
    }
    val answer: @Composable () -> Unit = {
        val turn = conversation.turns.lastOrNull()?.takeIf { it.role == AssistantTurn.Role.ASSISTANT }
        if (turn != null && strips.answerShown) {
            AnswerCard(
                turn = turn, answering = conversation.answering, status = conversation.status, onStop = assistant::cancel,
                onClose = { assistant.clear(); strip.dismissAnswer() }, onSource = { map.source = it },
                modifier = Modifier.padding(horizontal = WingtipSpace.Lg, vertical = WingtipSpace.Sm),
            )
        }
    }
    val cardView: @Composable (SheetPage) -> Unit = { page ->
        SheetCard(page, pages, plan, session, ownShip, assistant, airports, search, showPlan)
    }
    // The phone's sheet (neither the strip, the wide panes nor the fold).
    // A half-folded foldable is wide too: the fold is asked first, so it
    // stands as a laptop does, the map above the fold (TabletopPanes).
    val sheetLayout = !stripLayout && !wide && fold == null
    // The sheet's pages, all of the stack or the part a wide window's pane
    // draws (WidePanes, PaneRoom).
    val pagesView: @Composable (Modifier, Boolean, SceneStrategy<SheetPage>?, List<SheetPage>?, @Composable () -> Unit) -> Unit = { modifier, backEnabled, scenes, part, head ->
        SheetPagesHost(
            pages, backEnabled, modifier, head = head, carousel = !stripLayout, scenes = scenes, stack = part ?: pages.stack,
            // The strip's field and timeline are its Home and its plan. At
            // the peek only the search shows, so what lies under it (the
            // flight's card, under the gesture bar) is kept from TalkBack.
            home = {
                if (!stripLayout) {
                    val hidden = sheetLayout && sheet.atPeek
                    Home(plan, ownShip.ownShip, answer, picks::pick, Modifier.semantics { if (hidden) hideFromAccessibility() })
                }
            },
            // The FPL page, with a route or none: with none its ✕ goes back
            // one level, to the Search page (the web's empty box's Close),
            // or to the card of the field a cleared route was flown to,
            // and its stops' rows ask the one search where from and to;
            // no "Plan a Flight" of its own (the owner, 2026-11-11).
            plan = {
                PlanPage(
                    plan, onClose = { pages.closePlan(); RouteHome.shared.backTo(planState.hasPoints)?.let(openField) }, onField = { pages.push(SheetPage.Airport(it)) },
                    onNavLog = { pages.show(SheetPage.NavLog) }, onFind = { search.askRouteEnd(plan) }, onAddStop = search::addStop, onAddStopAfter = search::addStopAfter,
                    onPlate = { ident, procedure -> pages.push(SheetPage.Plate(ident, procedure)) },
                )
            },
            card = cardView,
        )
    }

    // The map's buttons' taps, each a card on the sheet (MapActions).
    val actions = rememberMapActions(pages)
    val mapView: @Composable (Dp, Boolean) -> Unit = { covered, buttonsOnSheet ->
        MapPane(plan, ownShip, covered = covered, onPick = onPick, actions = actions, buttonsOnSheet = buttonsOnSheet)
    }
    // A link or words dropped on the window (WindowDrop).
    Box(Modifier.fillMaxSize().then(rememberSheetDrop(pages, search, onLink))) {
        if (stripLayout) {
            StripLayout(
                plan = plan, session = session, ownShip = ownShip.ownShip, flying = flying, raise = map.raised, searchRow = searchRow,
                covered = pages.covered, cards = { modifier -> pagesView(modifier, true, null, null) {} },
                map = { MapPane(plan, ownShip, covered = 0.dp, onPick = onPick, actions = actions.copy(onAsk = null)) },
            )
        } else if (fold != null) {
            TabletopPanes(fold, map = { Box(Modifier.fillMaxSize()) { mapView(0.dp, false); SnackbarHost(snackbars, Modifier.align(Alignment.BottomCenter)) } }) {
                // A card takes the search's place, as on the phone's sheet.
                pagesView(Modifier.weight(1f), true, null, null) { searchRow(null) }
            }
        } else if (wide) {
            WidePanes(
                sheet = pages, searchAsks = search.asked,
                pages = { modifier, part, backEnabled, scenes -> pagesView(modifier.fillMaxSize(), backEnabled, scenes, part) { searchRow(null) } },
                map = { WideMap(pages, plan, planState, snackbars, onAddPoint = search::addStop) { mapView(0.dp, false) } },
            )
        } else {
            PhoneSheetLayout(
                sheet, snackbars, pages, ownShip, actions, plan, search, map = { covered -> mapView(covered, true) }, searchRow = { searchRow(null) },
                pages = { modifier, backEnabled, head -> pagesView(modifier, backEnabled, null, null, head) },
            )
        }
    }

    map.source?.let { shown -> SourceDialog(shown, onClose = { map.source = null }) }
    // The strip has no plan to edit, so no Snackbar of its own.
    if (!stripLayout) RouteUndoSnackbar(plan, snackbars)
    SharedFlightHost(shared, plan)
    AirplaneProfileHost(session)
    // A sign-in link, asked before it is followed.
    SignInDialog(session)
    ReadyToFlyHost(plan, ownShipOn = ownShip.on, underway = underway, onSetRoute = if (stripLayout) null else showPlan)
    AutoLogbookHost(plan, session)
    NextFlightFeed(plan)
}
