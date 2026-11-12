package app.wingtipmaps.android.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.R
import app.wingtipmaps.android.ai.AiSources
import app.wingtipmaps.android.ai.AiTask
import app.wingtipmaps.android.ai.AiWordsRow
import app.wingtipmaps.android.airplane.AirplaneNow
import app.wingtipmaps.android.airplane.AskFigures
import app.wingtipmaps.android.airplane.rememberAirplaneNow
import app.wingtipmaps.android.alternate.AlternateLegRow
import app.wingtipmaps.android.altitude.PlanAltitudeSection
import app.wingtipmaps.android.api.Leg
import app.wingtipmaps.android.api.NavLogTotals
import app.wingtipmaps.android.design.ChoiceGroup
import app.wingtipmaps.android.design.Loading
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.dryrun.DryRun
import app.wingtipmaps.android.format.Format
import app.wingtipmaps.android.format.Spoken
import app.wingtipmaps.android.navigation.ScreenRequests
import app.wingtipmaps.android.navigation.generated.Screen
import app.wingtipmaps.android.offline.KeepForAirRow
import app.wingtipmaps.android.offline.KeptAgeLine
import app.wingtipmaps.android.offline.KeptForAir
import app.wingtipmaps.android.plan.FlightChoices
import app.wingtipmaps.android.plan.FlightRules
import app.wingtipmaps.android.ready.ReadyToFlyRow
import app.wingtipmaps.android.route.LegWords
import app.wingtipmaps.android.route.RouteMenu
import app.wingtipmaps.android.route.RoutePointMenu
import app.wingtipmaps.android.share.ShareRouteButton
import app.wingtipmaps.android.strip.StripData
import app.wingtipmaps.android.ui.sheet.CardExit
import app.wingtipmaps.android.ui.sheet.CardPage
import kotlinx.coroutines.launch

/**
 * The plan, the docked sheet's main page under the one search (the
 * owner's canvas, 2026-11-09): its head -- the route, its figures, its
 * altitude and airplane (PlanHead) -- the Brief, the Nav Log and the
 * Airplane, the route's fields with Add a Stop (RouteStops), Ready to Fly,
 * then all the FPL tab had, in its order: the route typed and planned,
 * Share and the dry run, the flight rules, and the nav log's legs as the
 * planner streams them, each opening its leg's card (RouteLegCard, the
 * map's own), with
 * the totals and its fuel check. Every figure on it is the planner's,
 * written by Format; a leg's cruise altitude is FL-045 as the cruise
 * controls write it (decision 0009).
 *
 * @param onClose back one level: the search, or with the route cleared
 *   the card of the field it was flown to (RouteHome).
 * @param onField a field of the route's card.
 * @param onLeg a leg's card, by its number from the departure.
 * @param onAddStopAfter the search opened for a stop after a point.
 * @param onFind the search opened, for an end not given yet.
 * @param onAddStop the search opened for a stop.
 */
@Composable
fun PlanPage(plan: Plan, onClose: () -> Unit, onField: (String) -> Unit, onLeg: (Int) -> Unit, onFind: () -> Unit, onAddStop: () -> Unit, onAddStopAfter: (String) -> Unit) {
    val state by plan.state.collectAsStateWithLifecycle()
    val dryRun: DryRun = hiltViewModel()
    val dryRunState by dryRun.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val tail by remember(context) { FlightChoices.of(context) }.tail.collectAsStateWithLifecycle()
    val list = rememberLazyListState()
    val scope = rememberCoroutineScope()
    // The Nav Log button and a link's `navlog`: the legs, further down.
    val toLegs: () -> Unit = { scope.launch { list.animateScrollToItem(LEGS_AT) } }
    val wanted by ScreenRequests.wanted.collectAsStateWithLifecycle()
    LaunchedEffect(wanted, state.legs.isNotEmpty()) {
        if (state.legs.isNotEmpty() && ScreenRequests.take(setOf(Screen.NAVLOG)) != null) toLegs()
    }
    val pad = Modifier.padding(horizontal = WingtipSpace.Lg)

    // The route's name large in the bar, folding into it as the plan
    // scrolls, ✕ always in view (the scrolling rule, 2026-11-10); no ←, as
    // the plan sits under the search.
    val title = if (state.dep.isEmpty() && state.dest.isEmpty()) stringResource(R.string.plan) else StripData.routeName(state.dep, state.dest, state.stops)
    // The route's ••• before the ✕: Clear Route (RouteMenu).
    CardPage(title = title, exit = CardExit.one(onClose), showBack = false, actions = { RouteMenu(plan) }) { padding ->
        LazyColumn(state = list, modifier = Modifier.fillMaxSize().padding(padding), verticalArrangement = Arrangement.spacedBy(WingtipSpace.Sm)) {
            item(key = "head") { Box(pad) { PlanHead(state, tail) } }
            item(key = "doors") { Box(pad) { PlanButtons(state.routed, onBrief = { ScreenRequests.ask(Screen.BRIEF) }, onNavLog = { toLegs() }) } }
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
            itemsIndexed(state.legs, key = { i, _ -> "leg-$i" }) { i, leg ->
                Column(pad) {
                    LegRow(leg, onOpen = { onLeg(i) }) { RoutePointMenu(leg.to, plan, onAddStopAfter) }
                    HorizontalDivider()
                }
            }
            state.totals?.let { totals ->
                // Under IFR with an alternate filed, the leg on to it.
                totals.alternate?.let { alt -> item(key = "alternate-leg") { Column(pad) { AlternateLegRow(alt); HorizontalDivider() } } }
                item(key = "totals") { Column(pad) { TotalsRows(totals, rememberAirplaneNow(plan)) } }
                // The route and its nav log in plain words, under the totals.
                item(key = "ai-route") {
                    Box(pad) { AiWordsRow(AiTask.ROUTE, key = state.legs.hashCode().toString(), sources = { AiSources.route(state.legs, state.totals, state.aircraft) }) }
                }
            }
            // The route kept for the air in one tap, once it has a course.
            if (state.course != null) item(key = "keep-for-air") { Box(pad) { KeepForAirRow(plan) } }
            item(key = "foot") { Spacer(Modifier.height(WingtipSpace.Xl)) }
        }
    }
}

/** Where the legs start in the plan's list of a routed plan (head,
 *  buttons, stops, Ready to Fly, route, rules, altitude, problem), for
 *  the Nav Log button to scroll to. */
private const val LEGS_AT = 8

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

/** One leg's row: to where at what cruise altitude, how far, the
 *  magnetic heading, the time; a tap opens the leg, and its end's menu
 *  (RoutePointMenu) sits at the row's end. TalkBack reads the row as one
 *  sentence in words (LegWords), so a swipe is a leg. */
@Composable
private fun LegRow(leg: Leg, onOpen: () -> Unit, menu: @Composable () -> Unit) {
    val openLeg = stringResource(R.string.said_open_leg)
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        // Material's clickable surface, clear, over the leg's figures.
        Surface(onClick = onOpen, color = Color.Transparent, modifier = Modifier.weight(1f).semantics { onClick(label = openLeg, action = null) }) {
            LegFigures(leg, Modifier.fillMaxWidth())
        }
        menu()
    }
}

/** The leg's figures, read as one sentence. */
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
        LegFigure(stringResource(R.string.figure_dist), Format.distance(leg.distanceNm))
        // The heading needs the airplane's airspeed against the wind: with
        // none chosen, the leg's magnetic course instead (decision 0011).
        val heading = leg.magneticHeadingDeg
        if (heading != null) LegFigure(stringResource(R.string.figure_mh), Format.heading(heading))
        else LegFigure(stringResource(R.string.figure_mc), Format.heading(leg.magneticCourseDeg))
        leg.eteMin?.let { LegFigure(stringResource(R.string.figure_ete), Format.navLogTime(it)) }
    }
}

/** One of a leg's figures, its name over it (the alternate's leg too,
 *  AlternateLegRow): the nav log is a table read down its columns, so the figures are bodyLarge with tabular digits
 *  ("tnum") and line up leg under leg, never smaller to fit. */
@Composable
internal fun RowScope.LegFigure(name: String, value: String) {
    Column(Modifier.weight(1f), horizontalAlignment = Alignment.End) {
        Text(name, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, style = MaterialTheme.typography.bodyLarge.copy(fontFeatureSettings = "tnum"), maxLines = 1)
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
    // When it was planned and whose winds it flies, for use when.
    PlannedLine(totals, Modifier.padding(top = WingtipSpace.Xs))
    // An airplane whose profile has no start, taxi and takeoff allowance:
    // the planner leaves it out of the fuel required rather than take a
    // stock airplane's (the owner, 2026-11-09), and the pilot is asked for
    // it here, the totals worked out again once it is given.
    if (totals.fuelRequiredGal != null) AskFigures(airplane, "fuel_totals", Modifier.padding(top = WingtipSpace.Xs))
}
