package app.wingtipmaps.android.route

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.R
import app.wingtipmaps.android.ui.UndoRow

/** "Removed KJVL · Undo" over the route's legs after an edit that changed
 *  it (Plan.undo), as the iPhone's UndoBar is for its route; nothing when
 *  there is none to undo. */
@Composable
fun RouteUndoRow(plan: Plan) {
    val note by plan.undo.note.collectAsStateWithLifecycle()
    val shown = note ?: return
    val words = stringResource(
        when (shown.kind) {
            RouteUndo.Kind.REMOVED -> R.string.undo_removed
            RouteUndo.Kind.MOVED -> R.string.undo_moved
            RouteUndo.Kind.ADDED -> R.string.undo_added
            RouteUndo.Kind.DIRECT -> R.string.undo_direct
            RouteUndo.Kind.FLY_HERE -> R.string.undo_fly_here
            RouteUndo.Kind.DEPART_FROM -> R.string.undo_depart_from
        },
        shown.ident,
    )
    UndoRow(words, key = shown.id, onUndo = plan::undoEdit, onDone = { plan.undo.dismiss(shown.id) })
}
