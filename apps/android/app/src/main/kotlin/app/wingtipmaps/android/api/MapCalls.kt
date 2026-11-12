package app.wingtipmaps.android.api

import app.wingtipmaps.android.api.generated.AirportsInView
import kotlinx.serialization.decodeFromString

// The planner's calls the map makes beside its tiles, as extensions of
// Planner (the flight pieces' are FlightCalls.kt): the fields that
// report, for their weather pips, and the deployment's Google key, for
// the street map close in. Each as the web's lib/api/client has them.

/** The fields with a METAR in a box (/api/airports/in-view with
 *  `reporting`), each with its flight category, which the planner works
 *  out by the engine's `flight_category` (AIM 7-1-7): what the overlay
 *  tiles' airports wear their weather pips from, joined by ident, as the
 *  web's AirportsGl joins them. Up to a thousand, the planner's most. */
suspend fun Planner.reportingInView(south: Double, west: Double, north: Double, east: Double): List<AirportPin> =
    api.airportsInView(box(south), box(west), box(north), box(east), limit = 1000, reporting = true).planned().airports

/** A box's edge to a thousandth of a degree, so a map moved a little asks
 *  the same box and is answered from the cache. */
private fun box(deg: Double): Double = Math.round(deg * 1000) / 1000.0

/** The route's briefing (/api/briefing), for what the map marks of it:
 *  each field's METAR now and the TAF stations' worst within an hour of
 *  the flight's time there (`forecast.stations`, `eta_*`), the flight
 *  timed from `depart` (now where none) over `eteMin`. */
suspend fun Planner.routeBriefing(dep: String, dest: String, stops: List<String>, depart: String?, eteMin: Double?): app.wingtipmaps.android.api.generated.Briefing =
    api.briefing(dep, dest, stops.joinToString(","), depart, eteMin?.let { Math.round(it * 10) / 10.0 }).planned()
