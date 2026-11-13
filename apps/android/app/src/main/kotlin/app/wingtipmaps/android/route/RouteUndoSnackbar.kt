package app.wingtipmaps.android.route

import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.R

/**
 * "Removed KJVL · Undo" after an edit that changed the route (Plan.undo),
 * as Material's own Snackbar with its Undo action, in the screen's
 * [host] (the owner, 2026-11-10: stock components in place of the
 * hand-built Undo row). Its timing, its dismissal and what TalkBack says
 * are the Snackbar's own. Undo takes the plan one step back; let go, the
 * edit is kept, unless a newer one has come since, which shows its own.
 */
@Composable
fun RouteUndoSnackbar(plan: Plan, host: SnackbarHostState) {
    val note by plan.undo.note.collectAsStateWithLifecycle()
    val words = note?.let { shown ->
        stringResource(
            when (shown.kind) {
                RouteUndo.Kind.REMOVED -> R.string.undo_removed
                RouteUndo.Kind.MOVED -> R.string.undo_moved
                RouteUndo.Kind.ADDED -> R.string.undo_added
                RouteUndo.Kind.DIRECT -> R.string.undo_direct
                RouteUndo.Kind.FLY_HERE -> R.string.undo_fly_here
                RouteUndo.Kind.DEPART_FROM -> R.string.undo_depart_from
                RouteUndo.Kind.CLEARED -> R.string.undo_cleared
            },
            shown.ident,
        )
    }
    val undo = stringResource(R.string.undo)
    // Keyed on the edit: a newer one (or an Undo from the toolbar) takes
    // this one's Snackbar down as it goes.
    LaunchedEffect(note?.id) {
        val shown = note ?: return@LaunchedEffect
        val said = words ?: return@LaunchedEffect
        when (host.showSnackbar(said, actionLabel = undo, withDismissAction = true, duration = SnackbarDuration.Long)) {
            SnackbarResult.ActionPerformed -> plan.undoEdit()
            SnackbarResult.Dismissed -> plan.undo.dismiss(shown.id)
        }
    }
}
