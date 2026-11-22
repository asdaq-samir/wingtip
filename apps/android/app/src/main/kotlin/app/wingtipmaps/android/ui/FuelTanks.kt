package app.wingtipmaps.android.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.input.TextFieldLineLimits
import androidx.compose.foundation.text.input.rememberTextFieldState
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SegmentedListItem
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.input.KeyboardType
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.R
import app.wingtipmaps.android.design.ChoiceGroup
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.plan.PlanTanks
import app.wingtipmaps.android.route.RouteUndo
import app.wingtipmaps.android.route.addFuelStops
import app.wingtipmaps.android.route.fuelStopsIn
import app.wingtipmaps.android.route.fuelStopsToAdd
import app.wingtipmaps.android.route.noFuelStop
import app.wingtipmaps.android.route.removeFuelStops
import app.wingtipmaps.android.ui.sheet.WingtipSheet

/** The gauges for the plan as planned now (PlanTanks.walk); none without
 *  an airplane, or before the nav log is in. */
fun Plan.State.tanks(own: Map<String, Int>): Map<PlanTanks.At, PlanTanks.Tank> {
    if (!airplane) return emptyMap()
    val refuels = stops.indices.map { course?.stops?.getOrNull(it)?.kind != "fix" }
    return PlanTanks.walk(legs.map { PlanTanks.LegBurn(it.to, it.fuelGal) }, dep, stops, refuels, PlanTanks.Figures.of(totals), own)
}

/**
 * The fuel in the tanks at each field of the route, as the web's timeline
 * draws a gauge at each one: the departure's at engine start, each stop's
 * and the destination's on landing, every figure the engine's
 * (PlanTanks). Material's segmented list, a row a field, its determinate
 * linear indicator the share left and the gallons; under the reserve in
 * the error colour, past empty "−12 gal". A field the airplane leaves is
 * a tap that sets its fuel (the owner, 2026-11-21: "can we set the fuel
 * tank by tapping on it?"), in the app's modal sheet over the plan.
 */
@Composable
fun FuelTanks(plan: Plan, state: Plan.State) {
    val set by PlanTanks.state.collectAsStateWithLifecycle()
    val tanks = state.tanks(set.own)
    if (tanks.isEmpty()) return
    var asking by remember { mutableStateOf<Triple<String, Boolean, PlanTanks.Tank>?>(null) }
    val points = listOf(PlanTanks.At(-1) to state.dep) + state.stops.mapIndexed { i, s -> PlanTanks.At(i) to s } + (PlanTanks.At(state.stops.size) to state.dest)
    val shown = points.filter { tanks[it.first] != null }
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(ListItemDefaults.SegmentedGap)) {
        Text(stringResource(R.string.fuel_in_tanks), style = MaterialTheme.typography.titleSmall)
        shown.forEachIndexed { i, (at, ident) ->
            val tank = tanks.getValue(at)
            val departure = at.index < 0
            val settable = departure || (at.index < state.stops.size && state.course?.stops?.getOrNull(at.index)?.kind != "fix")
            val what = stringResource(if (departure) R.string.fuel_on_board else R.string.fuel_lands_with)
            val words = PlanTanks.words(tank.gal)
            val ink = if (tank.low) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface
            SegmentedListItem(
                onClick = { if (settable) asking = Triple(ident, !departure, tank) },
                enabled = settable,
                shapes = ListItemDefaults.segmentedShapes(index = i, count = shown.size),
                supportingContent = { Text(what) },
                trailingContent = {
                    Column {
                        LinearProgressIndicator(progress = { (tank.gal / tank.usable).toFloat().coerceIn(0f, 1f) }, color = ink, modifier = Modifier.width(WingtipSpace.Xl * 2))
                        Text(words, color = ink, style = MaterialTheme.typography.titleSmall)
                    }
                },
                modifier = Modifier.fillMaxWidth().clearAndSetSemantics {
                    contentDescription = "$ident, $what, $words" + if (tank.low) ", under the reserve" else ""
                },
                content = { Text(ident) },
            )
        }
    }
    asking?.let { (ident, stop, tank) ->
        FuelSetSheet(ident, stop, tank, onDone = { gallons ->
            plan.undoable(RouteUndo.Kind.FUEL, ident)
            PlanTanks.set(ident, gallons)
            asking = null
            plan.plan()
        }, onCancel = { asking = null })
    }
}

/**
 * Setting the fuel as the airplane leaves a field (the web's FuelSet): at
 * the departure Full or the gallons; at a stop Full, No fuel (it keeps
 * what it lands with) or the gallons. The picks a connected button group
 * (discrete settings are segments), the gallons a number field. No Tabs
 * pick: no profile carries one, and none is assumed. More than the tanks
 * hold is kept with a warning (warn, never limit).
 */
@Composable
private fun FuelSetSheet(ident: String, stop: Boolean, tank: PlanTanks.Tank, onDone: (Int?) -> Unit, onCancel: () -> Unit) {
    val usable = kotlin.math.floor(tank.usable).toInt()
    val left = maxOf(0, kotlin.math.floor(tank.gal).toInt())
    var pick by rememberSaveable { mutableStateOf(if (tank.own == null) "full" else if (stop && tank.own == 0) "none" else "own") }
    val field = rememberTextFieldState((tank.own ?: usable).toString())
    LaunchedEffect(pick) {
        if (pick != "own") field.edit { replace(0, length, (if (pick == "full") usable else left).toString()) }
    }
    val typed = field.text.toString().toIntOrNull()
    LaunchedEffect(typed) { if (typed != null && typed != (if (pick == "full") usable else if (pick == "none") left else typed)) pick = "own" }
    val valid = pick != "own" || (typed != null && typed >= 0)
    val choices = buildList {
        add("full" to stringResource(R.string.fuel_full, "$usable gal"))
        if (stop) add("none" to stringResource(R.string.fuel_none))
        add("own" to stringResource(R.string.fuel_gallons))
    }
    // The app's one modal sheet over the plan (WingtipSheet), at half, so
    // the gauge tapped stays in sight above it (the HIG review's 13, the
    // web's FuelSet as a nested sheet over FPL); Done before its ✕, which
    // cancels, as Back and a swipe down do.
    WingtipSheet(
        title = stringResource(if (stop) R.string.fuel_at else R.string.fuel_on_board_at, ident),
        onClose = onCancel,
        actions = { TextButton(onClick = { onDone(if (pick == "full") null else if (pick == "none") 0 else typed) }, enabled = valid) { Text(stringResource(R.string.done)) } },
    ) {
        Column(Modifier.fillMaxWidth().padding(horizontal = WingtipSpace.Lg).padding(bottom = WingtipSpace.Xl), verticalArrangement = Arrangement.spacedBy(WingtipSpace.Md)) {
            ChoiceGroup(choices, selected = pick) { pick = it }
            OutlinedTextField(
                state = field,
                label = { Text(stringResource(R.string.fuel_gallons)) },
                lineLimits = TextFieldLineLimits.SingleLine,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                modifier = Modifier.fillMaxWidth(),
            )
            val over = (typed ?: 0) > usable
            Text(
                if (over) stringResource(R.string.fuel_over, "$usable gal") else if (stop) stringResource(R.string.fuel_lands, PlanTanks.words(tank.gal)) else stringResource(R.string.fuel_start_help),
                color = if (over) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
                style = MaterialTheme.typography.bodySmall,
            )
        }
    }
}

/** Add a Stop's neighbour, the web's fuel stops pill: "Add Fuel Stops"
 *  where the planner suggests stops for a flight too long for the tanks,
 *  every flight's; once the route has the ones it put in, "Remove Fuel
 *  Stops" in the error colour. Where a flight is short and the planner
 *  found no stop in reach, the row says so in the error colour in the
 *  pill's place (route/NoFuelStop). Nothing where there is none. */
@Composable
fun FuelStopsRow(plan: Plan, state: Plan.State, index: Int, count: Int) {
    val set by PlanTanks.state.collectAsStateWithLifecycle()
    val remove = state.fuelStopsIn(set.fuelStops).isNotEmpty()
    val short = state.noFuelStop
    if (!remove && state.fuelStopsToAdd == null) {
        short.forEach { s ->
            val words = stringResource(if (s.onBoard) R.string.fuel_too_little_on_board else R.string.fuel_no_stop_in_reach, s.name)
            ProblemLine(words, Modifier.fillMaxWidth())
        }
        return
    }
    val ink = if (remove) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary
    SegmentedListItem(
        onClick = { if (remove) plan.removeFuelStops() else plan.addFuelStops() },
        enabled = !state.planning,
        shapes = ListItemDefaults.segmentedShapes(index = index, count = count),
        leadingContent = { Icon(WingtipIcons.fuel, contentDescription = null, tint = ink) },
        modifier = Modifier.fillMaxWidth(),
        content = { Text(stringResource(if (remove) R.string.remove_fuel_stops else R.string.add_fuel_stops), color = ink) },
    )
}
