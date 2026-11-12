package app.wingtipmaps.android.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.semantics.hideFromAccessibility
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import app.wingtipmaps.android.Links
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.R
import app.wingtipmaps.android.Session
import app.wingtipmaps.android.about.PlanningAidNotice
import app.wingtipmaps.android.ai.rememberAiOffered
import app.wingtipmaps.android.airplane.AirplaneProfileHost
import app.wingtipmaps.android.api.AssistantClient
import app.wingtipmaps.android.api.AssistantSource
import app.wingtipmaps.android.api.AssistantTurn
import app.wingtipmaps.android.design.generated.WingtipSize
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.dryrun.DryRun
import app.wingtipmaps.android.emergency.EmergencyHost
import app.wingtipmaps.android.emergency.EmergencyOpen
import app.wingtipmaps.android.flight.InFlight
import app.wingtipmaps.android.logbook.AutoLogbookHost
import app.wingtipmaps.android.map.MapPick
import app.wingtipmaps.android.navigation.CardRequests
import app.wingtipmaps.android.navigation.ScreenRequests
import app.wingtipmaps.android.navigation.generated.Screen
import app.wingtipmaps.android.ready.ReadyToFlyHost
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
import app.wingtipmaps.android.ui.sheet.halfWindow
import app.wingtipmaps.android.ui.sheet.rememberMapSheetState
import app.wingtipmaps.android.welcome.WelcomeHost
import app.wingtipmaps.android.welcome.WelcomeModel
import app.wingtipmaps.android.widget.NextFlightFeed
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

/**
 * The map under the docked sheet, as Google Maps has it on Android and the
 * card rule of 2026-11-10 lays it out: the sheet's first row the one
 * search with its microphone and the account button (OneSearch), and
 * under it what the search shows with nothing typed, the plan a sideways
 * swipe away on the carousel's second page (SheetCarousel); a thing's
 * card or a page -- a field, an airplane, a fix, a leg, the Brief,
 * Settings -- takes the search's place with its name and ← (CardPage) and
 * fills the sheet below, on the sheet's own stack (SheetNav, SheetCard),
 * the same card from every way in. On a tablet or an unfolded phone the
 * same sits in Material's list and detail panes beside the map
 * (WidePanes), the cards in the detail pane, with the route's floating
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
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RootScreen(pending: StateFlow<Links.Link?>, onHandled: () -> Unit) {
    val plan: Plan = viewModel()
    val session: Session = viewModel()
    val airports: AirportModel = viewModel()
    val strip: StripModel = viewModel()
    val assistant: AssistantClient = viewModel()
    val dryRun: DryRun = viewModel()
    val ownShip = rememberOwnShipControl()
    val sheet = rememberMapSheetState()
    // The screen's Snackbars: a route edit's Undo (RouteUndoSnackbar).
    val snackbars = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    val resources = LocalResources.current
    val search = rememberSearchControl()
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

    // The sheet's cards and pages (SheetNav): a card opens at half, its
    // peek while it is open, and grows when pulled up; the plan raises the
    // sheet from the search's peek (the strip's by `raised`).
    val pages = rememberSheetNav(wide, airports) { page ->
        when {
            page.covers -> if (!stripLayout) scope.launch { sheet.lower() }
            stripLayout -> raised++
            else -> scope.launch { if (sheet.atPeek) sheet.expand() }
        }
    }
    val showPlan: () -> Unit = {
        if (stripLayout) {
            pages.closeAll()
            raised++
        } else {
            pages.show(SheetPage.Plan)
        }
    }
    val openField: (String) -> Unit = { ident -> pages.show(SheetPage.Airport(ident)) }
    // The carousel (SheetCarousel): a route made or opened from anywhere
    // brings the FPL page, clearing it leaves the page as it is, and the
    // one search asked for from the plan (Add a Stop) brings the Search
    // page, where its field is.
    LaunchedEffect(plan, stripLayout) {
        if (!stripLayout) plan.state.map { it.routed }.distinctUntilChanged().drop(1).filter { it }.collect { pages.toPlanPage() }
    }
    LaunchedEffect(search) { snapshotFlow { search.asked }.drop(1).collect { pages.closePlan() } }

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
            // The search is under the cards: they close for it.
            Where.Search -> {
                pages.closeAll()
                search.open()
            }
            is Where.Page -> pages.open(where.page)
            Where.Emergency -> EmergencyOpen.open(EmergencyOpen.From.LINK)
            Where.None -> {}
        }
        // The Nav Log is the plan's to scroll to; the strip has no plan page.
        val inside = screen in OpenScreen.takenInside || (screen == Screen.NAVLOG && !stripLayout)
        if (!inside) ScreenRequests.take(setOf(screen))
    }

    // A tap on the map: the thing's one card, over the search (SheetPage.of).
    val onPick: (MapPick) -> Unit = { pick -> pages.show(SheetPage.of(pick)) }
    val card by CardRequests.wanted.collectAsStateWithLifecycle()
    LaunchedEffect(card) { CardRequests.take()?.let(pages::open) }
    // The leg whose card is on top, cased in green on the map.
    val legs: RouteLegModel = viewModel()
    LaunchedEffect(pages.shown) {
        val leg = pages.shown as? SheetPage.Leg
        if (leg != null) legs.open(leg.index) else legs.close()
    }

    // The one search's line and picks, the same in every layout.
    val routed = planState.routed
    val askContext = StripModel.contextOf(planState, fix, pilot)
    val flyDryRun = {
        dryRun.start(planState)
        showPlan()
    }
    val doLine: (String) -> Unit = { line -> strip.submit(line, plan, pilot, fix, assistant, askContext) { OpenScreen.field(it, routed, flyDryRun) } }
    val picks = SearchPicks(
        plan, fix, search.addingStop, search.stopAfter, onAirport = openField, onPlan = showPlan,
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
    val cardView: @Composable (SheetPage) -> Unit = { page ->
        SheetCard(page, pages, plan, session, ownShip.ownShip, ownShip.on, assistant, airports, showPlan)
    }
    // The phone's sheet (neither the strip, the wide panes nor the fold).
    val sheetLayout = !stripLayout && !wide && fold == null
    // The search's row as measured, whatever the font scale: the sheet's
    // peek is the handle, this row and the navigation bar.
    var searchRowPx by remember { mutableIntStateOf(0) }
    val pagesView: @Composable (Modifier, Boolean, @Composable () -> Unit) -> Unit = { modifier, backEnabled, head ->
        SheetPagesHost(
            pages, backEnabled, modifier, head = head, carousel = !stripLayout,
            // The strip's field and timeline are its Home and its plan. At
            // the peek only the search shows, so what lies under it (the
            // flight's card, under the gesture bar) is kept from TalkBack.
            home = {
                if (!stripLayout) {
                    val hidden = sheetLayout && sheet.atPeek
                    Home(plan, fix, answer, picks::pick, Modifier.semantics { if (hidden) hideFromAccessibility() })
                }
            },
            plan = {
                if (planState.dep.isEmpty() && planState.dest.isEmpty() && planState.stops.isEmpty()) {
                    val sample = WelcomeModel.SAMPLE
                    PlanEmpty(onSearch = search::open, onSample = { plan.plan(sample.dep, sample.dest, sample.stops) })
                } else {
                    PlanPage(
                        plan, onClose = pages::closePlan, onField = { pages.push(SheetPage.Airport(it)) },
                        onLeg = { pages.push(SheetPage.Leg(it)) }, onFind = search::open, onAddStop = search::addStop,
                        onAddStopAfter = search::addStopAfter,
                    )
                }
            },
            card = cardView,
        )
    }

    // The sparkle only where a model can answer (AiOffered): Nano here, or
    // the server's assistant while the Claude features are on.
    val askOffered = rememberAiOffered()
    val onAsk = if (askOffered) ({ pages.show(SheetPage.Ask) }) else null
    val mapView: @Composable (Dp, Boolean) -> Unit = { covered, buttonsOnSheet ->
        MapPane(plan, ownShip, covered = covered, onPick = onPick, onAsk = onAsk, onNearest = { pages.show(SheetPage.Nearest) }, buttonsOnSheet = buttonsOnSheet)
    }
    if (stripLayout) {
        StripLayout(
            plan = plan, session = session, ownShip = ownShip.ownShip, flying = flying, raise = raised, searchRow = searchRow,
            covered = pages.covered, cards = { modifier -> pagesView(modifier, true) {} },
            map = { MapPane(plan, ownShip, covered = 0.dp, onPick = onPick, onAsk = null, onNearest = { pages.show(SheetPage.Nearest) }) },
        )
    } else if (wide) {
        WidePanes(
            pages,
            list = {
                Column(Modifier.fillMaxSize()) {
                    searchRow(null)
                    // The list pane keeps Home or the plan; its Back waits on the card's.
                    pagesView(Modifier.fillMaxSize(), pages.card == null) {}
                }
            },
            detail = cardView,
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
            pagesView(Modifier.weight(1f), true) { searchRow(null) }
        }
    } else {
        // Over the navigation bar (edge to edge): its peek is the handle and
        // the search's row as measured, above the bar, so the bar fits at
        // every font scale (the sheet audit's S-1).
        val navigationBar = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
        val searchHeight = with(LocalDensity.current) { searchRowPx.toDp() }.takeIf { it > 0.dp } ?: WingtipSize.TapTarget
        // At the peek, the carousel's dots and the first row of its page in
        // view: the search's, or the plan's bar.
        val firstRow = if (pages.planShown) TopAppBarDefaults.TopAppBarExpandedHeight else searchHeight + WingtipSpace.Sm
        val peek = if (pages.covered) halfWindow() else SheetHandle + SheetDotsHeight + firstRow + navigationBar
        // The map's buttons ride the sheet's top at the right, just above
        // the search (the owner, 2026-11-11), the position button nearest it.
        MapSheet(
            state = sheet, peek = peek, snackbars = snackbars, lowerOnBack = !pages.covered,
            onTop = { MapButtons(ownShip = ownShip.mode, onOwnShip = ownShip::tap, onAsk = onAsk, positionLast = true) },
            body = { covered -> mapView(covered, true) },
        ) {
            // A card takes the search's place, its name and ← where the
            // search was; Home and the plan carry the search's row.
            // Back closes a card at once; with none it lowers the expanded
            // sheet first (MapSheet), then goes back a page.
            pagesView(Modifier.weight(1f).padding(bottom = navigationBar), pages.covered || sheet.atPeek) {
                Box(Modifier.onSizeChanged { searchRowPx = it.height }) { searchRow(null) }
            }
        }
    }

    source?.let { shown -> SourceDialog(shown, onClose = { source = null }) }
    // The strip has no plan to edit, so no Snackbar of its own.
    if (!stripLayout) RouteUndoSnackbar(plan, snackbars)
    EmergencyHost(plan, ownShip)
    SharedFlightHost(shared, plan)
    AirplaneProfileHost(session)
    // A sign-in link, asked before it is followed.
    SignInDialog(session)
    // The planning aid's words, once at first launch (PlanningAidNotice).
    PlanningAidNotice()
    ReadyToFlyHost(plan, ownShipOn = ownShip.on, underway = inFlight.underway, onSetRoute = if (stripLayout) null else showPlan)
    AutoLogbookHost(plan, session)
    NextFlightFeed(plan)
    // The welcome, once per install: at its end the plan, raised a stop.
    WelcomeHost(plan) { showPlan() }
}

/** The stock drag handle's height: its 4-dp bar in 22 dp above and below,
 *  Material's 48-dp target (SheetDefaults.DragHandle). */
private val SheetHandle = WingtipSize.TapTarget
