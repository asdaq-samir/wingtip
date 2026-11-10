package app.wingtipmaps.android.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.Button
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.R
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.format.Format
import app.wingtipmaps.android.navigation.ScreenRequests
import app.wingtipmaps.android.navigation.generated.Screen
import app.wingtipmaps.android.strip.StripCard
import app.wingtipmaps.android.strip.StripData

/**
 * The plan's head, as the owner's canvas draws it (2026-11-09): the route
 * with its close (back to what the search shows with nothing typed), the
 * figures the strip has (FiguresStrip: To, Dist, ETE, Fuel, the engine's
 * fuel), and the altitude and the airplane under them. Every figure the
 * planner's or the engine's, written by Format; with no airplane picked
 * the line says so and is the way to pick one (decision 0011).
 */
@Composable
fun PlanHead(state: Plan.State, tail: String?, onClose: () -> Unit) {
    StripCard(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(vertical = WingtipSpace.Sm), verticalArrangement = Arrangement.spacedBy(WingtipSpace.Xs)) {
            Row(Modifier.fillMaxWidth().padding(start = WingtipSpace.Lg), verticalAlignment = Alignment.CenterVertically) {
                val title = if (state.dep.isEmpty() && state.dest.isEmpty()) stringResource(R.string.plan) else StripData.routeName(state.dep, state.dest, state.stops)
                Text(title, style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f).semantics { heading() })
                IconButton(onClick = onClose) { Icon(WingtipIcons.close, contentDescription = stringResource(R.string.close)) }
            }
            if (state.routed) FiguresStrip(state)
            val altitude = (state.altitudeFt ?: state.legs.firstOrNull()?.altitudeFt)?.let(Format::cruiseAltitude)
            val airplane = listOfNotNull(tail, state.aircraft.uppercase().ifEmpty { null }).joinToString(" · ").ifEmpty { null }
            val line = listOfNotNull(airplane ?: stringResource(R.string.no_airplane), altitude).joinToString(" · ")
            Text(
                line,
                style = MaterialTheme.typography.bodyMedium,
                color = if (airplane == null) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.fillMaxWidth().clickable(role = Role.Button) { ScreenRequests.ask(Screen.AIRPLANE) }
                    .padding(horizontal = WingtipSpace.Lg, vertical = WingtipSpace.Sm),
            )
        }
    }
}

/** The plan's three doors, as the canvas has them: the Brief (filled),
 *  the Nav Log (its legs, further down the plan) and the Airplane. */
@Composable
fun PlanButtons(routed: Boolean, onBrief: () -> Unit, onNavLog: () -> Unit) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(WingtipSpace.Sm)) {
        Button(onClick = onBrief, enabled = routed, modifier = Modifier.weight(1f)) { Text(stringResource(R.string.brief)) }
        FilledTonalButton(onClick = onNavLog, enabled = routed, modifier = Modifier.weight(1f)) { Text(stringResource(R.string.nav_log)) }
        FilledTonalButton(onClick = { ScreenRequests.ask(Screen.AIRPLANE) }, modifier = Modifier.weight(1f)) { Text(stringResource(R.string.airplane)) }
    }
}

/**
 * The route's fields in order -- where it departs, its stops, "Add a
 * Stop", where it arrives -- each a tap to its card; an end not yet given
 * asks for it ("Where from?", "Where to?") and opens the search. Add a
 * Stop opens the search for a field or fix to land at or pass on the way.
 */
@Composable
fun RouteStops(state: Plan.State, onField: (String) -> Unit, onFind: () -> Unit, onAddStop: () -> Unit) {
    val course = state.course
    Column(Modifier.fillMaxWidth()) {
        StopRow(state.dep, course?.departure?.name, R.string.route_depart, R.string.where_from, onField, onFind)
        state.stops.forEachIndexed { i, stop ->
            HorizontalDivider()
            StopRow(stop, course?.stops?.getOrNull(i)?.name, R.string.route_stop, R.string.where_to, onField, onFind)
        }
        HorizontalDivider()
        ListItem(
            leadingContent = { Icon(Icons.Filled.Add, contentDescription = null, tint = MaterialTheme.colorScheme.primary) },
            colors = ListItemDefaults.colors(containerColor = Color.Transparent),
            modifier = Modifier.fillMaxWidth().clickable(enabled = state.routed, role = Role.Button, onClick = onAddStop),
            content = { Text(stringResource(R.string.add_a_stop), color = if (state.routed) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant) },
        )
        HorizontalDivider()
        StopRow(state.dest, course?.destination?.name, R.string.route_arrive, R.string.where_to, onField, onFind)
    }
}

@Composable
private fun StopRow(ident: String, name: String?, role: Int, ask: Int, onField: (String) -> Unit, onFind: () -> Unit) {
    val given = ident.isNotEmpty()
    ListItem(
        supportingContent = { Text(listOfNotNull(stringResource(role), name).joinToString(" · "), color = MaterialTheme.colorScheme.onSurfaceVariant) },
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        modifier = Modifier.fillMaxWidth().clickable(role = Role.Button) { if (given) onField(ident) else onFind() },
        content = { Text(if (given) ident else stringResource(ask), color = if (given) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.primary) },
    )
}
