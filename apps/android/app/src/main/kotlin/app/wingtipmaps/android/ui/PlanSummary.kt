package app.wingtipmaps.android.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SegmentedListItem
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.wingtipmaps.android.AppClock
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.R
import app.wingtipmaps.android.alternate.AlternateStopRow
import app.wingtipmaps.android.alternate.PlanAlternate
import app.wingtipmaps.android.design.generated.WingtipSpace
import app.wingtipmaps.android.plan.PlanGround
import app.wingtipmaps.android.plan.PlanProcedures
import app.wingtipmaps.android.plan.RouteFieldFacts
import app.wingtipmaps.android.plan.RouteProcedures
import app.wingtipmaps.android.plan.StopTimes
import app.wingtipmaps.android.route.RoutePointMenu
import app.wingtipmaps.android.route.removeProcedure

/**
 * The route's fields in order, as the web's FPL timeline draws them (the
 * owner, 2026-11-19 to 21): where it departs, its stops, "Add a Stop",
 * where it arrives, and under IFR its alternate or "Add Alternate"
 * (AlternateStopRow), joined by one magenta line, each field's mark a dot
 * in its flight category's colour (RouteTimeline). Each row is a tap to
 * its field's card; at its end its times -- when it leaves, lands and
 * leaves again, a stop's leave a tap to set it -- and its menu (⋮,
 * RoutePointMenu: Direct To, Hold, Add a Stop After, Move, Remove). An
 * end not yet given asks for it ("Where from?", "Where to?") and opens
 * the search; Add a Stop opens the search for a field or fix on the way.
 * A field open by its card has its runways and the kinds of procedure
 * not picked under it (TimelineFieldParts), and a procedure picked there
 * its fixes as rows of the line, an arrival's and an approach's before
 * the field, a departure's after it (TimelineProcedureRows). Add a Stop's
 * end holds `toggle`, the round toggle to the route box (RouteBox), in the
 * group itself, not a row of its own (the owner, 2026-11-23).
 */
@Composable
fun RouteStops(
    plan: Plan,
    state: Plan.State,
    onField: (String) -> Unit,
    onFind: () -> Unit,
    onAddStop: () -> Unit,
    onAddStopAfter: (String) -> Unit,
    onPlate: (ident: String, procedure: String) -> Unit = { _, _ -> },
    model: RouteFieldFacts = hiltViewModel(),
    procedures: RouteProcedures = hiltViewModel(),
    toggle: (@Composable () -> Unit)? = null,
) {
    val course = state.course
    // Under IFR, the alternate after the destination (PlanAlternate).
    val ifr = state.rules == "ifr" && state.routed
    val filed by PlanAlternate.filed.collectAsStateWithLifecycle()
    val alternate = PlanAlternate.of(state.rules, state.dest, filed)
    val facts by model.facts.collectAsStateWithLifecycle()
    LaunchedEffect(state.dep, state.dest, state.stops) { model.load(listOf(state.dep) + state.stops + state.dest) }
    val picks by PlanProcedures.state.collectAsStateWithLifecycle()
    val lists by procedures.lists.collectAsStateWithLifecycle()
    val drawings by procedures.drawings.collectAsStateWithLifecycle()
    LaunchedEffect(facts) { procedures.load(facts.filterValues { it.open }.keys) }
    LaunchedEffect(picks.picks) { procedures.loadDrawings(picks.picks) }
    // The times at each point, from the plan's departure time or now,
    // where the airplane gives the legs' times (decision 0011).
    val departMs = Plan.departMs(state.depart) ?: AppClock.nowMs()
    val times = if (state.airplane) StopTimes.of(departMs, state.legs.map { StopTimes.LegTime(it.to, it.eteMin, it.groundMin) }, state.stops) else emptyMap()
    val idents = listOf(state.dep) + state.stops + state.dest
    val zones = idents.mapIndexed { i, id -> (i - 1) to facts[id.uppercase()]?.zone }.toMap()
    val said = StopTimes.zonesSaid(times, zones)
    // A field's procedures on the line once its card says it is open:
    // those landed by before its row, those left by after it.
    fun picksAt(at: Int, kinds: List<String>): List<PlanProcedures.Pick> {
        val ident = idents[at + 1]
        val lands = kinds == PlanProcedures.ARRIVING && at >= 0
        val leaves = kinds == PlanProcedures.LEAVING && at < state.stops.size
        return if (facts[ident.uppercase()]?.open == true && (lands || leaves)) PlanProcedures.at(picks, ident, kinds) else emptyList()
    }
    fun rows(list: List<PlanProcedures.Pick>) = list.sumOf { procedureRows(drawings[RouteProcedures.drawingKey(it)]) }
    val points = -1..state.stops.size
    // Material 3 Expressive's segmented list: the route's rows as one
    // rounded group with small gaps between them, the line through them.
    val count = state.stops.size + 3 + (if (ifr) 1 else 0) + points.sumOf { rows(picksAt(it, PlanProcedures.ARRIVING)) + rows(picksAt(it, PlanProcedures.LEAVING)) }
    val gap = ListItemDefaults.SegmentedGap
    val replan = { plan.plan() }
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(gap)) {
        var index = 0
        fun point(at: Int) = Point(at, idents[at + 1], facts[idents[at + 1].uppercase()]?.category, times[at], zones[at], said, StopTimes.Left(departMs, zones[-1]))

        @Composable
        fun picked(list: List<PlanProcedures.Pick>) = list.forEach { pick ->
            val drawing = drawings[RouteProcedures.drawingKey(pick)]
            TimelineProcedureRows(pick, drawing, lists[pick.ident.uppercase()], picks, index, count, replan, { plan.removeProcedure(pick) }, { onPlate(pick.ident, pick.id) })
            index += procedureRows(drawing)
        }

        @Composable
        fun fieldRows(at: Int, name: String?, role: Int, ask: Int, last: Boolean) {
            picked(picksAt(at, PlanProcedures.ARRIVING))
            val p = point(at)
            StopRow(plan, p, name, role, ask, index++, count, onField, onFind, onAddStopAfter, last) {
                TimelineFieldParts(p.ident, lands = at >= 0, leaves = at < state.stops.size, facts[p.ident.uppercase()], lists[p.ident.uppercase()], picks, replan)
            }
            picked(picksAt(at, PlanProcedures.LEAVING))
        }
        fieldRows(-1, course?.departure?.name, R.string.route_depart, R.string.where_from, last = false)
        state.stops.forEachIndexed { i, _ -> fieldRows(i, course?.stops?.getOrNull(i)?.name, R.string.route_stop, R.string.where_to, last = false) }
        val thread = rememberThread()
        SegmentedListItem(
            onClick = onAddStop,
            enabled = state.routed,
            shapes = ListItemDefaults.segmentedShapes(index = index++, count = count),
            leadingContent = { TimelineMark(thread) { Icon(Icons.Filled.Add, contentDescription = null, tint = MaterialTheme.colorScheme.primary) } },
            trailingContent = toggle,
            modifier = Modifier.fillMaxWidth().timelineThread(thread, first = false, last = false, dot = null, gap = gap),
            content = { Text(stringResource(R.string.wording_add_stop), color = if (state.routed) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant) },
        )
        fieldRows(state.stops.size, course?.destination?.name, R.string.route_arrive, R.string.where_to, last = true)
        if (ifr) AlternateStopRow(alternate, index, count, onField)
    }
}

/** A point of the route as its row shows it: where it is in the route
 *  (-1 the departure), its ident, its mark's category, its times. */
private class Point(val at: Int, val ident: String, val category: String?, val times: StopTimes.At?, val zone: java.time.ZoneId?, val zonesSaid: Boolean, val left: StopTimes.Left)

@Composable
private fun StopRow(
    plan: Plan,
    point: Point,
    name: String?,
    role: Int,
    ask: Int,
    index: Int,
    count: Int,
    onField: (String) -> Unit,
    onFind: () -> Unit,
    onAddStopAfter: (String) -> Unit,
    last: Boolean = false,
    parts: @Composable () -> Unit = {},
) {
    val ident = point.ident
    val given = ident.isNotEmpty()
    val thread = rememberThread()
    val stop = point.at >= 0 && point.times?.leaveMs != null
    SegmentedListItem(
        onClick = { if (given) onField(ident) else onFind() },
        shapes = ListItemDefaults.segmentedShapes(index = index, count = count),
        leadingContent = { TimelineMark(thread) },
        supportingContent = {
            Column {
                Text(listOfNotNull(stringResource(role), name).joinToString(" · "), color = MaterialTheme.colorScheme.onSurfaceVariant)
                parts()
            }
        },
        trailingContent = if (!given) null else ({
            PointEnd(
                times = {
                    PointTimes(point.times, point.zone, point.zonesSaid, point.left, onLeave = if (stop) ({ h, m ->
                        point.times.arriveMs?.let { landed -> PlanGround.set(ident, StopTimes.groundFor(landed, h, m)) }
                        plan.plan()
                    }) else null)
                },
                menu = { RoutePointMenu(ident, plan, onAddStopAfter) },
            )
        }),
        // A field or a fix given drags out to another app as its ident (DragOut).
        modifier = Modifier.fillMaxWidth().timelineThread(thread, first = index == 0, last = last, dot = markColour(point.category), gap = ListItemDefaults.SegmentedGap)
            .then(if (given) Modifier.dragOut { DragOut.place(ident) } else Modifier),
        content = { Text(if (given) ident else stringResource(ask), color = if (given) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.primary) },
    )
}
