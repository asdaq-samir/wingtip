package app.wingtipmaps.android.route

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.R
import app.wingtipmaps.android.airplane.AirplaneNow
import app.wingtipmaps.android.api.Planner
import app.wingtipmaps.android.api.generated.RouteOption
import app.wingtipmaps.android.api.planned
import app.wingtipmaps.android.design.Loading
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.format.Format
import app.wingtipmaps.android.ui.ProblemLine
import app.wingtipmaps.android.ui.sheet.CardExit
import app.wingtipmaps.android.ui.sheet.CardPage
import kotlinx.coroutines.CancellationException

/**
 * Route Options, the plan's More (the web's ••• since the owner's ask of
 * 2026-11-21): the ways the planner finds to fly from the departure to
 * the destination in the airplane picked (GET /route-options) -- each
 * its points in order, its distance, time and fuel, and why to mind it
 * -- as Material's list items on a card of their own, each with Use,
 * which puts its stops in the route (an undoable "Route Replaced" where
 * the ends change). The planner only suggests; the plan then checks the
 * one used leg by leg. Every figure is the planner's, written by Format;
 * with no airplane picked there is no time or fuel (decision 0011).
 */
@Composable
fun RouteOptionsCard(plan: Plan, exit: CardExit, onUsed: () -> Unit) {
    val state by plan.state.collectAsStateWithLifecycle()
    val asked by produceState<Result<List<RouteOption>>?>(null, state.dep, state.dest, state.aircraft, state.own) {
        value = if (!state.routed) Result.success(emptyList()) else ask(state)
    }
    CardPage(title = stringResource(R.string.route_options), exit = exit, subtitle = "${state.dep} → ${state.dest}") { padding ->
        LazyColumn(Modifier.fillMaxSize().padding(padding), verticalArrangement = Arrangement.spacedBy(WingtipSpace.Xs)) {
            when (val got = asked) {
                null -> item(key = "loading") { Loading(Modifier.padding(WingtipSpace.Lg).size(WingtipSpace.Xl)) }
                else -> got.fold(
                    { options ->
                        if (options.isEmpty()) item(key = "none") { Text(stringResource(R.string.route_options_none), Modifier.padding(WingtipSpace.Lg)) }
                        options.forEachIndexed { i, option ->
                            item(key = "option-$i") {
                                OptionRow(option, state.airplane) {
                                    plan.replaceRoute(state.dep, state.dest, option.stops)
                                    onUsed()
                                }
                            }
                        }
                    },
                    { why -> item(key = "problem") { ProblemLine(why.message, Modifier.padding(horizontal = WingtipSpace.Lg)) } },
                )
            }
        }
    }
}

/** One way to fly: its name, its points, its figures and its warning,
 *  in the error colour, with Use at its end. */
@Composable
private fun OptionRow(option: RouteOption, airplane: Boolean, onUse: () -> Unit) {
    val figures = listOfNotNull(
        Format.distance(option.distanceNm),
        option.airMin?.takeIf { airplane }?.let { Format.duration(it + option.groundMin) },
        option.fuelGal?.takeIf { airplane }?.let(Format::fuel),
    ).joinToString(" · ")
    ListItem(
        supportingContent = {
            Column {
                if (option.stops.isNotEmpty()) Text(option.stops.joinToString(" → "), color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(figures, color = MaterialTheme.colorScheme.onSurfaceVariant)
                option.warning?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        },
        trailingContent = { TextButton(onClick = onUse) { Text(stringResource(R.string.route_options_use)) } },
        modifier = Modifier.fillMaxWidth(),
    ) { Text(option.title) }
}

/** The planner's options for the plan's route and airplane, or why not. */
private suspend fun ask(state: Plan.State): Result<List<RouteOption>> = try {
    val q = AirplaneNow.plannerQuery(state.aircraft, state.own)
    fun n(key: String) = q[key]?.toDoubleOrNull()
    val answer = Planner.api.routeOptions(
        dep = state.dep,
        dest = state.dest,
        aircraft = q["aircraft"],
        cruiseTasKt = n("cruise_tas_kt"),
        fuelBurnGph = n("fuel_burn_gph"),
        usableFuelGal = n("usable_fuel_gal"),
        serviceCeilingFt = n("service_ceiling_ft"),
        taxiFuelGal = n("taxi_fuel_gal"),
        glideRatio = n("glide_ratio"),
        depart = state.depart,
        altitudeFt = state.altitudeFt,
    ).planned()
    Result.success(answer.options)
} catch (e: CancellationException) {
    throw e
} catch (e: Exception) {
    Result.failure(e)
}
