package app.wingtipmaps.android.route

import androidx.compose.foundation.layout.Box
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.res.stringResource
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.R
import app.wingtipmaps.android.share.rememberShareRoute
import app.wingtipmaps.android.ui.WingtipIcons

/**
 * "Clear Route?", asked by the plan's ✕ before the route goes (the web's
 * ClearRouteButton: one tap asks first, the owner, 2026-11-20), in
 * Material's alert dialog with the clearing in the error colour; its
 * Snackbar's Undo still brings the route back (Plan.clearRoute).
 */
@Composable
fun ClearRouteAsk(plan: Plan, onDone: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDone,
        title = { Text(stringResource(R.string.clear_route_ask)) },
        text = { Text(stringResource(R.string.clear_route_ask_line)) },
        confirmButton = {
            TextButton(onClick = {
                onDone()
                plan.clearRoute()
            }) { Text(stringResource(R.string.clear_route), color = MaterialTheme.colorScheme.error) }
        },
        dismissButton = { TextButton(onClick = onDone) { Text(stringResource(R.string.cancel)) } },
    )
}

/**
 * The plan's More, the last of its bar's buttons, as the web's ••• holds
 * three items since the owner's ask of 2026-11-21: Route Options and
 * Share Link -- Material's overflow button and its stock DropdownMenu.
 * Open in ForeFlight, the web's and the iPhone's third, is not here:
 * ForeFlight has no Android app. Undo is each edit's Snackbar, Clear
 * Route the plan's ✕, Print and the checkpoints the nav log's Share.
 */
@Composable
fun PlanMore(state: Plan.State, onRouteOptions: () -> Unit) {
    var open by remember { mutableStateOf(false) }
    val share = rememberShareRoute(state)
    Box {
        IconButton(onClick = { open = true }) { Icon(WingtipIcons.more, contentDescription = stringResource(R.string.more)) }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            DropdownMenuItem(
                text = { Text(stringResource(R.string.route_options)) },
                leadingIcon = { Icon(WingtipIcons.routeOptions, contentDescription = null) },
                enabled = state.routed,
                onClick = {
                    open = false
                    onRouteOptions()
                },
            )
            DropdownMenuItem(
                text = { Text(stringResource(R.string.share_link)) },
                leadingIcon = { Icon(WingtipIcons.share, contentDescription = null) },
                enabled = state.routed && !state.planning,
                onClick = {
                    open = false
                    share()
                },
            )
        }
    }
}
