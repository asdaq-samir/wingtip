package app.wingtipmaps.android.route

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * The route as it was before the last edit that took something from it
 * or changed it -- a stop removed, moved or added, a Direct To, the route
 * replaced by Fly Here -- for the Undo row in the route's list (the
 * iPhone's UndoBar and its PlanHistory): one step back, kept until the
 * next edit or until the row's time is up. Plan writes it and applies it;
 * the words are the screen's.
 */
class RouteUndo {
    enum class Kind { REMOVED, MOVED, ADDED, DIRECT, FLY_HERE }

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

    fun took(kind: Kind, ident: String, route: RouteEdits.Route, holds: List<String>, direct: String?, was: RouteEdits.Route?) {
        count += 1
        _note.value = Note(count, kind, ident, route, holds, direct, was)
    }

    /** The edit to undo, and none left. */
    fun take(): Note? {
        val now = _note.value ?: return null
        _note.value = null
        return now
    }

    /** The row's time up: that edit kept, unless a newer one came since. */
    fun dismiss(id: Long) {
        if (_note.value?.id == id) _note.value = null
    }
}
