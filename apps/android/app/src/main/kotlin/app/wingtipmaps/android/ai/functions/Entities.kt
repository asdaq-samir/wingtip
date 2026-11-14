package app.wingtipmaps.android.ai.functions

import android.app.PendingIntent
import androidx.appfunctions.AppFunctionSerializable
import kotlinx.serialization.Serializable

// The things the app knows, as Gemini and the system's agents read them
// (AppFunctions' entities, docs/android-ai.md) and as the on-phone Ask's
// tools answer with them: each figure as the planner or the engine gave
// it, never one worked out here. Serializable twice over -- for
// AppFunctions across processes, and to JSON for Gemini Nano's tool
// answers in the app (AgentTools) -- so one class is both.

/** A field: its ident, name and place, its elevation, the METAR and TAF
 *  as sent with the flight category the planner gave, and its runways in
 *  NASR's words. */
@Serializable
@AppFunctionSerializable(isDescribedByKDoc = true)
data class AirportEntity(
    /** The FAA or ICAO ident, KPAO. */
    val ident: String,
    /** The field's name, as NASR has it. */
    val name: String,
    /** The town and state. */
    val place: String,
    /** Field elevation, feet above mean sea level, from NASR; null where it lists none. */
    val elevationFt: Double?,
    /** The latest METAR as sent; null where there is none. */
    val metar: String?,
    /** The TAF as sent; null where the field has none. */
    val taf: String?,
    /** VFR, MVFR, IFR or LIFR, as the planner classed the METAR. */
    val flightCategory: String?,
    /** Each runway as "13/31 2,443 ft asphalt", NASR's. */
    val runways: List<String>,
    /** Whether the field has a control tower. */
    val towered: Boolean,
    /** The link that opens the field's card in the app. */
    val link: String,
    /** "Closed indefinitely" or "Closed permanently" where NASR lists the field as closed: it is never to be offered or planned as a landing field. Null for an open field. */
    val closed: String? = null,
)

/** A radio frequency at a field, as NASR lists it. */
@Serializable
@AppFunctionSerializable(isDescribedByKDoc = true)
data class FrequencyEntity(
    /** The field's ident. */
    val ident: String,
    /** What it is for: TWR, GND, CTAF, ATIS. */
    val use: String,
    /** The frequency in MHz, as written: 118.600. */
    val mhz: String,
)

/** An instrument approach or other terminal chart at a field (d-TPP). */
@Serializable
@AppFunctionSerializable(isDescribedByKDoc = true)
data class ApproachEntity(
    /** The field's ident. */
    val ident: String,
    /** The chart's name: RNAV (GPS) RWY 31. */
    val name: String,
    /** The kind of chart: IAP, DP, STAR, APD. */
    val kind: String,
)

/** A point of the route, in its order. */
@Serializable
@AppFunctionSerializable(isDescribedByKDoc = true)
data class WaypointEntity(
    /** The ident: an airport, a navaid, a fix. */
    val ident: String,
    /** Where it is in the route, 0 for the departure. */
    val order: Int,
)

/** The route on the page: its points, and the nav log's totals as the
 *  planner worked them out. */
@Serializable
@AppFunctionSerializable(isDescribedByKDoc = true)
data class RouteEntity(
    /** The departure's ident. */
    val dep: String,
    /** The destination's ident. */
    val dest: String,
    /** Every point in order, departure and destination included. */
    val waypoints: List<WaypointEntity>,
    /** The airplane's type or N-number chosen; empty where none is chosen. */
    val airplane: String,
    /** Cruise altitude, feet MSL, where one is set. */
    val altitudeFt: Double?,
    /** The route's distance, nautical miles, from the planner. */
    val distanceNm: Double?,
    /** Time en route, minutes, from the nav log. */
    val eteMin: Double?,
    /** Fuel for the trip, gallons, from the nav log; null with no airplane. */
    val fuelGal: Double?,
    /** The departure time, ISO 8601 UTC; null for now. */
    val depart: String?,
    /** The link that opens this route in the app. */
    val link: String,
)

/** A NOTAM along the route, ranked by the engine for this flight. */
@Serializable
@AppFunctionSerializable(isDescribedByKDoc = true)
data class NotamEntity(
    /** The NOTAM's number. */
    val id: String,
    /** The field or facility it is for. */
    val field: String?,
    /** Its keyword: RWY, TWY, NAV, AIRSPACE. */
    val keyword: String?,
    /** Whether it closes something. */
    val closed: Boolean,
    /** Its rank for this flight, 1 first. */
    val rank: Int,
    /** The NOTAM as the FAA sent it. */
    val raw: String,
)

/** One of the pilot's airplanes, from their records. */
@Serializable
@AppFunctionSerializable(isDescribedByKDoc = true)
data class AirplaneEntity(
    /** The N-number. */
    val tail: String,
    /** The ICAO type designator: C172, PA28. */
    val type: String,
    /** Cruise true airspeed, knots, as the pilot set it. */
    val cruiseTasKt: Double,
    /** Fuel burn at cruise, gallons an hour, as the pilot set it. */
    val fuelBurnGph: Double,
)

/** A flight in the pilot's logbook (14 CFR 61.51). */
@Serializable
@AppFunctionSerializable(isDescribedByKDoc = true)
data class LogbookEntryEntity(
    /** The day flown, ISO 8601. */
    val flownOn: String,
    /** The airplane flown, its N-number or type. */
    val airplane: String?,
    /** The route as logged: KPAO KSQL. */
    val route: String?,
    /** Total time, hours. */
    val totalHours: Double,
    /** Night time, hours. */
    val nightHours: Double,
    /** Instrument time, hours. */
    val instrumentHours: Double,
    /** Day landings to a full stop or touch and go. */
    val dayLandings: Int,
    /** Night landings to a full stop. */
    val nightLandings: Int,
    /** Instrument approaches. */
    val approaches: Int,
    /** The pilot's remarks. */
    val remarks: String?,
)

/** The Brief's verdict for the route, as last worked out by the planner and
 *  the engine, with each finding. */
@Serializable
@AppFunctionSerializable(isDescribedByKDoc = true)
data class BriefEntity(
    /** The verdict in the engine's words. */
    val verdict: String,
    /** go, caution or no-go. */
    val finding: String,
    /** Each finding: its label and line. */
    val findings: List<String>,
    /** When it was worked out, ISO 8601 UTC. */
    val workedOutAt: String,
)

/** A screen of the app opened, or about to open. */
@AppFunctionSerializable(isDescribedByKDoc = true)
data class OpenedEntity(
    /** What was opened, in words. */
    val said: String,
    /** The link that opens it. */
    val link: String,
    /** Opens it, for an agent that shows the app. */
    val open: PendingIntent,
)

/** A field near the airplane, with the planner's distance and bearing. */
@Serializable
@AppFunctionSerializable(isDescribedByKDoc = true)
data class NearestEntity(
    /** The field's ident. */
    val ident: String,
    /** The field's name. */
    val name: String,
    /** Distance from the airplane, nautical miles. */
    val distanceNm: Double,
    /** Bearing from the airplane, degrees true. */
    val bearingDeg: Double,
    /** VFR, MVFR, IFR or LIFR from its METAR; null with no report. */
    val flightCategory: String?,
    /** Its longest runway, feet; null where NASR lists none. */
    val longestRunwayFt: Int?,
    /** The link that opens its card in the app. */
    val link: String,
)
