package app.wingtipmaps.android.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import app.wingtipmaps.android.Links
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.R
import app.wingtipmaps.android.Session
import app.wingtipmaps.android.airplane.AirplaneProfileHost
import app.wingtipmaps.android.airplane.AskFigures
import app.wingtipmaps.android.airplane.rememberAirplaneNow
import app.wingtipmaps.android.api.AssistantClient
import app.wingtipmaps.android.api.AssistantSource
import app.wingtipmaps.android.api.AssistantTurn
import app.wingtipmaps.android.design.generated.WingtipSize
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.emergency.EmergencyHost
import app.wingtipmaps.android.emergency.EmergencyOpen
import app.wingtipmaps.android.flight.InFlight
import app.wingtipmaps.android.logbook.AutoLogbookHost
import app.wingtipmaps.android.map.MapPick
import app.wingtipmaps.android.navigation.CardRequests
import app.wingtipmaps.android.navigation.OverRequests
import app.wingtipmaps.android.navigation.ScreenRequests
import app.wingtipmaps.android.navigation.generated.Screen
import app.wingtipmaps.android.ready.ReadyToFlyHost
import app.wingtipmaps.android.ready.ReadyToFlyRow
import app.wingtipmaps.android.route.RouteLegHost
import app.wingtipmaps.android.route.RouteLegModel
import app.wingtipmaps.android.route.RouteToolbar
import app.wingtipmaps.android.route.RouteUndoSnackbar
import app.wingtipmaps.android.search.OneSearch
import app.wingtipmaps.android.search.rememberSearchControl
import app.wingtipmaps.android.share.SharedFlightHost
import app.wingtipmaps.android.share.SharedFlightModel
import app.wingtipmaps.android.strip.AnswerCard
import app.wingtipmaps.android.strip.StripLayout
import app.wingtipmaps.android.strip.StripModel
import app.wingtipmaps.android.ui.OpenScreen.Where
import app.wingtipmaps.android.ui.sheet.MapSheet
import app.wingtipmaps.android.ui.sheet.WingtipSheet
import app.wingtipmaps.android.ui.sheet.rememberMapSheetState
import app.wingtipmaps.android.welcome.WelcomeHost
import app.wingtipmaps.android.widget.NextFlightFeed
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

/**
 * The map under the docked sheet, as Apple Maps has it and the owner's
 * one search of 2026-11-09 draws it: the sheet's first row the one search
 * with its microphone and the account button (OneSearch), and under it
 * what the search shows with nothing typed, the plan, or a card
 * (SheetPages); on a tablet or an unfolded phone the same in Material's
 * list and detail panes beside the map (WidePanes), with the route's
 * floating toolbar over the map while the plan is open; on a half-folded
 * phone the map above the fold and the panel below (TabletopPanes); or
 * the strip layout
 * (Settings' Layout), with the same search. The sheet is Material's
 * standard bottom sheet (MapSheet), at its peek -- the search -- or
 * expanded; Back lowers it, then goes back a page, then leaves the app,
 * the system's predictive back showing where it goes.
 *
 * @param pending a link opened in the app (MainActivity); `onHandled`
 *   once it has been taken.
 */
@Composable
fun RootScreen(pending: StateFlow<Links.Link?>, onHandled: () -> Unit) {
    val plan: Plan = viewModel()
    val session: Session = viewModel()
    val airports: AirportModel = viewModel()
    val strip: StripModel = viewModel()
    val assistant: AssistantClient = viewModel()
    val ownShip = rememberOwnShipControl()
    val sheet = rememberMapSheetState()
    // The screen's Snackbars: a route edit's Undo (RouteUndoSnackbar).
    val snackbars = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    val resources = LocalResources.current
    val search = rememberSearchControl()
    var picked by remember { mutableStateOf<MapPick?>(null) }
    var asking by rememberSaveable { mutableStateOf(false) }
    var nearestOpen by rememberSaveable { mutableStateOf(false) }
    var briefOpen by rememberSaveable { mutableStateOf(false) }
    var source by remember { mutableStateOf<AssistantSource?>(null) }
    var raised by remember { mutableIntStateOf(0) }
    // Under way: own ship on and at flying speed (the engine's `underway`).
    val inFlight by InFlight.shared.state.collectAsStateWithLifecycle()
    val flying = ownShip.on && inFlight.underway
    val layout by rememberLayout()
    val stripLayout = layout == LayoutPreference.STRIP
    val wide = isWide()
    val fold = tabletopFold()
    val planState by plan.state.collectAsStateWithLifecycle()
    val pilot by session.pilot.collectAsStateWithLifecycle()
    val fix by ownShip.ownShip.fix.collectAsStateWithLifecycle()
    val strips by strip.state.collectAsStateWithLifecycle()
    val conversation by assistant.conversation.collectAsStateWithLifecycle()

    // The sheet's pages (SheetNav), a page shown raising the sheet from its peek.
    val raise: () -> Unit = { scope.launch { if (sheet.atPeek) sheet.expand() } }
    val pages = rememberSheetNav(wide, active = !stripLayout, airports, onShown = raise)
    val showPlan: () -> Unit = { if (stripLayout) raised++ else pages.show(SheetPage.Plan) }
    val openField: (String) -> Unit = { ident -> if (stripLayout) picked = MapPick.Airport(ident) else pages.show(SheetPage.Airport(ident)) }

    val link by pending.collectAsStateWithLifecycle()
    val shared: SharedFlightModel = viewModel()
    LaunchedEffect(link) {
        when (val opened = link) {
            null -> return@LaunchedEffect
            is Links.Place -> openField(opened.ident)
            is Links.Route -> {
                plan.plan(opened.dep, opened.dest, opened.stops)
                showPlan()
                opened.then?.let(ScreenRequests::ask)
            }
            is Links.Open -> ScreenRequests.ask(opened.screen)
            // Previewed first: the receiver's plan stays until Use This Plan.
            is Links.Shared -> shared.open(opened)
            is Links.SignIn -> {}
        }
        onHandled()
    }

    // A screen asked for by its name -- a link, a shortcut, an App
    // Function, a row or a menu -- where it lives now (OpenScreen).
    val wanted by ScreenRequests.wanted.collectAsStateWithLifecycle()
    LaunchedEffect(wanted, layout) {
        val screen = wanted ?: return@LaunchedEffect
        when (val where = OpenScreen.whereOf(screen)) {
            Where.Plan -> showPlan()
            Where.Search -> search.open()
            is Where.Sheet -> OverRequests.open(where.over)
            Where.Brief -> briefOpen = true
            Where.Nearest -> nearestOpen = true
            Where.Ask -> asking = true
            Where.Emergency -> EmergencyOpen.open(EmergencyOpen.From.LINK)
            Where.None -> {}
        }
        // The Nav Log is the plan's to scroll to; the strip has no plan page.
        val inside = screen in OpenScreen.takenInside || (screen == Screen.NAVLOG && !stripLayout)
        if (!inside) ScreenRequests.take(setOf(screen))
    }

    // A tap on the map: a field's card, a leg's sheet, or the card over the map.
    val legs: RouteLegModel = viewModel()
    val onPick: (MapPick) -> Unit = { pick ->
        when (pick) {
            is MapPick.RouteLeg -> legs.open(pick.index)
            is MapPick.Airport -> openField(pick.ident)
            else -> picked = pick
        }
    }
    val onNearest = { nearestOpen = true }
    val card by CardRequests.wanted.collectAsStateWithLifecycle()
    LaunchedEffect(card) { CardRequests.take()?.let(onPick) }

    // The one search's line and picks, the same in both layouts.
    val routed = planState.routed
    val askContext = StripModel.contextOf(planState, fix, pilot)
    val doLine: (String) -> Unit = { line -> strip.submit(line, plan, pilot, fix, assistant, askContext) { OpenScreen.field(it, routed) } }
    val picks = SearchPicks(
        plan, fix, search.addingStop, onAirport = openField, onPlan = showPlan,
        ask = { q -> strip.ask(q, assistant, askContext) },
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
                onClose = { assistant.clear(); strip.dismissAnswer() }, onSource = { source = it },
                modifier = Modifier.padding(horizontal = WingtipSpace.Lg, vertical = WingtipSpace.Sm),
            )
        }
    }
    val pagesView: @Composable (Dp, Modifier, Boolean) -> Unit = { bar, modifier, backEnabled ->
        SheetPagesHost(pages, plan, airports, bar, answer, picks::pick, search, backEnabled, modifier)
    }

    val mapView: @Composable (Dp) -> Unit = { covered -> MapPane(plan, ownShip, covered = covered, onPick = onPick, onAsk = { asking = true }, onNearest = onNearest) }
    if (stripLayout) {
        StripLayout(plan = plan, session = session, ownShip = ownShip.ownShip, flying = flying, raise = raised, searchRow = searchRow, map = {
            MapPane(plan, ownShip, covered = 0.dp, onPick = onPick, onAsk = null, onNearest = onNearest)
        })
    } else if (wide) {
        WidePanes(
            pages,
            list = {
                Column(Modifier.fillMaxSize()) {
                    searchRow(null)
                    // The list pane keeps Home or the plan; its Back waits on the card's.
                    pagesView(0.dp, Modifier.fillMaxSize(), pages.card == null)
                }
            },
            detail = { shown -> SheetPageContent(shown, pages, plan, airports, answer, picks::pick, search) },
            // The route being worked on: its floating toolbar over the map,
            // an edit's Snackbar over that.
            map = {
                Box(Modifier.fillMaxSize()) {
                    mapView(0.dp)
                    val editing = pages.planShown && planState.routed
                    Column(Modifier.align(Alignment.BottomCenter), horizontalAlignment = Alignment.CenterHorizontally) {
                        SnackbarHost(snackbars, if (editing) Modifier else Modifier.navigationBarsPadding())
                        if (editing) RouteToolbar(plan, onAddPoint = search::addStop)
                    }
                }
            },
        )
    } else if (fold != null) {
        TabletopPanes(fold, map = { Box(Modifier.fillMaxSize()) { mapView(0.dp); SnackbarHost(snackbars, Modifier.align(Alignment.BottomCenter)) } }) {
            searchRow(null)
            pagesView(0.dp, Modifier.weight(1f), true)
        }
    } else {
        // Over the navigation bar (edge to edge): its peek is the search above it.
        val navigationBar = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
        MapSheet(state = sheet, peek = SearchPeek + navigationBar, snackbars = snackbars, body = { covered -> mapView(covered) }) {
            searchRow(null)
            // Back lowers the expanded sheet first (MapSheet), then goes back a page.
            pagesView(navigationBar, Modifier.weight(1f), sheet.atPeek)
        }
    }

    if (asking) {
        WingtipSheet(title = stringResource(R.string.ask), onClose = { asking = false }, full = true) {
            AskScreen(plan = plan, session = session, ownShip = ownShip.ownShip, client = assistant)
        }
    }
    if (nearestOpen) {
        NearestSheet(
            fix = fix,
            ask = { AskFigures(rememberAirplaneNow(plan), "glide") },
            onOpen = { ident -> nearestOpen = false; openField(ident) },
            onClose = { nearestOpen = false },
        )
    }
    // The Brief by its name, with Ready to Fly at its head.
    if (briefOpen) {
        val brief: BriefModel = viewModel()
        LaunchedEffect(planState.totals, planState.planning) { brief.brief(planState) }
        BriefSheet(brief, planState, signedIn = pilot != null, onClose = { briefOpen = false }) {
            ReadyToFlyRow(plan, onSetRoute = { briefOpen = false; showPlan() })
        }
    }
    val over by OverRequests.shown.collectAsStateWithLifecycle()
    over?.let { OverSheet(it, plan, session, ownShip.ownShip, assistant, onClose = OverRequests::close, onToPlan = { OverRequests.closeAll(); showPlan() }) }
    picked?.let { pick -> MapCardSheet(pick, plan, onClose = { picked = null }, onToPlan = { picked = null; showPlan() }) }
    source?.let { shown -> SourceSheet(shown, onClose = { source = null }) }
    RouteLegHost(plan, ownShipOn = ownShip.on, model = legs)
    // The strip has no plan to edit, so no Snackbar of its own.
    if (!stripLayout) RouteUndoSnackbar(plan, snackbars)
    EmergencyHost(plan, ownShip)
    SharedFlightHost(shared, plan)
    // An airplane's card: in the sheet or the panes, else over the map.
    AirplaneProfileHost(plan, session, inSheet = !stripLayout, onFlown = showPlan)
    ReadyToFlyHost(plan, ownShipOn = ownShip.on, underway = inFlight.underway, onSetRoute = if (stripLayout) null else showPlan)
    AutoLogbookHost(plan, session)
    NextFlightFeed(plan)
    // The welcome, once per install: at its end the plan, raised a stop.
    WelcomeHost(plan) { showPlan() }
}

/** The peek: the drag handle and the search's row, as tall as the strip's. */
private val SearchPeek = WingtipSize.TapTarget * 2 + WingtipSpace.Lg + WingtipSpace.Xs
