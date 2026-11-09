package app.wingtipmaps.android.ui

import androidx.annotation.StringRes
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.PrimaryTabRow
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
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
import app.wingtipmaps.android.design.SharedAxisContent
import app.wingtipmaps.android.design.generated.WingtipSize
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.design.predictiveBack
import app.wingtipmaps.android.design.rememberPredictiveBack
import app.wingtipmaps.android.emergency.EmergencyHost
import app.wingtipmaps.android.emergency.EmergencyOpen
import app.wingtipmaps.android.flight.InFlight
import app.wingtipmaps.android.logbook.AutoLogbookHost
import app.wingtipmaps.android.map.MapPick
import app.wingtipmaps.android.navigation.CardRequests
import app.wingtipmaps.android.navigation.ScreenRequests
import app.wingtipmaps.android.navigation.generated.Screen
import app.wingtipmaps.android.ready.ReadyToFlyHost
import app.wingtipmaps.android.route.RouteLegHost
import app.wingtipmaps.android.route.RouteLegModel
import app.wingtipmaps.android.share.SharedFlightHost
import app.wingtipmaps.android.share.SharedFlightModel
import app.wingtipmaps.android.strip.StripLayout
import app.wingtipmaps.android.strip.StripModel
import app.wingtipmaps.android.ui.sheet.DockedSheet
import app.wingtipmaps.android.ui.sheet.SheetStop
import app.wingtipmaps.android.ui.sheet.WingtipSheet
import app.wingtipmaps.android.ui.sheet.rememberDockedSheetState
import app.wingtipmaps.android.welcome.WelcomeHost
import app.wingtipmaps.android.widget.NextFlightFeed
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

/** The sheet's four tabs, as the web app and the iOS app have them
 *  (decision 0013), "Airplane" the FAA's word (decision 0020). */
enum class Tabs(@StringRes val title: Int) {
    FPL(R.string.tab_fpl), AIRPORT(R.string.tab_airport), AIRPLANE(R.string.tab_airplane), SETUP(R.string.tab_setup)
}

/**
 * The map under the docked sheet holding the four tabs, as Apple Maps
 * has it and the web app imitates it, or the strip layout (Setup's
 * Layout). The sheet stops at the pill -- the figures' line and the
 * tabs -- half and full; Back lowers it a stop at a time, then closes
 * the Airport tab's card, then leaves the app, the system's predictive
 * back showing where it goes.
 *
 * @param pending a link opened in the app, for the tab it is for
 *   (MainActivity); `onHandled` once it has been taken.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RootScreen(pending: StateFlow<Links.Link?>, onHandled: () -> Unit) {
    val plan: Plan = viewModel()
    val session: Session = viewModel()
    val airports: AirportModel = viewModel()
    val airportState by airports.state.collectAsStateWithLifecycle()
    val ownShip = rememberOwnShipControl()
    var tab by rememberSaveable { mutableIntStateOf(0) }
    var airport by rememberSaveable { mutableStateOf("") }
    val sheet = rememberDockedSheetState()
    val scope = rememberCoroutineScope()
    // What a tap on the map picked, its card over the map (MapCardSheet).
    var picked by remember { mutableStateOf<MapPick?>(null) }
    var asking by rememberSaveable { mutableStateOf(false) }
    var nearestOpen by rememberSaveable { mutableStateOf(false) }
    // Bumped when the welcome ends into a flight, for the strip's sheet.
    var raised by remember { mutableIntStateOf(0) }
    // Under way: own ship on and at flying speed (the engine's
    // `underway`), when the strip turns to the airplane.
    val inFlight by InFlight.shared.state.collectAsStateWithLifecycle()
    val flying = ownShip.on && inFlight.underway
    val layout by rememberLayout()

    val link by pending.collectAsStateWithLifecycle()
    val shared: SharedFlightModel = viewModel()
    LaunchedEffect(link) {
        when (val opened = link) {
            null -> return@LaunchedEffect
            is Links.Place -> {
                airport = opened.ident
                tab = Tabs.AIRPORT.ordinal
            }
            is Links.Route -> {
                plan.plan(opened.dep, opened.dest, opened.stops)
                tab = Tabs.FPL.ordinal
                opened.then?.let(ScreenRequests::ask)
            }
            is Links.Open -> ScreenRequests.ask(opened.screen)
            // Previewed first: the receiver's plan stays until Use This Plan.
            is Links.Shared -> shared.open(opened)
            is Links.SignIn -> {}
        }
        onHandled()
    }

    // A screen asked for by its name -- a link, a figure tapped -- on its
    // tab, or over the map; a tab's own page left for that tab (OpenScreen).
    val strip: StripModel = viewModel()
    var briefOpen by rememberSaveable { mutableStateOf(false) }
    val wanted by ScreenRequests.wanted.collectAsStateWithLifecycle()
    LaunchedEffect(wanted, layout) {
        val screen = wanted ?: return@LaunchedEffect
        if (layout == LayoutPreference.STRIP) {
            OpenScreen.overOf(screen)?.let(strip::open)
        } else {
            OpenScreen.tabOf(screen)?.let { tab = it.ordinal }
        }
        if (screen in OpenScreen.pages) return@LaunchedEffect
        ScreenRequests.take(setOf(screen))
        when (screen) {
            Screen.BRIEF -> briefOpen = true
            Screen.ASK -> asking = true
            Screen.NEAREST -> nearestOpen = true
            Screen.EMERGENCY -> EmergencyOpen.open(EmergencyOpen.From.LINK)
            else -> if (sheet.stop == SheetStop.PILL) sheet.moveTo(SheetStop.HALF)
        }
    }

    // A tapped field opens in the Airport tab, the sheet raised a stop to
    // show it, as the web's map opens a field's card; under the strip,
    // which has no tab, and for everything else, its card over the map.
    val legs: RouteLegModel = viewModel()
    val onPick: (MapPick) -> Unit = { pick ->
        if (pick is MapPick.RouteLeg) {
            // A leg of the route: its Route Leg sheet, the leg cased green.
            legs.open(pick.index)
        } else if (pick is MapPick.Airport && layout != LayoutPreference.STRIP) {
            airport = pick.ident
            tab = Tabs.AIRPORT.ordinal
            scope.launch { if (sheet.stop == SheetStop.PILL) sheet.moveTo(SheetStop.HALF) }
        } else {
            picked = pick
        }
    }
    val onNearest = { nearestOpen = true }
    // A card asked for from a list or an alert opens as a tap on the map
    // would open it (CardRequests).
    val card by CardRequests.wanted.collectAsStateWithLifecycle()
    LaunchedEffect(card) { CardRequests.take()?.let(onPick) }

    if (layout == LayoutPreference.STRIP) {
        StripLayout(plan = plan, session = session, ownShip = ownShip.ownShip, flying = flying, raise = raised, map = {
            MapPane(plan, ownShip, covered = 0.dp, onPick = onPick, onAsk = null, onNearest = onNearest)
        })
    } else {
        // At the pill with the Airport tab's card open, Back closes the
        // card (the sheet's own Back, lowering it, comes first), the card
        // drawn back with the system's predictive gesture.
        val cardBack = rememberPredictiveBack(enabled = sheet.stop == SheetStop.PILL && tab == Tabs.AIRPORT.ordinal && airportState.place != null) {
            airports.close()
            airport = ""
        }
        // The sheet sits over the navigation bar (edge to edge): its pill
        // is the figures and the tabs above the bar.
        val navigationBar = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
        val peek = TabsPeek + navigationBar
        DockedSheet(state = sheet, peek = peek, body = { covered ->
            MapPane(plan, ownShip, covered = covered, onPick = onPick, onAsk = { asking = true }, onNearest = onNearest)
        }) {
            FiguresStrip(plan.state.collectAsStateWithLifecycle().value)
            PrimaryTabRow(selectedTabIndex = tab) {
                Tabs.entries.forEachIndexed { i, t ->
                    Tab(selected = tab == i, onClick = { tab = i }, text = { Text(stringResource(t.title)) })
                }
            }
            // A tab gives way to the next along the row's axis (Material's
            // shared axis; a cross-fade under Reduce Motion).
            SharedAxisContent(tab, Modifier.weight(1f).fillMaxWidth()) { shown ->
                Box(Modifier.fillMaxSize().then(if (Tabs.entries[shown] == Tabs.AIRPORT) Modifier.predictiveBack(cardBack) else Modifier)) {
                    when (Tabs.entries[shown]) {
                        Tabs.FPL -> FPLScreen(plan)
                        Tabs.AIRPORT -> AirportScreen(airport, plan = plan, model = airports)
                        Tabs.AIRPLANE -> AirplaneScreen(plan)
                        Tabs.SETUP -> SetupScreen(session, onToMap = {
                            // The demo flight's route in sight: the FPL tab, the
                            // sheet lowered to its pill over the map.
                            tab = Tabs.FPL.ordinal
                            scope.launch { sheet.moveTo(SheetStop.PILL) }
                        })
                    }
                }
            }
            Spacer(Modifier.height(navigationBar))
        }
    }

    // Ask: a question about the flight put to the assistant, from the
    // sparkle; the whole height, since a conversation wants the room.
    if (asking) {
        WingtipSheet(title = stringResource(R.string.ask), onClose = { asking = false }, full = true) {
            AskScreen(plan = plan, session = session, ownShip = ownShip.ownShip)
        }
    }
    // Nearest, from the instruments bar: a field tapped opens its card in
    // the Airport tab.
    if (nearestOpen) {
        val fix by ownShip.ownShip.fix.collectAsStateWithLifecycle()
        NearestSheet(
            fix = fix,
            ask = { AskFigures(rememberAirplaneNow(plan), "glide") },
            onOpen = { ident ->
                airport = ident
                tab = Tabs.AIRPORT.ordinal
                nearestOpen = false
            },
            onClose = { nearestOpen = false },
        )
    }
    // The Brief by its name, in the tabs as the strip has it (BriefSheet).
    if (briefOpen) {
        val brief: BriefModel = viewModel()
        val planState by plan.state.collectAsStateWithLifecycle()
        val pilot by session.pilot.collectAsStateWithLifecycle()
        LaunchedEffect(planState.totals, planState.planning) { brief.brief(planState) }
        BriefSheet(brief, planState, signedIn = pilot != null, onClose = { briefOpen = false })
    }
    picked?.let { pick -> MapCardSheet(pick, plan, onClose = { picked = null }) }
    RouteLegHost(plan, ownShipOn = ownShip.on, model = legs)
    EmergencyHost(plan, ownShip)
    // A flight another pilot sent, previewed over the map (a link).
    SharedFlightHost(shared, plan)
    // An airplane's profile, over whatever it was opened from.
    AirplaneProfileHost(plan, session)
    // Ready to fly once a flight, as own ship comes on on the ground with
    // something to fix; a route is typed in FPL (the strip's field has no
    // tab to open, its Plan the Route is plain text there).
    ReadyToFlyHost(
        plan, ownShipOn = ownShip.on, underway = inFlight.underway,
        onSetRoute = if (layout == LayoutPreference.STRIP) null else ({ tab = Tabs.FPL.ordinal }),
    )
    // A flight recorded and ended, offered for the logbook.
    AutoLogbookHost(plan, session)
    // The home screen's Next Flight widget, kept as the plan settles.
    NextFlightFeed(plan)
    // The welcome, once per install: at its end the sheet comes up a stop
    // on FPL (or the strip), with the sample flight or the way to plan one.
    WelcomeHost(plan) {
        tab = Tabs.FPL.ordinal
        raised++
        scope.launch { if (sheet.stop == SheetStop.PILL) sheet.moveTo(SheetStop.HALF) }
    }
}

/** The pill: the drag handle, the figures' line and the tabs (Material's
 *  48-dp tab row), as tall as the strip's field row. */
private val TabsPeek = WingtipSize.TapTarget * 2 + WingtipSpace.Xl
