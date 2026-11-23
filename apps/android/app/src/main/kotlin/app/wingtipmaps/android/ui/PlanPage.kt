package app.wingtipmaps.android.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.R
import app.wingtipmaps.android.altitude.PlanAltitudeSection
import app.wingtipmaps.android.design.ChoiceGroup
import app.wingtipmaps.android.design.Loading
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.dryrun.DryRun
import app.wingtipmaps.android.format.Format
import app.wingtipmaps.android.navigation.CardRequests
import app.wingtipmaps.android.navigation.ScreenRequests
import app.wingtipmaps.android.navigation.generated.Screen
import app.wingtipmaps.android.offline.KeepForAirRow
import app.wingtipmaps.android.offline.KeptAgeLine
import app.wingtipmaps.android.offline.KeptForAir
import app.wingtipmaps.android.plan.FlightChoices
import app.wingtipmaps.android.plan.FlightRules
import app.wingtipmaps.android.ready.ReadyToFlyRow
import app.wingtipmaps.android.route.ClearRouteAsk
import app.wingtipmaps.android.route.hasPoints
import app.wingtipmaps.android.ui.sheet.CardExit
import app.wingtipmaps.android.ui.sheet.CardPage
import kotlinx.coroutines.launch

/**
 * The plan, the docked sheet's main page under the one search, as the
 * web's FPL is since the owner's asks of 2026-11-19 to 21, built the
 * Android way: its bar titled "Flight Plan" with Search at its start --
 * back to the one search, the route kept -- and its ✕ at the end, which
 * clears the route once asked ("Clear Route?", ClearRouteAsk); under the
 * title the airplane's, the altitude's and the time's pills (PlanPills);
 * then the route's fields with Add a Stop (RouteStops), the fuel, Ready
 * to Fly, the planning and the dry run, the flight rules and the cruise altitude. At
 * its foot, staying put while the route scrolls under it, the actions'
 * floating toolbar over the figure strip (PlanFoot). The nav log's legs
 * and totals are a card of their own, the Nav Log button's (NavLogCard;
 * the card rule's 3). Every figure on it is the planner's, written by
 * Format.
 *
 * @param onClose back one level: the search, or with the route cleared
 *   the card of the field it was flown to (RouteHome).
 * @param onField a field of the route's card.
 * @param onNavLog the Nav Log's card opened.
 * @param onFind the search opened, for an end not given yet.
 * @param onAddStop the search opened for a stop.
 * @param onAddStopAfter the search opened for a stop after a point (its menu's).
 * @param onPlate a picked approach's plate card (its head row's Plate).
 */
@Composable
fun PlanPage(
    plan: Plan,
    onClose: () -> Unit,
    onField: (String) -> Unit,
    onNavLog: () -> Unit,
    onFind: () -> Unit,
    onAddStop: () -> Unit,
    onAddStopAfter: (String) -> Unit,
    onPlate: (ident: String, procedure: String) -> Unit = { _, _ -> },
) {
    val state by plan.state.collectAsStateWithLifecycle()
    val dryRun: DryRun = hiltViewModel()
    val dryRunState by dryRun.state.collectAsStateWithLifecycle()
    val pad = Modifier.padding(horizontal = WingtipSpace.Lg)
    val list = rememberLazyListState()
    val scope = rememberCoroutineScope()
    var clearing by rememberSaveable { mutableStateOf(false) }
    // Which face the route shows: the grouped list, or the route box its
    // round toggle turns it into in the same place (the web's routeOpen).
    var typing by rememberSaveable { mutableStateOf(false) }

    // Search at the bar's start, back to the one search with the route
    // kept, where a card's ← would be; the ✕ asks before it clears the
    // route, and with nothing in it goes back as a card's does.
    val search: @Composable () -> Unit = {
        IconButton(onClick = onClose) { Icon(WingtipIcons.search, contentDescription = stringResource(R.string.search_hint)) }
    }
    val exit = CardExit(back = onClose, close = { if (state.hasPoints) clearing = true else onClose() })
    val foot: @Composable () -> Unit = {
        PlanFoot(
            plan,
            onBrief = { ScreenRequests.ask(Screen.BRIEF) },
            onNavLog = onNavLog,
            onRouteOptions = { CardRequests.open(SheetPage.RouteOptions) },
            onFile = { CardRequests.open(SheetPage.Filing) },
        )
    }
    CardPage(title = stringResource(R.string.flight_plan), exit = exit, navigationIcon = search, bottomBar = foot) { padding ->
        LazyColumn(state = list, modifier = Modifier.fillMaxSize().padding(padding), verticalArrangement = Arrangement.spacedBy(WingtipSpace.Sm)) {
            item(key = "pills") {
                Box(pad) { PlanPills(plan, state, onAltitude = { scope.launch { list.animateScrollToItem(altitudeIndex(state)) } }) }
            }
            item(key = "stops") {
                Box(pad) {
                    // The faces are of different heights: the plan brought back
                    // to the route's top as one turns, so the other is in sight.
                    val turn = { to: Boolean ->
                        typing = to
                        if (list.firstVisibleItemIndex >= 1) scope.launch { list.scrollToItem(1) }
                    }
                    if (typing) {
                        RouteBox(plan, state, onAddStopAfter = onAddStopAfter, onToggle = { turn(false) })
                    } else {
                        RouteStops(
                            plan, state, onField = onField, onFind = onFind, onAddStop = onAddStop, onAddStopAfter = onAddStopAfter, onPlate = onPlate,
                            toggle = { TypeRouteToggle(typing = false) { turn(true) } },
                        )
                    }
                }
            }
            // Add or Remove Fuel Stops by Add a Stop, then the fuel in the
            // tanks at each field, each a tap to set it (FuelTanks).
            item(key = "fuel-stops") { Box(pad) { FuelStopsRow(plan, state, index = 0, count = 1) } }
            item(key = "fuel") { Box(pad) { FuelTanks(plan, state) } }
            if (state.routed) item(key = "ready") { Box(pad) { ReadyToFlyRow(plan, onSetRoute = null) } }
            item(key = "route") { Box(pad) { RouteFields(state, dryRun) } }
            item(key = "rules") { Box(pad) { FlightRulesRow(onChanged = { if (state.routed) plan.plan() }) } }
            // The cruise altitude, under the rules it is picked by: the
            // Profile and the Altitude Advisor (the altitude pill's tap).
            item(key = "altitude") { Box(pad) { PlanAltitudeSection(plan, state) } }
            item(key = "problem") {
                Column(pad) {
                    ProblemLine(state.problem ?: dryRunState.problem)
                    // The nav log kept for the air, shown with no signal: how old.
                    KeptAgeLine(KeptForAir.PLAN, state.plannedAtMs.takeIf { state.kept })
                }
            }
            // The route kept for the air in one tap, once it has a course.
            if (state.course != null) item(key = "keep-for-air") { Box(pad) { KeepForAirRow(plan) } }
            item(key = "foot") { Spacer(Modifier.height(WingtipSpace.Xl)) }
        }
    }
    if (clearing) ClearRouteAsk(plan, onDone = { clearing = false })
}

/** Where the Altitude Advisor sits in the plan's list: after the pills,
 *  the stops, the two fuel rows, Ready to Fly once routed, the planning
 *  and the rules, as PlanPage lays them out. */
internal fun altitudeIndex(state: Plan.State): Int = ALTITUDE_AFTER + if (state.routed) 1 else 0

private const val ALTITUDE_AFTER = 6

/** The route's planning under its fields: the planner's progress, and
 *  the dry run once the nav log is in (its Share is More's). The route is
 *  typed in the route box, the list's other face (RouteBox), which plans
 *  at each change, so there is no field or Plan button here. */
@Composable
private fun RouteFields(state: Plan.State, dryRun: DryRun) {
    if (state.totals == null && !state.planning && state.stage == null) return
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Md)) {
        // The plan flown on paper over the map, once the nav log is in.
        if (state.totals != null && !state.planning) TextButton(onClick = { dryRun.start(state) }) { Text(stringResource(R.string.wording_dry_run)) }
        if (state.planning) Loading(Modifier.size(WingtipSpace.Xl))
        state.stage?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
    }
}

/**
 * The flight rules the route is planned and briefed under, VFR or IFR
 * (the web's Flight Rules in FPL's profile card): a choice of two is a
 * segmented control (decision 0017). A change plans the route again,
 * since the planner picks the altitudes by them (14 CFR 91.159 for VFR,
 * 91.179 for IFR).
 */
@Composable
internal fun FlightRulesRow(onChanged: () -> Unit) {
    val context = LocalContext.current
    val choices = remember(context) { FlightChoices.of(context) }
    val rules by choices.rules.collectAsStateWithLifecycle()
    ChoiceGroup(FlightRules.entries.map { it to it.name }, selected = rules) { r ->
        if (rules != r) {
            choices.setRules(r)
            onChanged()
        }
    }
}
