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
 * "KJVL Removed · Undo" after an edit that took something away (Plan.undo),
 * as Material's own Snackbar with its Undo action, in the screen's
 * [host] (the owner, 2026-11-10: stock components in place of the
 * hand-built Undo row): a stop removed, Clear Route ("Route Cleared"),
 * the route replaced whole by Fly Here, Depart From or a new one ("Route
 * Replaced"), a Direct To; the web's words. An added or moved stop and a
 * field's fuel set are steps all the same, taken back by the wide
 * window's Undo, but put up no Snackbar (`Kind.loud`; the owner,
 * 2026-11-21). Its timing, its dismissal and what TalkBack says are the
 * Snackbar's own. Undo takes the plan one step back, the fuel set with
 * it; let go, the edit is kept, unless a newer one has come since.
 */
@Composable
fun RouteUndoSnackbar(plan: Plan, host: SnackbarHostState) {
    val note by plan.undo.note.collectAsStateWithLifecycle()
    val removed = stringResource(R.string.undo_removed, note?.ident.orEmpty())
    val direct = stringResource(R.string.undo_direct, note?.ident.orEmpty())
    val cleared = stringResource(R.string.undo_cleared)
    val replaced = stringResource(R.string.undo_replaced)
    val words = note?.takeIf { it.kind.loud }?.let { shown ->
        when (shown.kind) {
            RouteUndo.Kind.REMOVED -> removed
            RouteUndo.Kind.DIRECT -> direct
            RouteUndo.Kind.CLEARED -> cleared
            else -> replaced
        }
    }
    val undo = stringResource(R.string.undo)
    // Keyed on the edit: a newer one (or an Undo from the toolbar) takes
    // this one's Snackbar down as it goes. Material's short time, as the
    // web's Undo went from 8 s to 5 (the HIG review's 12, 2026-11-21): two
    // or three words to read and one tap; TalkBack's own timeout setting
    // lengthens it for those who need it (the Snackbar's own).
    LaunchedEffect(note?.id) {
        val shown = note ?: return@LaunchedEffect
        val said = words ?: return@LaunchedEffect
        when (host.showSnackbar(said, actionLabel = undo, withDismissAction = true, duration = SnackbarDuration.Short)) {
            SnackbarResult.ActionPerformed -> plan.undoEdit()
            SnackbarResult.Dismissed -> plan.undo.dismiss(shown.id)
        }
    }
}
