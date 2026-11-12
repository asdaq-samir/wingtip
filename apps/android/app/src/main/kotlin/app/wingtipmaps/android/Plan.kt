package app.wingtipmaps.android

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import app.wingtipmaps.android.airplane.AirplaneNow
import app.wingtipmaps.android.airplane.OwnAirplanes
import app.wingtipmaps.android.airplane.OwnRecord
import app.wingtipmaps.android.alternate.PlanAlternate
import app.wingtipmaps.android.altitude.PlanAltitudes
import app.wingtipmaps.android.api.Course
import app.wingtipmaps.android.api.Leg
import app.wingtipmaps.android.api.NavLogMessage
import app.wingtipmaps.android.api.NavLogTotals
import app.wingtipmaps.android.api.Planner
import app.wingtipmaps.android.engine.CyclePacks
import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.engine.generated.holdingLegMinutes
import app.wingtipmaps.android.flight.Geo
import app.wingtipmaps.android.flight.OwnShip
import app.wingtipmaps.android.plan.FlightChoices
import app.wingtipmaps.android.plan.KeptPlan
import app.wingtipmaps.android.plan.PlanShown
import app.wingtipmaps.android.route.RouteEdits
import app.wingtipmaps.android.route.RouteUndo
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import javax.inject.Inject

/**
 * The route being planned and what the planner has said of it so far: the course once its
 * ends are found, then the nav log's lines as they stream. The log before a re-plan stays until
 * the new one is whole (as the web's usePlan and iOS's Plan.swift keep it), so the list is
 * never blank. One State, changed only here and read by the screens.
 */
@HiltViewModel
class Plan @Inject constructor(app: Application) : AndroidViewModel(app) {
    data class State(
        val dep: String = "",
        val dest: String = "",
        val stops: List<String> = emptyList(),
        /** The planner's aircraft profile; "" for none, the default: no airplane is ever
         *  assumed (decision 0011), and the figures that need one are left out until one is chosen. */
        val aircraft: String = "",
        /** The holds the pilot put on the route, as the planner reads them
         *  (the engine's hold_write: "VPBNG/090/30:270:R:1M:2T"). */
        val holds: List<String> = emptyList(),
        val course: Course? = null,
        val legs: List<Leg> = emptyList(),
        val totals: NavLogTotals? = null,
        val stage: String? = null, // what the planner is doing now, in its words
        val problem: String? = null, // why there is no plan, in the planner's words
        val planning: Boolean = false,
        /** The point a Route Leg's Direct flies to, and the route as it was
         *  before, for its Cancel (the web's `direct` and `was`). */
        val direct: String? = null,
        val was: RouteEdits.Route? = null,
        /** The flight rules it was planned under (FlightChoices), "vfr" or "ifr". */
        val rules: String = "vfr",
        /** An altitude of the pilot's own, feet MSL, flown on every leg
         *  (the planner's `altitude_ft`, iOS's ownAltitudeFt); null for the
         *  planner's pick by 14 CFR 91.159 or 91.179. */
        val altitudeFt: Double? = null,
        /** When the flight leaves, an ISO 8601 instant (the planner's
         *  `depart`, the web's plan.depart); null for the planner's now. */
        val depart: String? = null,
        /** The pilot's own record of the airplane (its N-number's, else
         *  the type's: OwnAirplanes.applicable), its figures over the
         *  type's book, or the whole of an airplane of no stock type. */
        val own: OwnRecord? = null,
        /** When the nav log shown was planned (epoch ms), and whether it is
         *  the one kept for the air, shown with its age (KeptAgeLine). */
        val plannedAtMs: Long? = null,
        val kept: Boolean = false,
    ) {
        val routed: Boolean get() = dep.isNotEmpty() && dest.isNotEmpty()

        /** An airplane is chosen: time, fuel and groundspeed can be had. */
        val airplane: Boolean get() = AirplaneNow.plannerName(aircraft, own) != null
    }

    private val store = KeptPlan(app)
    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()

    private var running: Job? = null
    private var keepingPacks: Job? = null
    /** The plan last shown whole, put back where a re-plan fails (PlanShown). */
    private var shown: PlanShown? = null

    init {
        restore()
        // The pilot's own figures for the airplane flown: planned again on
        // them whenever they change (an ask answered, a profile edited).
        val records = OwnAirplanes.of(app).records
        val tail = FlightChoices.of(app).tail
        viewModelScope.launch {
            combine(records, tail, _state.map { it.aircraft }.distinctUntilChanged()) { r, t, a -> OwnAirplanes.applicable(r, t, a) }
                .distinctUntilChanged()
                .collect { own ->
                    if (own == _state.value.own) return@collect
                    _state.update { it.copy(own = own) }
                    if (_state.value.routed) plan()
                }
        }
    }

    /** The route as typed, planned: idents upper-cased as the planner
     *  reads them, empty stops left out. */
    fun plan(dep: String, dest: String, stops: List<String>) {
        val upper = stops.map { s -> s.trim().uppercase() }.filter { s -> s.isNotEmpty() }
        _state.update { it.copy(dep = dep.trim().uppercase(), dest = dest.trim().uppercase(), stops = upper, direct = null, was = null) }
        plan()
    }

    /** A Route Leg's Direct: from the airplane (else the departure) to the
     *  leg's end and on (RouteEdits.direct), the route kept for Cancel. */
    fun directToStop(ident: String, at: OwnShip.Fix?) {
        val s = _state.value
        val was = s.was ?: RouteEdits.Route(s.dep, s.stops, s.dest)
        val next = RouteEdits.direct(was, ident, at?.let(::positionIdent)) ?: return
        undoable(RouteUndo.Kind.DIRECT, ident)
        plan(next.dep, next.dest, next.stops)
        _state.update { it.copy(direct = ident, was = was) }
    }

    /** Cancel Direct: the route as it was before it. */
    fun cancelDirect() = _state.value.was?.let { plan(it.dep, it.dest, it.stops) }

    /** A Route Leg's Remove: the stop taken out of the route. */
    fun removeStop(ident: String) = restop(RouteUndo.Kind.REMOVED, ident, RouteEdits.without(_state.value.stops, ident))

    /** A point's Move Up and Move Down (RouteEdits.moved). */
    fun moveStop(ident: String, by: Int) = restop(RouteUndo.Kind.MOVED, ident, RouteEdits.moved(_state.value.stops, ident, by))

    /** A point's Add a Stop After (RouteEdits.insertedAfter). */
    fun addStopAfter(after: String, ident: String) = _state.value.let { s ->
        restop(RouteUndo.Kind.ADDED, ident.trim().uppercase(), RouteEdits.insertedAfter(RouteEdits.Route(s.dep, s.stops, s.dest), after, ident))
    }

    /** The route's stops changed by an edit, kept for its Undo first. */
    private fun restop(kind: RouteUndo.Kind, ident: String, stops: List<String>?) {
        val s = _state.value.takeIf { stops != null } ?: return
        undoable(kind, ident)
        plan(s.dep, s.dest, stops!!)
    }

    /** The last edit that changed the route, for its Undo (RouteUndoSnackbar). */
    val undo = RouteUndo()

    internal fun undoable(kind: RouteUndo.Kind, ident: String) {
        val s = _state.value
        // No route before it: nothing to go back to.
        if (!s.routed) return
        undo.took(kind, ident, RouteEdits.Route(s.dep, s.stops, s.dest), s.holds, s.direct, s.was)
    }

    /** Undo: the route, its holds and its Direct as they were before the
     *  last edit, planned again; Redo puts that edit back (the wide
     *  window's route toolbar). Each keeps the route it leaves for the other. */
    fun undoEdit() { undo.take()?.let { n -> undo.keepRedo(asNow(n)); reapply(n) } }

    fun redoEdit() { undo.takeRedo()?.let { n -> undo.keepUndo(asNow(n)); reapply(n) } }

    private fun asNow(n: RouteUndo.Note) = _state.value.let { s -> n.copy(route = RouteEdits.Route(s.dep, s.stops, s.dest), holds = s.holds, direct = s.direct, was = s.was) }

    private fun reapply(n: RouteUndo.Note) {
        _state.update { it.copy(holds = n.holds) }
        plan(n.route.dep, n.route.dest, n.route.stops)
        _state.update { it.copy(direct = n.direct, was = n.was) }
    }

    /** One of the planner's airplane types picked; the route, where there
     *  is one, planned again on its figures. */
    fun setAircraft(name: String) {
        _state.update { it.copy(aircraft = name) }
        if (_state.value.routed) plan()
    }

    /** The pilot's own altitude, feet MSL, or null for the planner's;
     *  the route, where there is one, planned again at it. */
    fun setAltitude(ft: Double?) {
        _state.update { it.copy(altitudeFt = ft) }
        if (_state.value.routed) plan()
    }

    /** When the flight leaves (an ISO 8601 instant), or null for now;
     *  the winds, the night and the times are the planner's for it. */
    fun setDepart(iso: String?) {
        _state.update { it.copy(depart = iso) }
        if (_state.value.routed) plan()
    }

    /** A trip planner's leg used (the iPhone's AskView.use, the web's
     *  changeOf): its route, its altitude where the planner chose one and
     *  its departure time, planned once. */
    fun useLeg(dep: String, dest: String, stops: List<String>, altitudeFt: Double?, depart: String?) {
        _state.update { it.copy(altitudeFt = altitudeFt, depart = depart) }
        plan(dep, dest, stops)
    }

    /** A route and its airplane picked together (About's Demo Flight), so
     *  the route is planned once, on that airplane's figures. */
    fun planIn(aircraft: String, dep: String, dest: String, stops: List<String>) {
        _state.update { it.copy(aircraft = aircraft) }
        plan(dep, dest, stops)
    }

    /** Plans the route as entered: the course first, for the map, then the
     *  nav log streamed in. */
    fun plan() {
        _state.update { it.copy(rules = FlightChoices.of(getApplication()).rules.value.word) }
        val asked = _state.value
        if (!asked.routed) return
        running?.cancel()
        _state.update { it.copy(planning = true, problem = null, stage = "Finding the route…") }
        running = viewModelScope.launch {
            try {
                val course = Planner.course(asked.dep, asked.dest, asked.stops)
                _state.update { it.copy(course = course) }
                val fresh = mutableListOf<Leg>()
                Planner.navlog(asked.dep, asked.dest, asked.stops, AirplaneNow.plannerQuery(asked.aircraft, asked.own), asked.holds, asked.rules, asked.altitudeFt, asked.depart, PlanAltitudes.query(listOf(asked.dep) + asked.stops + asked.dest) + PlanAlternate.query(asked.rules, asked.dest)).collect { message ->
                    when (message) {
                        is NavLogMessage.Stage -> _state.update { it.copy(stage = message.detail) }
                        is NavLogMessage.Altitude -> PlanAltitudes.heard(message.line)
                        is NavLogMessage.OneLeg -> {
                            fresh += message.leg
                            // Each leg as it comes, once the first is in: the
                            // old log stands until then.
                            _state.update { it.copy(legs = fresh.toList()) }
                        }
                        is NavLogMessage.Done -> {
                            _state.update { it.copy(legs = fresh.toList(), totals = message.totals, stage = null, plannedAtMs = AppClock.nowMs(), kept = false) }
                            shown = PlanShown.of(_state.value)
                            keep()
                            keepForTheAir()
                            holdWhenPlanned()
                        }
                        is NavLogMessage.Problem -> _state.update { it.copy(problem = message.error.detail, stage = null) }
                    }
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                // The plan shown before back whole, never a half-changed one, and why.
                val (back, reverted) = PlanShown.failed(_state.value, shown, e)
                _state.value = back
                if (reverted) undo.take()
            }
            _state.update { it.copy(planning = false) }
        }
    }

    /** A point of the chart a card sends the route to: a field, a VOR, a
     *  fix, or a place by its position ("@41.8800,-87.6300"). */
    data class ChartPoint(val ident: String, val lat: Double, val lon: Double)

    /** Fly Here: a new route from `from` (the airplane's position, else the
     *  route's departure) to the field. */
    fun flyHere(dest: String, from: String) {
        undoable(RouteUndo.Kind.FLY_HERE, dest)
        plan(from, dest, emptyList())
    }

    /** Direct To: from where the airplane is to the point, then on along
     *  the route, the point taken out of the stops after it. */
    fun directTo(point: ChartPoint, at: OwnShip.Fix) = directTo(point.ident, at)

    /** Direct To by ident alone: a card's, or a fix ATC named (atc/). */
    fun directTo(ident: String, at: OwnShip.Fix) {
        val s = _state.value
        val stops = listOf(ident) + s.stops.filterNot { it.equals(ident, ignoreCase = true) }
        plan(positionIdent(at), s.dest.ifEmpty { ident }, if (s.dest.isEmpty()) emptyList() else stops)
    }

    /** Add Stop and Add to Route: the point among the stops where it bends the route least
     *  (Geo.bestStopIndex, the engine's distances), planned again; else the pilot told why. */
    fun addToRoute(point: ChartPoint) {
        val s = _state.value
        val course = s.course ?: return
        val points = (listOf(course.departure) + course.stops.orEmpty() + course.destination).map { it.lat to it.lon }
        val at = Geo.bestStopIndex(points, point.lat, point.lon)
            .getOrElse { why -> return _state.update { it.copy(problem = "${point.ident} could not be put on the route: ${why.message}") } }
        plan(s.dep, s.dest, s.stops.toMutableList().apply { add(at.coerceAtMost(s.stops.size), point.ident) })
    }

    private var holdAt: String? = null

    /** Hold Here: a hold at the point, put on the route first where it is
     *  not on it, then set on the course flown into it once the log says
     *  what that is, as the web's and the iPhone's hold sheets set one:
     *  the standard pattern's right turns (AIM 5-3-8 j.2), the inbound
     *  leg's time at the leg's altitude -- "At or below 14,000 feet MSL: 1
     *  minute. Above 14,000 feet MSL: 1 1/2 minutes" (AIM 5-3-8 j.4(a)),
     *  the engine's holding_leg_minutes -- and two turns. Its entry,
     *  minutes and fuel are the planner's, from the engine's hold rules. */
    fun holdHere(point: ChartPoint) {
        holdAt = point.ident
        if (_state.value.legs.any { it.to.equals(point.ident, ignoreCase = true) }) holdWhenPlanned() else addToRoute(point)
    }

    private fun holdWhenPlanned() {
        val fix = holdAt ?: return
        val leg = _state.value.legs.firstOrNull { it.to.equals(fix, ignoreCase = true) } ?: return
        holdAt = null
        Engine.holdingLegMinutes(leg.altitudeFt).mapCatching { legMin ->
            val hold = EngineContract.RouteHoldIn(fix = fix, inbound = leg.magneticCourseDeg, right = true, legMin = legMin, turns = HOLD_TURNS)
            Engine.rule<EngineContract.HoldWriteInput, String>("hold_write", EngineContract.HoldWriteInput(hold)).getOrThrow()
        }.fold(
            { text ->
                _state.update { s -> s.copy(holds = s.holds.filterNot { it.startsWith("$fix/", ignoreCase = true) } + text) }
                plan()
            },
            { why -> _state.update { it.copy(problem = "The hold at $fix could not be written: ${why.message}") } },
        )
    }

    /** What is on the page, kept for the next launch. */
    private fun keep() {
        val s = _state.value
        if (!s.routed || s.course == null || s.totals == null) return
        store.write(KeptPlan.Kept(s.dep, s.dest, s.stops, s.aircraft, s.course, s.legs, s.totals, s.altitudeFt, s.depart, s.plannedAtMs))
    }

    /** The plan on the page kept now, whole, for the next launch with no
     *  signal (Ready to fly's Save). */
    fun save() = keep()

    /** Whether the plan on the page is the one kept, nav log and all, so
     *  it opens with no signal (ready_to_fly's plan_saved). */
    fun saved(): Boolean {
        val s = _state.value
        val kept = store.read() ?: return false
        return kept.dep == s.dep && kept.dest == s.dest && kept.stops == s.stops && kept.aircraft == s.aircraft && kept.totals != null
    }

    /** The cycle packs of the regions the route crosses (CyclePacks), once
     *  it is planned, so its airspace is answered with no connection (iOS's
     *  Plan.keepForTheAir). A job of its own: the next route's replaces it. */
    private fun keepForTheAir() {
        val line = _state.value.course?.courseLine ?: return
        val packs = CyclePacks.of(getApplication<Application>())
        keepingPacks?.cancel()
        keepingPacks = viewModelScope.launch {
            val regions = withContext(Dispatchers.Default) { CyclePacks.regions(line) }
            packs.keep(regions)
        }
    }

    /** The last plan kept, back on the page at launch: planned again when
     *  the planner answers, kept as it was when it does not. */
    fun restore() {
        val kept = store.read() ?: return
        _state.update {
            it.copy(dep = kept.dep, dest = kept.dest, stops = kept.stops, aircraft = kept.aircraft,
                course = kept.course, legs = kept.legs, totals = kept.totals, altitudeFt = kept.altitudeFt, depart = kept.depart,
                plannedAtMs = kept.plannedAtMs, kept = true)
        }
        shown = PlanShown.of(_state.value)
        plan()
    }

    /** The route cleared, and what was kept of it. */
    fun clear() {
        running?.cancel()
        shown = null
        _state.value = State(aircraft = _state.value.aircraft)
        store.clear()
    }

    companion object {
        /** A departure time as written (ISO 8601, with its offset or Z),
         *  in epoch milliseconds; null where there is none or it is not one. */
        fun departMs(iso: String?): Long? =
            iso?.let { runCatching { java.time.OffsetDateTime.parse(it).toInstant().toEpochMilli() }.getOrNull() }
        /** A hold's length where the pilot sets none: two turns, as the web's and iPhone's begin. */
        private const val HOLD_TURNS = 2.0

        /** The airplane's position as the planner reads a place for a
         *  route's end ("@41.8800,-87.6300,4500"), its altitude to the
         *  hundred feet where it has one (the web's positionIdent). */
        fun positionIdent(fix: OwnShip.Fix): String {
            val at = String.format(java.util.Locale.US, "@%.4f,%.4f", fix.lat, fix.lon)
            val ft = fix.altitudeFt
            return if (ft == null || ft < 0) at else "$at,${Math.round(ft / 100) * 100}"
        }
    }
}
