package app.wingtipmaps.android.api

import app.wingtipmaps.android.api.generated.AlertsAhead
import app.wingtipmaps.android.api.generated.NearestAirports
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString

// The planner's and the gateway's calls a flight under way makes, as
// extensions of Planner and Gateway (Planner.kt and Gateway.kt are
// phase 0's; these are the flight pieces', beside them): what is ahead,
// the traffic about a point, a tracked airplane's state, and a saved
// flight's track. Each as the iOS app's Planner.swift and
// FlightExtras.swift have them.

/** What the airplane's track runs into in the next minutes
 *  (/api/airspace/ahead): the planner's alerts, in its words. Waits no
 *  longer than IN_FLIGHT_MS, so OwnShip falls back to the packs. */
suspend fun Planner.ahead(lat: Double, lon: Double, trackDeg: Double, groundspeedKt: Double, altitudeFt: Double?): List<AheadAlert> {
    // Whole degrees, knots and feet, so a flight's asks share the cache.
    val alt = altitudeFt?.let { Math.round(it).toDouble() }
    return inFlight.airspaceAhead(lat, lon, Math.round(trackDeg).toDouble(), Math.round(groundspeedKt).toDouble(), alt).planned().alerts
}

/** The fields nearest a point (/api/airports/nearest), nearest first, as
 *  the iOS app's Planner.nearest: asked in the air (Nearest, the glide
 *  ring's ground), so it waits no longer than IN_FLIGHT_MS. */
suspend fun Planner.nearest(lat: Double, lon: Double, limit: Int = 10): List<NearestAirport> =
    inFlight.nearestAirports(lat, lon, limit).planned().airports

/** The airplanes heard about a point (/api/traffic), out to a radius in nm. */
suspend fun Planner.traffic(lat: Double, lon: Double, radiusNm: Double): TrafficAnswer =
    api.trafficNear(lat, lon, Math.round(radiusNm).toDouble()).planned()

/** A tracked airplane's state now (/api/traffic/flight/{hex}/status). */
suspend fun Planner.flightStatus(hex: String): FlightStatus =
    api.trafficStatus(hex).planned()

/** The flown track kept with a saved flight (PUT /api/flights/{id}/track):
 *  own ship's path (OwnTrail.asSavedTrack) once the flight is saved. */
suspend fun Gateway.saveTrack(flight: Long, track: SavedTrack) {
    writes.saveTrack(flight, track).done()
}

/** A saved flight's track, or null where it has none (204, 404). */
suspend fun Gateway.track(flight: Long): SavedTrack? = api.track(flight).readOrNone(none = setOf(204, 404))
