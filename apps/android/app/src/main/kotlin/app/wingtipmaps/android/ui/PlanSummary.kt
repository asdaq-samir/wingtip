package app.wingtipmaps.android.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SegmentedListItem
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.R
import app.wingtipmaps.android.alternate.AlternateStopRow
import app.wingtipmaps.android.alternate.PlanAlternate
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.format.Format
import app.wingtipmaps.android.navigation.ScreenRequests
import app.wingtipmaps.android.navigation.generated.Screen
import app.wingtipmaps.android.strip.StripCard

/**
 * The plan's head, as the owner's canvas draws it (2026-11-09), under the
 * plan's bar with the route's name and its close (PlanPage): the
 * figures the strip has (FiguresStrip: To, Dist, ETE, Fuel, the engine's
 * fuel), and the altitude and the airplane under them. Every figure the
 * planner's or the engine's, written by Format; with no airplane picked
 * the line says so and is the way to pick one (decision 0011).
 */
@Composable
fun PlanHead(state: Plan.State, tail: String?) {
    StripCard(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(vertical = WingtipSpace.Sm), verticalArrangement = Arrangement.spacedBy(WingtipSpace.Xs)) {
            if (state.routed) FiguresStrip(state)
            val altitude = (state.altitudeFt ?: state.legs.firstOrNull()?.altitudeFt)?.let(Format::cruiseAltitude)
            val airplane = listOfNotNull(tail, state.aircraft.uppercase().ifEmpty { null }).joinToString(" · ").ifEmpty { null }
            val line = listOfNotNull(airplane ?: stringResource(R.string.no_airplane), altitude).joinToString(" · ")
            // Material's clickable list item, to the airplane's page.
            ListItem(
                onClick = { ScreenRequests.ask(Screen.AIRPLANE) },
                colors = ListItemDefaults.colors(containerColor = Color.Transparent),
                modifier = Modifier.fillMaxWidth(),
                content = {
                    Text(line, style = MaterialTheme.typography.bodyMedium, color = if (airplane == null) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
                },
            )
        }
    }
}

/** The plan's three doors, as the canvas has them, in Material's button
 *  group: the Brief (filled, the plan's primary action), the Nav Log (its
 *  legs, further down the plan) and the Airplane, each labelled. */
@Composable
fun PlanButtons(routed: Boolean, onBrief: () -> Unit, onNavLog: () -> Unit) {
    val brief = stringResource(R.string.brief)
    val navLog = stringResource(R.string.nav_log)
    val airplane = stringResource(R.string.airplane)
    CardButtonGroup(
        listOf(
            GroupAction(brief, WingtipIcons.brief, filled = true, enabled = routed, onClick = onBrief),
            GroupAction(navLog, WingtipIcons.navLog, enabled = routed, onClick = onNavLog),
            GroupAction(airplane, WingtipIcons.airplane) { ScreenRequests.ask(Screen.AIRPLANE) },
        ),
        Modifier.fillMaxWidth(),
    )
}

/**
 * The route's fields in order -- where it departs, its stops, "Add a
 * Stop", where it arrives, and under IFR its alternate or "Add
 * Alternate" (AlternateStopRow) -- each a tap to its card; an end not yet given
 * asks for it ("Where from?", "Where to?") and opens the search. Add a
 * Stop opens the search for a field or fix to land at or pass on the way.
 */
@Composable
fun RouteStops(state: Plan.State, onField: (String) -> Unit, onFind: () -> Unit, onAddStop: () -> Unit) {
    val course = state.course
    // Under IFR, the alternate after the destination (PlanAlternate).
    val ifr = state.rules == "ifr" && state.routed
    val filed by PlanAlternate.filed.collectAsStateWithLifecycle()
    val alternate = PlanAlternate.of(state.rules, state.dest, filed)
    // Material 3 Expressive's segmented list: the route's rows as one
    // rounded group with small gaps between them, no rules.
    val count = state.stops.size + 3 + (if (ifr) 1 else 0)
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(ListItemDefaults.SegmentedGap)) {
        StopRow(state.dep, course?.departure?.name, R.string.route_depart, R.string.where_from, 0, count, onField, onFind)
        state.stops.forEachIndexed { i, stop ->
            StopRow(stop, course?.stops?.getOrNull(i)?.name, R.string.route_stop, R.string.where_to, i + 1, count, onField, onFind)
        }
        SegmentedListItem(
            onClick = onAddStop,
            enabled = state.routed,
            shapes = ListItemDefaults.segmentedShapes(index = state.stops.size + 1, count = count),
            leadingContent = { Icon(Icons.Filled.Add, contentDescription = null, tint = MaterialTheme.colorScheme.primary) },
            modifier = Modifier.fillMaxWidth(),
            content = { Text(stringResource(R.string.add_a_stop), color = if (state.routed) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant) },
        )
        val arrive = state.stops.size + 2
        StopRow(state.dest, course?.destination?.name, R.string.route_arrive, R.string.where_to, arrive, count, onField, onFind)
        if (ifr) AlternateStopRow(alternate, arrive + 1, count, onField)
    }
}

@Composable
private fun StopRow(ident: String, name: String?, role: Int, ask: Int, index: Int, count: Int, onField: (String) -> Unit, onFind: () -> Unit) {
    val given = ident.isNotEmpty()
    SegmentedListItem(
        onClick = { if (given) onField(ident) else onFind() },
        shapes = ListItemDefaults.segmentedShapes(index = index, count = count),
        supportingContent = { Text(listOfNotNull(stringResource(role), name).joinToString(" · "), color = MaterialTheme.colorScheme.onSurfaceVariant) },
        modifier = Modifier.fillMaxWidth(),
        content = { Text(if (given) ident else stringResource(ask), color = if (given) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.primary) },
    )
}
