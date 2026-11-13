package app.wingtipmaps.android.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
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
import app.wingtipmaps.android.navigation.ScreenRequests
import app.wingtipmaps.android.navigation.generated.Screen
import app.wingtipmaps.android.offline.KeepForAirRow
import app.wingtipmaps.android.offline.KeptAgeLine
import app.wingtipmaps.android.offline.KeptForAir
import app.wingtipmaps.android.plan.FlightChoices
import app.wingtipmaps.android.plan.FlightRules
import app.wingtipmaps.android.ready.ReadyToFlyRow
import app.wingtipmaps.android.route.RouteMenu
import app.wingtipmaps.android.share.ShareRouteButton
import app.wingtipmaps.android.strip.StripData
import app.wingtipmaps.android.ui.sheet.CardExit
import app.wingtipmaps.android.ui.sheet.CardPage

/**
 * The plan, the docked sheet's main page under the one search (the
 * owner's canvas, 2026-11-09): its head -- the route, its figures, its
 * altitude and airplane (PlanHead) -- the Brief, the Nav Log and the
 * Airplane, the route's fields with Add a Stop (RouteStops), Ready to Fly,
 * then all the FPL tab had, in its order: the route typed and planned,
 * Share and the dry run, the flight rules and the cruise altitude. The
 * nav log's legs and totals are a card of their own, the Nav Log button's
 * (NavLogCard; the card rule's 3). Every figure on it is the planner's,
 * written by Format.
 *
 * @param onClose back one level: the search, or with the route cleared
 *   the card of the field it was flown to (RouteHome).
 * @param onField a field of the route's card.
 * @param onNavLog the Nav Log's card opened.
 * @param onFind the search opened, for an end not given yet.
 * @param onAddStop the search opened for a stop.
 */
@Composable
fun PlanPage(plan: Plan, onClose: () -> Unit, onField: (String) -> Unit, onNavLog: () -> Unit, onFind: () -> Unit, onAddStop: () -> Unit) {
    val state by plan.state.collectAsStateWithLifecycle()
    val dryRun: DryRun = hiltViewModel()
    val dryRunState by dryRun.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val tail by remember(context) { FlightChoices.of(context) }.tail.collectAsStateWithLifecycle()
    val pad = Modifier.padding(horizontal = WingtipSpace.Lg)

    // The route's name large in the bar, folding into it as the plan
    // scrolls, ✕ always in view (the scrolling rule, 2026-11-10); no ←, as
    // the plan sits under the search.
    val title = if (state.dep.isEmpty() && state.dest.isEmpty()) stringResource(R.string.plan) else StripData.routeName(state.dep, state.dest, state.stops)
    // The route's ••• before the ✕: Clear Route (RouteMenu).
    CardPage(title = title, exit = CardExit.one(onClose), showBack = false, actions = { RouteMenu(plan) }) { padding ->
        LazyColumn(modifier = Modifier.fillMaxSize().padding(padding), verticalArrangement = Arrangement.spacedBy(WingtipSpace.Sm)) {
            item(key = "head") { Box(pad) { PlanHead(state, tail) } }
            item(key = "doors") { Box(pad) { PlanButtons(state.routed, onBrief = { ScreenRequests.ask(Screen.BRIEF) }, onNavLog = onNavLog) } }
            item(key = "stops") { Box(pad) { RouteStops(state, onField = onField, onFind = onFind, onAddStop = onAddStop) } }
            if (state.routed) item(key = "ready") { Box(pad) { ReadyToFlyRow(plan, onSetRoute = null) } }
            item(key = "route") { Box(pad) { RouteFields(plan, state, dryRun) } }
            item(key = "rules") { Box(pad) { FlightRulesRow(onChanged = { if (state.routed) plan.plan() }) } }
            // The cruise altitude, under the rules it is picked by: the Profile and the Altitude Advisor.
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
}

/** The route typed and planned, as the FPL tab had it: the departure and
 *  the destination, the stops, Plan, Share and the dry run. */
@Composable
private fun RouteFields(plan: Plan, state: Plan.State, dryRun: DryRun) {
    // The fields hold what is typed; the plan's own route comes back into
    // them when it changes from elsewhere (a link, the kept plan, a card).
    var dep by rememberSaveable(state.dep) { mutableStateOf(state.dep) }
    var dest by rememberSaveable(state.dest) { mutableStateOf(state.dest) }
    var stops by rememberSaveable(state.stops) { mutableStateOf(state.stops.joinToString(", ")) }
    val idents = KeyboardOptions(capitalization = KeyboardCapitalization.Characters, imeAction = ImeAction.Next)
    Column(verticalArrangement = Arrangement.spacedBy(WingtipSpace.Sm)) {
        Row(horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Sm)) {
            OutlinedTextField(
                value = dep, onValueChange = { dep = it }, modifier = Modifier.weight(1f),
                label = { Text(stringResource(R.string.departure)) }, singleLine = true, keyboardOptions = idents,
            )
            OutlinedTextField(
                value = dest, onValueChange = { dest = it }, modifier = Modifier.weight(1f),
                label = { Text(stringResource(R.string.destination)) }, singleLine = true, keyboardOptions = idents,
            )
        }
        OutlinedTextField(
            value = stops, onValueChange = { stops = it }, modifier = Modifier.fillMaxWidth(),
            label = { Text(stringResource(R.string.stops)) }, supportingText = { Text(stringResource(R.string.stops_help)) }, singleLine = true,
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters, imeAction = ImeAction.Done),
        )
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Md)) {
            Button(
                onClick = { plan.plan(dep, dest, stops.split(",")) },
                enabled = dep.isNotBlank() && dest.isNotBlank() && !state.planning,
            ) { Text(stringResource(R.string.plan)) }
            // Its Share: the plan as a link another pilot opens (share/).
            if (state.routed && !state.planning) ShareRouteButton(state)
            // The plan flown on paper over the map, once the nav log is in.
            if (state.totals != null && !state.planning) TextButton(onClick = { dryRun.start(state) }) { Text(stringResource(R.string.dry_run)) }
            if (state.planning) Loading(Modifier.size(WingtipSpace.Xl))
            state.stage?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
        }
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
