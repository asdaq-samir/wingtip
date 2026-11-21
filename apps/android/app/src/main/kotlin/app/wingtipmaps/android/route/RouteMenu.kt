package app.wingtipmaps.android.route

import androidx.compose.foundation.layout.Box
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
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
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.R
import app.wingtipmaps.android.ui.WingtipIcons

/**
 * The route's ••• in the plan's bar, before its ✕, as the web's route
 * menu and the iPhone's: Material's overflow button and its stock
 * DropdownMenu, with Clear Route in the error colour as the point menu's
 * Remove is (RoutePointMenu), asked first ("Clear Route?"). Shown while
 * the route has anything in it; the clearing is undone from its Snackbar
 * (Plan.clearRoute).
 */
@Composable
fun RouteMenu(plan: Plan) {
    val state by plan.state.collectAsStateWithLifecycle()
    if (!state.hasPoints) return
    var open by remember { mutableStateOf(false) }
    var asking by remember { mutableStateOf(false) }
    Box {
        IconButton(onClick = { open = true }) { Icon(WingtipIcons.more, contentDescription = stringResource(R.string.route_menu)) }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            DropdownMenuItem(
                text = { Text(stringResource(R.string.clear_route), color = MaterialTheme.colorScheme.error) },
                leadingIcon = { Icon(Icons.Filled.Delete, contentDescription = null, tint = MaterialTheme.colorScheme.error) },
                onClick = {
                    open = false
                    asking = true
                },
            )
        }
    }
    // Asked first in Material's alert dialog, the clearing in the error
    // colour (the web's and the iPhone's "Clear Route?", the owner,
    // 2026-11-20); its Snackbar's Undo still brings the route back.
    if (asking) {
        AlertDialog(
            onDismissRequest = { asking = false },
            title = { Text(stringResource(R.string.clear_route_ask)) },
            text = { Text(stringResource(R.string.clear_route_ask_line)) },
            confirmButton = {
                TextButton(onClick = {
                    asking = false
                    plan.clearRoute()
                }) { Text(stringResource(R.string.clear_route), color = MaterialTheme.colorScheme.error) }
            },
            dismissButton = { TextButton(onClick = { asking = false }) { Text(stringResource(R.string.cancel)) } },
        )
    }
}
