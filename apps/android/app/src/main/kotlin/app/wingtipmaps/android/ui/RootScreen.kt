package app.wingtipmaps.android.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBarsPadding
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
import androidx.compose.ui.platform.LocalContext
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
import app.wingtipmaps.android.about.PlanningAidNotice
import app.wingtipmaps.android.ai.rememberAiOffered
import app.wingtipmaps.android.airplane.AirplaneProfileHost
import app.wingtipmaps.android.api.AskScreenModel
import app.wingtipmaps.android.api.AssistantTurn
import app.wingtipmaps.android.atc.CommsAssist
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.dryrun.DryRun
import app.wingtipmaps.android.emergency.EmergencyHost
import app.wingtipmaps.android.flight.FlightModel
import app.wingtipmaps.android.logbook.AutoLogbookHost
import app.wingtipmaps.android.map.MapPick
import app.wingtipmaps.android.ready.ReadyToFlyHost
import app.wingtipmaps.android.route.RouteHome
import app.wingtipmaps.android.route.RouteToolbar
import app.wingtipmaps.android.route.RouteUndoSnackbar
import app.wingtipmaps.android.route.hasPoints
import app.wingtipmaps.android.search.OneSearch
import app.wingtipmaps.android.search.SearchControl
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
 * in. On a tablet or an unfolded phone the same stack sits in Material's
 * list-detail scene beside the map (WidePanes), the cards in the detail
 * pane, with the route's floating
 * toolbar over the map while the plan is open; on a half-folded phone the
 * map above the fold and the panel below (TabletopPanes); or the strip
 * layout (Settings' Layout), whose sheet shows the same cards. The sheet
 * is Material's standard bottom sheet (MapSheet), at its peek or
 * expanded; Back closes the top card first, then the next, and only with
 * no card open lowers the sheet, then leaves the app, the system's
 * predictive back showing where it goes. Only the emergency assistant is
 * full screen (EmergencyHost).
 *
 * @param pending a link opened in the app (MainActivity); `onHandled`
 *   once it has been taken.
 */
/**
 * An end of the route not given yet, asked of the one search (the web's
 * 688305a42: half a route asks for its departure where it can): picked,
 * the route is planned with it; with neither end, the search opens.
 */
private fun askRouteEnd(plan: Plan, search: SearchControl) {
    val s = plan.state.value
    when {
        s.dep.isEmpty() && s.dest.isNotEmpty() -> search.pickAirport(R.string.where_from) { plan.plan(it, s.dest, s.stops) }
        s.dest.isEmpty() && s.dep.isNotEmpty() -> search.pickAirport(R.string.where_to) { plan.plan(s.dep, it, s.stops) }
        else -> search.open()
    }
}

/** Comms Assist's radio button's tap where Settings has it on, else none. */
@Composable
private fun rememberCommsAssist(open: () -> Unit): (() -> Unit)? {
    val context = LocalContext.current
    val on by remember(context) { CommsAssist.of(context) }.on.collectAsStateWithLifecycle()
    return if (on) open else null
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RootScreen(pending: StateFlow<Links.Link?>, onHandled: () -> Unit) {
    val plan: Plan = hiltViewModel()
    val session: Session = hiltViewModel()
    val airports: AirportModel = hiltViewModel()
    val strip: StripModel = hiltViewModel()
    val assistant: AskScreenModel = hiltViewModel()
    val dryRun: DryRun = hiltViewModel()
    val map: MapViewModel = hiltViewModel()
    val ownShip = rememberOwnShipControl()
    val sheet = rememberMapSheetState()
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
            page.covers -> if (!stripLayout) scope.launch { sheet.lower() }
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
    val doLine: (String) -> Unit = { line -> strip.submit(line, plan, pilot, fix.value, assistant, askContext()) { OpenScreen.field(it, routed, flyDryRun) } }
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
        SheetCard(page, pages, plan, session, ownShip.ownShip, ownShip.on, assistant, airports, search, showPlan)
    }
    // The phone's sheet (neither the strip, the wide panes nor the fold).
    val sheetLayout = !stripLayout && !wide && fold == null
    val pagesView: @Composable (Modifier, Boolean, SceneStrategy<SheetPage>?, @Composable () -> Unit) -> Unit = { modifier, backEnabled, scenes, head ->
        SheetPagesHost(
            pages, backEnabled, modifier, head = head, carousel = !stripLayout, scenes = scenes,
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
                    onLeg = { pages.push(SheetPage.Leg(it)) }, onFind = { askRouteEnd(plan, search) }, onAddStop = search::addStop,
                    onAddStopAfter = search::addStopAfter,
                )
            },
            card = cardView,
        )
    }

    // The sparkle only where a model can answer (AiOffered): Nano here.
    val askOffered = rememberAiOffered()
    val onAsk = if (askOffered) ({ pages.show(SheetPage.Ask) }) else null
    // The map's Layers button opens the Map card; the radio's, Comms
    // Assist, the clearance card, only while Settings has it on.
    val onLayers = { pages.show(SheetPage.MapSettings) }
    val onRadio = rememberCommsAssist { pages.show(SheetPage.Clearance) }
    val mapView: @Composable (Dp, Boolean) -> Unit = { covered, buttonsOnSheet ->
        MapPane(
            plan, ownShip, covered = covered, onPick = onPick, onAsk = onAsk, onNearest = { pages.show(SheetPage.Nearest) },
            onLayers = onLayers, onRadio = onRadio, buttonsOnSheet = buttonsOnSheet,
        )
    }
    if (stripLayout) {
        StripLayout(
            plan = plan, session = session, ownShip = ownShip.ownShip, flying = flying, raise = map.raised, searchRow = searchRow,
            covered = pages.covered, cards = { modifier -> pagesView(modifier, true, null) {} },
            map = {
                MapPane(plan, ownShip, covered = 0.dp, onPick = onPick, onAsk = null, onNearest = { pages.show(SheetPage.Nearest) }, onLayers = onLayers, onRadio = onRadio)
            },
        )
    } else if (wide) {
        WidePanes(
            // The list pane keeps the search over Home or the plan, the
            // detail pane the cards.
            pages = { modifier, scenes -> pagesView(modifier.fillMaxSize(), true, scenes) { searchRow(null) } },
            // The route being worked on: its floating toolbar over the map,
            // an edit's Snackbar over that.
            map = {
                Box(Modifier.fillMaxSize()) {
                    mapView(0.dp, false)
                    val editing = pages.planShown && planState.routed
                    Column(Modifier.align(Alignment.BottomCenter), horizontalAlignment = Alignment.CenterHorizontally) {
                        SnackbarHost(snackbars, if (editing) Modifier else Modifier.navigationBarsPadding())
                        if (editing) RouteToolbar(plan, onAddPoint = search::addStop)
                    }
                }
            },
        )
    } else if (fold != null) {
        TabletopPanes(fold, map = { Box(Modifier.fillMaxSize()) { mapView(0.dp, false); SnackbarHost(snackbars, Modifier.align(Alignment.BottomCenter)) } }) {
            // A card takes the search's place, as on the phone's sheet.
            pagesView(Modifier.weight(1f), true, null) { searchRow(null) }
        }
    } else {
        PhoneSheetLayout(
            sheet, snackbars, pages, ownShip, onAsk, onLayers, onRadio, plan, search, map = { covered -> mapView(covered, true) }, searchRow = { searchRow(null) },
            pages = { modifier, backEnabled, head -> pagesView(modifier, backEnabled, null, head) },
        )
    }

    map.source?.let { shown -> SourceDialog(shown, onClose = { map.source = null }) }
    // The strip has no plan to edit, so no Snackbar of its own.
    if (!stripLayout) RouteUndoSnackbar(plan, snackbars)
    EmergencyHost(plan, ownShip)
    SharedFlightHost(shared, plan)
    AirplaneProfileHost(session)
    // A sign-in link, asked before it is followed.
    SignInDialog(session)
    // The planning aid's words, once at first launch (PlanningAidNotice).
    PlanningAidNotice()
    ReadyToFlyHost(plan, ownShipOn = ownShip.on, underway = underway, onSetRoute = if (stripLayout) null else showPlan)
    AutoLogbookHost(plan, session)
    NextFlightFeed(plan)
}
