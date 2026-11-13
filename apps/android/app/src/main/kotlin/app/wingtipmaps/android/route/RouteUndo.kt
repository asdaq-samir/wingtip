package app.wingtipmaps.android.route

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * The route as it was before the last edit that took something from it
 * or changed it -- a stop removed, moved or added, a Direct To, the route
 * replaced by Fly Here or cleared -- for the Undo of the edit's Snackbar
 * (RouteUndoSnackbar; the iPhone's PlanHistory): one step back, kept
 * until the next edit or until the Snackbar is let go; and the edit undone, for Redo,
 * kept until the next edit. Plan writes them and applies them; the words
 * are the screen's.
 */
class RouteUndo {
    enum class Kind { REMOVED, MOVED, ADDED, DIRECT, FLY_HERE, DEPART_FROM, CLEARED }

    /** One edit: what it was and to which point, and all it changed --
     *  the route, its holds and its Direct. */
    data class Note(
        val id: Long,
        val kind: Kind,
        val ident: String,
        val route: RouteEdits.Route,
        val holds: List<String>,
        val direct: String?,
        val was: RouteEdits.Route?,
    )

    private var count = 0L
    private val _note = MutableStateFlow<Note?>(null)
    val note: StateFlow<Note?> = _note.asStateFlow()
    private val _redo = MutableStateFlow<Note?>(null)
    val redo: StateFlow<Note?> = _redo.asStateFlow()

    /** A new edit: what it changed kept for Undo, and a Redo forgotten,
     *  since it would put back a route this edit has moved on from. */
    fun took(kind: Kind, ident: String, route: RouteEdits.Route, holds: List<String>, direct: String?, was: RouteEdits.Route?) {
        count += 1
        _note.value = Note(count, kind, ident, route, holds, direct, was)
        _redo.value = null
    }

    /** The route an Undo left, for Redo. */
    fun keepRedo(now: Note) {
        _redo.value = now
    }

    /** The route a Redo left, for Undo again; the Redo is spent. */
    fun keepUndo(now: Note) {
        count += 1
        _note.value = now.copy(id = count)
    }

    fun takeRedo(): Note? {
        val now = _redo.value ?: return null
        _redo.value = null
        return now
    }

    /** The edit to undo, and none left. */
    fun take(): Note? {
        val now = _note.value ?: return null
        _note.value = null
        return now
    }

    /** The Snackbar let go: that edit kept, unless a newer one came since. */
    fun dismiss(id: Long) {
        if (_note.value?.id == id) _note.value = null
    }
}
