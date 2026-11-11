package app.wingtipmaps.android.route

import app.wingtipmaps.android.Plan

/** Depart From, a field card's action: the field the route's departure,
 *  its stops and its destination kept (none yet: the plan asks where
 *  to), the route as it was kept for its Undo. */
fun Plan.departFrom(dep: String) {
    undoable(RouteUndo.Kind.DEPART_FROM, dep)
    state.value.let { plan(dep, it.dest, it.stops) }
}
