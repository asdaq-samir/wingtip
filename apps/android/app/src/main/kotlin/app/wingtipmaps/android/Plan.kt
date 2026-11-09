package app.wingtipmaps.android

import android.app.Application
import android.content.Context
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import app.wingtipmaps.android.api.Course
import app.wingtipmaps.android.api.Gateway
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
import app.wingtipmaps.android.route.RouteEdits
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import java.io.IOException

/**
 * The route being planned and what the planner has said of it so far: the
 * course as soon as its ends are found, then the nav log's lines as they
 * stream. The log before a re-plan stays on the page until the new one is
 * whole, as the web app keeps it (usePlan) and the iOS app's Plan.swift
 * does, so the pilot is never looking at a blank list. One State, changed
 * only here and read by the screens (unidirectional data flow).
 */
class Plan(app: Application) : AndroidViewModel(app) {
    data class State(
        val dep: String = "",
        val dest: String = "",
        val stops: List<String> = emptyList(),
        /** The planner's aircraft profile; "" for none, the default:
         *  no airplane is ever assumed (decision 0011), and the figures
         *  that need one are left out until one is chosen. */
        val aircraft: String = "",
        /** The holds the pilot put on the route, as the planner reads them
         *  (the engine's hold_write: "VPBNG/090/30:270:R:1M:2T"). */
        val holds: List<String> = emptyList(),
        val course: Course? = null,
        val legs: List<Leg> = emptyList(),
        val totals: NavLogTotals? = null,
        /** What the planner is doing now, in its words; null when done. */
        val stage: String? = null,
        /** Why there is no plan, in the planner's words; null when there is. */
        val problem: String? = null,
        val planning: Boolean = false,
        /** The point a Route Leg's Direct flies to, and the route as it was
         *  before, for its Cancel (the web's `direct` and `was`). */
        val direct: String? = null,
        val was: RouteEdits.Route? = null,
        /** The flight rules it was planned under (FlightChoices), "vfr" or "ifr". */
        val rules: String = "vfr",
    ) {
        val routed: Boolean get() = dep.isNotEmpty() && dest.isNotEmpty()

        /** An airplane is chosen: time, fuel and groundspeed can be had. */
        val airplane: Boolean get() = aircraft.isNotEmpty()
    }

    private val prefs = app.getSharedPreferences("plan", Context.MODE_PRIVATE)

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()

    private var running: Job? = null
    private var keepingPacks: Job? = null

    init {
        restore()
    }

    /** The route as typed, planned: idents upper-cased as the planner
     *  reads them, empty stops left out. */
    fun plan(dep: String, dest: String, stops: List<String>) {
        _state.update {
            it.copy(
                dep = dep.trim().uppercase(),
                dest = dest.trim().uppercase(),
                stops = stops.map { s -> s.trim().uppercase() }.filter { s -> s.isNotEmpty() },
                direct = null, was = null,
            )
        }
        plan()
    }

    /** A Route Leg's Direct: from the airplane (else the departure) to the
     *  leg's end and on (RouteEdits.direct), the route kept for Cancel. */
    fun directToStop(ident: String, at: OwnShip.Fix?) {
        val s = _state.value
        val was = s.was ?: RouteEdits.Route(s.dep, s.stops, s.dest)
        val next = RouteEdits.direct(was, ident, at?.let(::positionIdent)) ?: return
        plan(next.dep, next.dest, next.stops)
        _state.update { it.copy(direct = ident, was = was) }
    }

    /** Cancel Direct: the route as it was before it. */
    fun cancelDirect() {
        val was = _state.value.was ?: return
        plan(was.dep, was.dest, was.stops)
    }

    /** A Route Leg's Remove: the stop taken out of the route. */
    fun removeStop(ident: String) {
        val s = _state.value
        plan(s.dep, s.dest, RouteEdits.without(s.stops, ident))
    }

    /** One of the planner's airplane types picked; the route, where there
     *  is one, planned again on its figures. */
    fun setAircraft(name: String) {
        _state.update { it.copy(aircraft = name) }
        if (_state.value.routed) plan()
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
                Planner.navlog(asked.dep, asked.dest, asked.stops, asked.aircraft, asked.holds, asked.rules).collect { message ->
                    when (message) {
                        is NavLogMessage.Stage -> _state.update { it.copy(stage = message.detail) }
                        is NavLogMessage.Altitude -> {}
                        is NavLogMessage.OneLeg -> {
                            fresh += message.leg
                            // Each leg as it comes, once the first is in: the
                            // old log stands until then.
                            _state.update { it.copy(legs = fresh.toList()) }
                        }
                        is NavLogMessage.Done -> {
                            _state.update { it.copy(legs = fresh.toList(), totals = message.totals, stage = null) }
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
                // With no connection the plan kept stands, in silence; a
                // planner's own refusal is said as it is.
                _state.update {
                    val said = if (it.legs.isEmpty() || e !is IOException) e.message ?: "The planner could not be reached." else it.problem
                    it.copy(problem = said, stage = null)
                }
            }
            _state.update { it.copy(planning = false) }
        }
    }

    /** A point of the chart a card sends the route to: a field, a VOR, a
     *  fix, or a place by its position ("@41.8800,-87.6300"). */
    data class ChartPoint(val ident: String, val lat: Double, val lon: Double)

    /** Fly Here: a new route from `from` (the airplane's position, else the
     *  route's departure) to the field. */
    fun flyHere(dest: String, from: String) = plan(from, dest, emptyList())

    /** Direct To: from where the airplane is to the point, then on along
     *  the route, the point taken out of the stops after it. */
    fun directTo(point: ChartPoint, at: OwnShip.Fix) = directTo(point.ident, at)

    /** Direct To by ident alone: a card's, or a fix ATC named (atc/). */
    fun directTo(ident: String, at: OwnShip.Fix) {
        val s = _state.value
        val stops = listOf(ident) + s.stops.filterNot { it.equals(ident, ignoreCase = true) }
        plan(positionIdent(at), s.dest.ifEmpty { ident }, if (s.dest.isEmpty()) emptyList() else stops)
    }

    /** Add Stop and Add to Route: the point among the stops where it
     *  bends the route least (Geo.bestStopIndex), the route planned again. */
    fun addToRoute(point: ChartPoint) {
        val s = _state.value
        val course = s.course ?: return
        val points = (listOf(course.departure) + course.stops.orEmpty() + course.destination).map { it.lat to it.lon }
        val at = Geo.bestStopIndex(points, point.lat, point.lon).coerceAtMost(s.stops.size)
        plan(s.dep, s.dest, s.stops.toMutableList().apply { add(at, point.ident) })
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
    @Serializable
    private class Kept(
        val dep: String,
        val dest: String,
        val stops: List<String>,
        val aircraft: String,
        val course: Course? = null,
        val legs: List<Leg> = emptyList(),
        val totals: NavLogTotals? = null,
    )

    private fun keep() {
        val s = _state.value
        if (!s.routed || s.course == null || s.totals == null) return
        val kept = Kept(s.dep, s.dest, s.stops, s.aircraft, s.course, s.legs, s.totals)
        prefs.edit().putString(KEY, Gateway.json.encodeToString(kept)).apply()
    }

    /** The cycle packs of the regions the route crosses (CyclePacks),
     *  fetched once the route is planned, so the airspace there, what is
     *  ahead in the air and a clearance's places are answered with no
     *  connection: the iOS app's Plan.keepForTheAir does the same. A job
     *  of its own, so a re-plan does not cut it short, and the next
     *  route's keep replaces one still running (the files are each
     *  written whole, so nothing is left half kept). */
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
        val kept = prefs.getString(KEY, null)?.let { text ->
            runCatching { Gateway.json.decodeFromString<Kept>(text) }.getOrNull()
        } ?: return
        _state.update {
            it.copy(dep = kept.dep, dest = kept.dest, stops = kept.stops, aircraft = kept.aircraft,
                course = kept.course, legs = kept.legs, totals = kept.totals)
        }
        plan()
    }

    /** The route cleared, and what was kept of it. */
    fun clear() {
        running?.cancel()
        _state.value = State(aircraft = _state.value.aircraft)
        prefs.edit().remove(KEY).apply()
    }

    companion object {
        private const val KEY = "kept"
        /** A hold's length where the pilot sets none: two turns, as the
         *  web's and the iPhone's hold sheets begin. */
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
