package app.wingtipmaps.android.strip

import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.api.Leg
import app.wingtipmaps.android.api.Pilot
import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.engine.generated.routePosition
import app.wingtipmaps.android.format.Format
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import java.time.ZoneId

/**
 * The strip's figures and words apart from its screens: the flight as
 * rows in time from the plan the planner streamed (Plan.State), the
 * ribbon's points, where the airplane is along them, the pilot's
 * initials and the route's name (stripData.ts, identSchema's routeName);
 * every figure is written by Format. Every figure here is the
 * planner's; this file only orders them and writes them out. Pure, so it
 * is held on the JVM (StripDataTest).
 */

/** A finding, as the engine's go / no-go names them (lib/findings). */
enum class Finding { OK, CAUTION, STOP, UNKNOWN, PENDING }

/** The verdict over the flight, in the Brief's words (the engine's
 *  gonogo_verdict_line, once the brief is on this phone). */
data class Verdict(val finding: Finding, val words: String)

/** One of the glance's actions at the head: the finding and its action in
 *  a sentence, a tap into the Brief. At most three are shown. */
data class GlanceAction(val key: String, val finding: Finding, val line: String)

/** The route's other ways, each a chip at the head. */
data class Way(val key: String, val label: String)

/** A row of the strip in time, from the planner's legs. */
sealed interface StripRow {
    val key: String

    data class Departure(val ident: String) : StripRow {
        override val key get() = "dep"
    }

    /** A checkpoint, numbered as the nav log counts them, with the leg
     *  into it. */
    data class Checkpoint(val number: Int, val name: String, val leg: Leg, val minutesFlown: Double?) : StripRow {
        override val key get() = "cp$number"
    }

    /** A stop landed at, its minutes on the ground before the next leg
     *  (the planner's Leg.ground_min). */
    data class Stop(val ident: String, val leg: Leg, val minutesFlown: Double?, val groundMin: Double?) : StripRow {
        override val key get() = "stop:$ident:${leg.from}"
    }

    data class Destination(val ident: String, val leg: Leg, val minutesFlown: Double?) : StripRow {
        override val key get() = "dest"
    }
}

/** A point on the ribbon: a field (green) or a checkpoint (brown). */
data class RibbonPoint(val key: String, val field: Boolean, val name: String)

/** The airplane's place along the route: the leg it is on, from 0, and
 *  how far along it, 0 to 1. */
data class Position(val leg: Int, val along: Double)

object StripData {
    /**
     * The flight as rows: the departure, each leg's end as a checkpoint or
     * a field -- a leg's "to" is the ident where it ends at an airport
     * (wingtip.navlog names a field by its ident) and the checkpoint's own
     * name otherwise -- and the destination. The minutes flown to each are
     * the planner's ETEs added up, with the ground time at a stop, as the
     * web's nav log rows carry them; null once any leg cannot be flown.
     */
    fun rows(state: Plan.State): List<StripRow> {
        if (!state.routed || state.legs.isEmpty()) return emptyList()
        val fields = (state.stops + state.dest).map { it.uppercase() }.toSet()
        val out = mutableListOf<StripRow>(StripRow.Departure(state.dep))
        var minutes: Double? = 0.0
        var number = 0
        state.legs.forEachIndexed { i, leg ->
            minutes = leg.eteMin?.let { ete -> minutes?.plus(ete) }
            val at = minutes
            val to = leg.to.trim()
            val last = i == state.legs.lastIndex
            when {
                last -> out += StripRow.Destination(state.dest, leg, at)
                to.uppercase() in fields -> {
                    out += StripRow.Stop(to.uppercase(), leg, at, leg.groundMin)
                    minutes = leg.groundMin?.let { g -> minutes?.plus(g) } ?: minutes
                }
                else -> out += StripRow.Checkpoint(++number, to, leg, at)
            }
        }
        return out
    }

    /** The ribbon's points from the rows: the fields and the checkpoints,
     *  in order. */
    fun ribbonPoints(rows: List<StripRow>): List<RibbonPoint> = rows.map { row ->
        when (row) {
            is StripRow.Departure -> RibbonPoint(row.key, true, row.ident)
            is StripRow.Checkpoint -> RibbonPoint(row.key, false, row.name)
            is StripRow.Stop -> RibbonPoint(row.key, true, row.ident)
            is StripRow.Destination -> RibbonPoint(row.key, true, row.ident)
        }
    }

    /**
     * Where the airplane is along the route, for the ribbon: the leg it is
     * on and how far along it, the engine's `route_position` (the nearest
     * point of the planner's course line, laid against the legs' own
     * miles), the very answer the iPhone's strip asks -- a glance, not
     * navigation. Null with no fix or no line.
     */
    fun positionAlong(line: List<List<Double>>, legs: List<Leg>, lat: Double?, lon: Double?): Result<Position?> {
        if (lat == null || lon == null) return Result.success(null)
        return Engine.routePosition(
            at = EngineContract.RoutePositionInputAt(lat, lon),
            line = line.filter { it.size >= 2 },
            legs = legs.map { EngineContract.RoutePositionInputLegsItem(it.distanceNm, it.fuelGal) },
        ).map { at -> at?.let { Position(it.leg.toInt(), it.legFraction) } }
    }

    /** The pilot's initials from their name ("Asdaq Samir" is AS), or the
     *  first letter of their address; none signed out. */
    fun initialsOf(pilot: Pilot?): String {
        val name = pilot?.displayName?.trim()
        if (!name.isNullOrEmpty() && '@' !in name) {
            val parts = name.split(Regex("""\s+""")).filter { it.isNotEmpty() }
            val initials = if (parts.size > 1) "${parts.first()[0]}${parts.last()[0]}" else name.take(2)
            return initials.uppercase()
        }
        val address = pilot?.email ?: name
        return if (address.isNullOrEmpty()) "" else address[0].uppercase()
    }

    /** The clock some minutes after leaving, or null for a leg that
     *  cannot be flown. */
    fun timeAt(leaveMs: Long, minutes: Double?, zone: ZoneId = ZoneId.systemDefault()): String? =
        minutes?.let { Format.clock(leaveMs + (it * 60_000).toLong(), zone) }

    /** The route by its points, "C81 → KJVL → KDLH"; one airport to itself
     *  "KDLH local" (identSchema's routeName). */
    fun routeName(dep: String, dest: String, stops: List<String>): String =
        if (dep.isNotEmpty() && dep == dest && stops.isEmpty()) "$dep local" else (listOf(dep) + stops + dest).joinToString(" → ")

    /** The route's line under the verdict, as the canvas writes it: the
     *  route by its points, the airplane, the altitude as FL, when. This
     *  app's plan leaves at the planner's now. */
    fun headLine(state: Plan.State): String? {
        if (!state.routed) return null
        return listOfNotNull(
            routeName(state.dep, state.dest, state.stops),
            state.aircraft.uppercase().ifEmpty { null },
            state.legs.firstOrNull()?.altitudeFt?.let(Format::cruiseAltitude),
            "leaving now",
        ).joinToString(" · ")
    }

    /** The ribbon's figures at the right: the time aloft and the fuel. */
    fun ribbonFigures(state: Plan.State): String = listOfNotNull(
        state.totals?.eteMin?.let(Format::duration),
        state.totals?.fuelGal?.let(Format::fuel),
    ).joinToString(" · ")

    /** The checkpoint row's figures, "MH 318 · 24.0 nm". The heading needs
     *  the airplane's airspeed against the wind: with no airplane chosen the
     *  planner sends none, and the row writes the leg's magnetic course,
     *  "MC 312 · 24.0 nm" (decision 0011). */
    fun legFigures(leg: Leg): String {
        val heading = leg.magneticHeadingDeg
        val first = if (heading != null) "MH ${Format.headingFigures(heading)}" else "MC ${Format.headingFigures(leg.magneticCourseDeg)}"
        return "$first · ${Format.distance(leg.distanceNm)}"
    }

    /** The screens the field's chips offer, each handled as typed: how a
     *  pilot finds the rest without tabs (the web's stripSuggestions). */
    fun suggestions(state: Plan.State): List<String> = if (state.routed) {
        listOf("Brief me", "Weather at ${state.dest}", "Nav log", "Routes", "Altitude", "Procedures", "Stops", "Nearest fuel",
            "File flight plan", "Dry run", "Clearance", "My airplane", "Saved flights")
    } else {
        listOf("Nearest fuel", "Nearest airports", "Saved flights", "Favorites", "Recents", "My airplane", "Logbook", "Setup")
    }
}
