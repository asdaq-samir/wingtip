package app.wingtipmaps.android.route

import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.strip.StripData

/** Whether the route has anything in it to clear: an end or a stop. */
val Plan.State.hasPoints: Boolean get() = dep.isNotEmpty() || dest.isNotEmpty() || stops.isNotEmpty()

/** Clear Route, the plan's ••• menu (the web's and the iPhone's Clear):
 *  the route and what was kept of it gone, the plan's page left empty to
 *  plan another, and the route as it was kept for the Snackbar's Undo
 *  ("Cleared KMSN → KOSH", RouteUndoSnackbar). Where the route was flown
 *  to from a field's card, the empty plan's ✕ goes back to it (RouteHome). */
fun Plan.clearRoute() {
    val s = state.value
    if (!s.hasPoints) return
    undoable(RouteUndo.Kind.CLEARED, StripData.routeName(s.dep, s.dest, s.stops))
    RouteHome.shared.cleared(s.dest)
    clear()
}

/**
 * Where the plan's ✕ goes once the route is cleared, as the web's
 * clearRoute has it: back one level, to the card of the field the route
 * was flown to (Fly Here, which closes the cards onto the plan), as Maps'
 * directions go back to the place they were asked from; else the search.
 * Asked once: the ✕ after that is the search's.
 */
class RouteHome {
    // The field Fly Here last flew to from its card.
    private var flownTo: String? = null

    // The field whose card the empty plan's ✕ opens, until it is taken.
    private var under: String? = null

    fun flewTo(ident: String) {
        flownTo = ident.trim().uppercase()
    }

    /** The route to `dest` cleared: its card is the level under the empty
     *  plan where it was the field flown to, the search otherwise. */
    fun cleared(dest: String) {
        under = dest.trim().uppercase().takeIf { it.isNotEmpty() && it == flownTo }
    }

    /** The field to go back to as the plan closes, taken; none while the
     *  plan has a route (its ✕ shows the search, the route kept). */
    fun backTo(hasPoints: Boolean): String? {
        if (hasPoints) return null
        return under.also { under = null }
    }

    companion object {
        /** The app's one, written by the cards' Fly Here (RouteActions)
         *  and read by the plan's ✕ (RootScreen). */
        val shared = RouteHome()
    }
}
