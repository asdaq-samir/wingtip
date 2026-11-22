package app.wingtipmaps.android.route

import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.plan.PlanProcedures
import app.wingtipmaps.android.plan.PlanTanks

/**
 * The plan's Undo and Redo (Plan.undo, RouteUndoSnackbar, the wide
 * window's RouteToolbar): what an edit is about to change kept first --
 * the route, its holds, its Direct, the fuel set at its fields and the
 * procedures, runways and crossings picked on its line (PlanProcedures) --
 * and put back. Out of Plan.kt, which had reached its 400 lines.
 */
fun Plan.undoable(kind: RouteUndo.Kind, ident: String) {
    val s = state.value
    // No route before it: nothing to go back to.
    if (!s.routed) return
    undo.took(kind, ident, RouteEdits.Route(s.dep, s.stops, s.dest), s.holds, s.direct, s.was, PlanTanks.state.value.own, PlanProcedures.state.value)
}

/** Undo: the plan as it was before the last edit, planned again; Redo
 *  puts that edit back. Each keeps the plan it leaves for the other. */
fun Plan.undoEdit() {
    undo.take()?.let { n ->
        undo.keepRedo(asNow(n))
        reapply(n)
    }
}

fun Plan.redoEdit() {
    undo.takeRedo()?.let { n ->
        undo.keepUndo(asNow(n))
        reapply(n)
    }
}

/** A procedure taken off a field from its head row's menu (None), kept
 *  for the Snackbar's Undo first ("ILS RWY 36 Removed"), as a stop's
 *  removal is; planned again without it. */
fun Plan.removeProcedure(pick: PlanProcedures.Pick) {
    undoable(RouteUndo.Kind.REMOVED, pick.name)
    PlanProcedures.pick(pick.ident, pick.kind, null)
    plan()
}

private fun Plan.asNow(n: RouteUndo.Note) = state.value.let { s ->
    n.copy(
        route = RouteEdits.Route(s.dep, s.stops, s.dest), holds = s.holds, direct = s.direct, was = s.was,
        tanks = PlanTanks.state.value.own, procedures = PlanProcedures.state.value,
    )
}

private fun Plan.reapply(n: RouteUndo.Note) {
    put { it.copy(holds = n.holds) }
    PlanTanks.restore(n.tanks)
    n.procedures?.let(PlanProcedures::restore)
    plan(n.route.dep, n.route.dest, n.route.stops)
    put { it.copy(direct = n.direct, was = n.was) }
}
