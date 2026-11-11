package app.wingtipmaps.android.route

import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.material3.FloatingToolbarDefaults
import androidx.compose.material3.HorizontalFloatingToolbar
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.R
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.ui.WingtipIcons

/**
 * Editing a route on a tablet or an unfolded phone (the owner,
 * 2026-11-09): Material 3 Expressive's floating toolbar over the map,
 * with Undo, Redo and Add Point, where the hand is while the route is
 * worked on the map rather than in the panel beside it. Undo and Redo are
 * the plan's own (Plan.undoEdit, Plan.redoEdit), the same step back the
 * Undo of the edit's Snackbar takes (RouteUndoSnackbar); Add Point opens the one search for a stop,
 * as the plan's Add a Stop does. The phone's sheet keeps its own rows.
 */
@Composable
fun RouteToolbar(plan: Plan, onAddPoint: () -> Unit, modifier: Modifier = Modifier) {
    val undo by plan.undo.note.collectAsStateWithLifecycle()
    val redo by plan.undo.redo.collectAsStateWithLifecycle()
    HorizontalFloatingToolbar(
        expanded = true,
        colors = FloatingToolbarDefaults.standardFloatingToolbarColors(),
        modifier = modifier
            .windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Bottom + WindowInsetsSides.End))
            .padding(WingtipSpace.Lg),
    ) {
        IconButton(onClick = plan::undoEdit, enabled = undo != null) { Icon(WingtipIcons.undo, contentDescription = stringResource(R.string.undo)) }
        IconButton(onClick = plan::redoEdit, enabled = redo != null) { Icon(WingtipIcons.redo, contentDescription = stringResource(R.string.redo)) }
        // A labelled action: Google's research found actions harder to use
        // with their words taken off.
        TextButton(onClick = onAddPoint) {
            Icon(WingtipIcons.addToRoute, contentDescription = null)
            Text(stringResource(R.string.add_point), Modifier.padding(start = WingtipSpace.Sm))
        }
    }
}
