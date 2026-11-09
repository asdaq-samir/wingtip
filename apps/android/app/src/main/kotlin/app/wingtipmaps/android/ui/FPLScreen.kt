package app.wingtipmaps.android.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
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
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.R
import app.wingtipmaps.android.airplane.AirplaneNow
import app.wingtipmaps.android.airplane.AskFigures
import app.wingtipmaps.android.airplane.rememberAirplaneNow
import app.wingtipmaps.android.api.Leg
import app.wingtipmaps.android.api.NavLogTotals
import app.wingtipmaps.android.design.ChoiceGroup
import app.wingtipmaps.android.design.Loading
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.format.Format
import app.wingtipmaps.android.format.Spoken
import app.wingtipmaps.android.navigation.ScreenRequests
import app.wingtipmaps.android.navigation.generated.Screen
import app.wingtipmaps.android.plan.FlightChoices
import app.wingtipmaps.android.plan.FlightRules
import app.wingtipmaps.android.route.LegWords
import app.wingtipmaps.android.route.RoutePointMenu
import app.wingtipmaps.android.route.RouteUndoRow
import app.wingtipmaps.android.share.ShareRouteButton

/**
 * The flight plan: the route typed, planned, and the nav log's legs as
 * the planner streams them, each opening its leg's figures (LegSheet),
 * with the totals and its fuel check. Every figure on it is the
 * planner's, written by Format; a leg's cruise altitude is FL-045 as the
 * cruise controls write it (decision 0009).
 */
@Composable
fun FPLScreen(plan: Plan) {
    val state by plan.state.collectAsStateWithLifecycle()
    // The fields hold what is typed; the plan's own route comes back into
    // them when it changes from elsewhere (a link, the kept plan, a card).
    var dep by rememberSaveable(state.dep) { mutableStateOf(state.dep) }
    var dest by rememberSaveable(state.dest) { mutableStateOf(state.dest) }
    var stops by rememberSaveable(state.stops) { mutableStateOf(state.stops.joinToString(", ")) }
    var open by remember { mutableStateOf<Int?>(null) }
    val idents = KeyboardOptions(capitalization = KeyboardCapitalization.Characters, imeAction = ImeAction.Next)

    Column(Modifier.fillMaxSize().padding(horizontal = WingtipSpace.Lg), verticalArrangement = Arrangement.spacedBy(WingtipSpace.Sm)) {
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
            // The route's Brief beside its Plan, where the pilot looks for it
            // once the route is in (OpenScreen's sheet, as the strip has it).
            if (state.routed && !state.planning) TextButton(onClick = { ScreenRequests.ask(Screen.BRIEF) }) { Text(stringResource(R.string.brief)) }
            // And its Share: the plan as a link another pilot opens (share/).
            if (state.routed && !state.planning) ShareRouteButton(state)
            if (state.planning) Loading(Modifier.size(WingtipSpace.Xl))
            state.stage?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
        }
        FlightRulesRow(onChanged = { if (state.routed) plan.plan() })
        ProblemLine(state.problem)
        LazyColumn(Modifier.weight(1f)) {
            // The last edit to the route, undone where it was made (RouteUndo).
            item(key = "undo") { RouteUndoRow(plan) }
            itemsIndexed(state.legs) { i, leg ->
                LegRow(leg, onOpen = { open = i }) { RoutePointMenu(leg.to, plan) }
                HorizontalDivider()
            }
            state.totals?.let { totals ->
                item {
                    Spacer(Modifier.height(WingtipSpace.Sm))
                    TotalsRows(totals, rememberAirplaneNow(plan))
                }
            }
        }
    }
    open?.let { i -> state.legs.getOrNull(i)?.let { LegSheet(number = null, leg = it, onClose = { open = null }) } }
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

/** One leg's row: to where at what cruise altitude, how far, the
 *  magnetic heading, the time; a tap opens the leg, and its end's menu
 *  (RoutePointMenu) sits at the row's end. TalkBack reads the row as one
 *  sentence in words (LegWords), so a swipe is a leg. */
@Composable
private fun LegRow(leg: Leg, onOpen: () -> Unit, menu: @Composable () -> Unit) {
    val openLeg = stringResource(R.string.said_open_leg)
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        LegFigures(leg, Modifier.weight(1f).clickable(role = Role.Button, onClickLabel = openLeg, onClick = onOpen))
        menu()
    }
}

/** The leg's figures, read as one sentence; `modifier` makes them the
 *  row's tap. */
@Composable
private fun LegFigures(leg: Leg, modifier: Modifier) {
    Row(
        modifier.clearAndSetSemantics { contentDescription = LegWords.row(leg) }.padding(vertical = WingtipSpace.Sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1.4f)) {
            Text(leg.to, style = MaterialTheme.typography.titleMedium)
            Text(Format.cruiseAltitude(leg.altitudeFt), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Figure(stringResource(R.string.figure_dist), Format.distance(leg.distanceNm))
        // The heading needs the airplane's airspeed against the wind: with
        // none chosen, the leg's magnetic course instead (decision 0011).
        val heading = leg.magneticHeadingDeg
        if (heading != null) Figure(stringResource(R.string.figure_mh), Format.heading(heading))
        else Figure(stringResource(R.string.figure_mc), Format.heading(leg.magneticCourseDeg))
        leg.eteMin?.let { Figure(stringResource(R.string.figure_ete), Format.navLogTime(it)) }
    }
}

/** The flight's totals, and the fuel the planner holds it to. */
@Composable
private fun TotalsRows(totals: NavLogTotals, airplane: AirplaneNow) {
    val warn = (totals.fuelMarginGal ?: 0.0) < 0
    Row(Modifier.fillMaxWidth()) {
        Figure(stringResource(R.string.figure_dist), Format.distance(totals.distanceNm), said = stringResource(R.string.leg_distance) + ", " + Spoken.distance(totals.distanceNm))
        // Time and fuel only with an airplane: the planner sends none
        // without one, and none is guessed (decision 0011).
        totals.eteMin?.let { Figure(stringResource(R.string.figure_ete), Format.duration(it), said = stringResource(R.string.leg_time) + ", " + Spoken.duration(it)) }
        totals.fuelGal?.let { Figure(stringResource(R.string.figure_fuel), Format.fuel(it), warn = warn, said = stringResource(R.string.leg_fuel) + ", " + Spoken.fuel(it)) }
        totals.fuelRequiredGal?.let { Figure(stringResource(R.string.figure_required), Format.fuel(it), warn = warn, said = stringResource(R.string.said_fuel_required) + ", " + Spoken.fuel(it)) }
    }
    if (warn) ProblemLine(stringResource(R.string.under_reserve), Modifier.padding(top = WingtipSpace.Xs))
    // An airplane whose profile has no start, taxi and takeoff allowance:
    // the planner leaves it out of the fuel required rather than take a
    // stock airplane's (the owner, 2026-11-09), and the pilot is asked for
    // it here, the totals worked out again once it is given.
    if (totals.fuelRequiredGal != null) AskFigures(airplane, "fuel_totals", Modifier.padding(top = WingtipSpace.Xs))
}
