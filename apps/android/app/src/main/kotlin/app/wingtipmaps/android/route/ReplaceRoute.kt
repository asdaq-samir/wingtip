package app.wingtipmaps.android.route

import app.wingtipmaps.android.Plan

/** A route typed, a trip's leg or a demo put in place of the one planned:
 *  where its ends change, its Undo is "Route Replaced" (the web's
 *  planHistory's describeEdit), the route before kept for it. */
fun Plan.replaceRoute(dep: String, dest: String, stops: List<String>) {
    val s = state.value
    if (!dep.trim().equals(s.dep, ignoreCase = true) || !dest.trim().equals(s.dest, ignoreCase = true)) undoable(RouteUndo.Kind.REPLACED, dest.trim().uppercase())
    plan(dep, dest, stops)
}
