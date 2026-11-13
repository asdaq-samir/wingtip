package app.wingtipmaps.android.route

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Info
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.R
import app.wingtipmaps.android.design.generated.WingtipHaptic
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.design.rememberHaptics
import app.wingtipmaps.android.flight.FlightModel
import app.wingtipmaps.android.map.MapPick
import app.wingtipmaps.android.navigation.CardRequests
import app.wingtipmaps.android.navigation.ScreenRequests
import app.wingtipmaps.android.navigation.generated.Screen
import app.wingtipmaps.android.route.PointActions.Action
import app.wingtipmaps.android.ui.CardAction
import app.wingtipmaps.android.ui.WingtipIcons

/**
 * A point of the route's menu, at the end of its row in the plan
 * (Material's overflow: the row's tap still opens the leg): its card,
 * the destination's Brief, Direct To (Fly as Planned once flown direct),
 * Hold Here, Add a Stop After…, Move Up and Down, and Remove in the error
 * colour, each in PointActions' order and the iPhone's words. Direct To
 * flies from the airplane while it is under way, else from the departure.
 */
@Composable
fun RoutePointMenu(ident: String, plan: Plan, onAddStopAfter: (String) -> Unit, flight: FlightModel = hiltViewModel()) {
    val state by plan.state.collectAsStateWithLifecycle()
    val actions = PointActions.of(ident, state)
    if (actions.isEmpty()) return
    val inFlight by flight.state.collectAsStateWithLifecycle()
    val haptics = rememberHaptics()
    var open by rememberSaveable(ident) { mutableStateOf(false) }
    val run: (Action) -> Unit = { action ->
        open = false
        when (action) {
            Action.MORE_INFO -> CardRequests.open(MapPick.Airport(ident))
            Action.BRIEF -> ScreenRequests.ask(Screen.BRIEF)
            Action.DIRECT_TO -> if (PointActions.directOn(ident, state)) {
                plan.cancelDirect()
            } else {
                plan.directToStop(ident, inFlight.fix?.takeIf { inFlight.underway })
                haptics.tap(WingtipHaptic.DIRECT_TO)
            }
            Action.HOLD_HERE -> PointActions.chartPoint(ident, state)?.let(plan::holdHere)
            // The one search, for the stop: no field of its own.
            Action.ADD_STOP_AFTER -> onAddStopAfter(ident)
            Action.MOVE_UP -> plan.moveStop(ident, -1)
            Action.MOVE_DOWN -> plan.moveStop(ident, 1)
            Action.REMOVE -> plan.removeStop(ident)
        }
    }
    Box {
        IconButton(onClick = { open = true }) {
            Icon(WingtipIcons.more, contentDescription = stringResource(R.string.said_point_menu, ident), tint = MaterialTheme.colorScheme.primary)
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            Text(ident, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(horizontal = WingtipSpace.Md, vertical = WingtipSpace.Sm))
            actions.forEach { action ->
                if (action == Action.REMOVE) HorizontalDivider()
                val danger = action == Action.REMOVE
                DropdownMenuItem(
                    text = { Text(label(action, PointActions.directOn(ident, state)), color = if (danger) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface) },
                    leadingIcon = { Icon(icon(action), contentDescription = null, tint = if (danger) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary) },
                    onClick = { run(action) },
                )
            }
        }
    }
}

@Composable
private fun label(action: Action, directOn: Boolean): String = stringResource(
    when (action) {
        Action.MORE_INFO -> R.string.point_more_info
        Action.BRIEF -> R.string.brief
        Action.DIRECT_TO -> if (directOn) R.string.point_fly_as_planned else R.string.point_direct_to
        Action.HOLD_HERE -> R.string.point_hold_here
        Action.ADD_STOP_AFTER -> R.string.point_add_stop_after
        Action.MOVE_UP -> R.string.point_move_up
        Action.MOVE_DOWN -> R.string.point_move_down
        Action.REMOVE -> R.string.point_remove
    },
)

private fun icon(action: Action): ImageVector = when (action) {
    Action.MORE_INFO -> Icons.Filled.Info
    Action.BRIEF -> WingtipIcons.brief
    Action.DIRECT_TO -> CardAction.DIRECT_TO.icon
    Action.HOLD_HERE -> CardAction.HOLD_HERE.icon
    Action.ADD_STOP_AFTER -> CardAction.ADD_STOP.icon
    Action.MOVE_UP -> Icons.Filled.ArrowUpward
    Action.MOVE_DOWN -> Icons.Filled.ArrowDownward
    Action.REMOVE -> Icons.Filled.Delete
}
