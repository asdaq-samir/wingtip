package app.wingtipmaps.android.api

// The shapes of a flight under way -- the airplanes heard about the map,
// a tracked airplane's state, a flown path and the track a saved flight
// keeps -- generated from the planner's and the gateway's documents
// (api/generated), under the names the app uses.

/** An airplane ADS-B receivers hear (TrafficAircraft, wingtip.traffic):
 *  its transponder's code, where it sends one, is said in words on its
 *  card for 7500, 7600 and 7700 (AIM 6-2-2, 6-3-4, 6-4-2). */
typealias TrafficAircraft = app.wingtipmaps.android.api.generated.TrafficAircraft

/** What it is called on the screen: its call sign, else its tail, else
 *  its ICAO address. */
val TrafficAircraft.name: String get() = callsign ?: registration ?: hex

/** The airplanes about a point (Traffic): which receivers' data, and how
 *  old the answer was when sent. */
typealias TrafficAnswer = app.wingtipmaps.android.api.generated.Traffic

/** The field a tracked airplane took off from or landed at (PastFlightField). */
typealias PastFlightField = app.wingtipmaps.android.api.generated.PastFlightField

/** Where and when an airplane last landed (FlightArrival). */
typealias FlightArrival = app.wingtipmaps.android.api.generated.FlightArrival

/** An airplane's state now, for the watches set on it (FlightStatus). */
typealias FlightStatus = app.wingtipmaps.android.api.generated.FlightStatus

/** A point of a flown path (TrailPoint): when (s since 1970), where, how
 *  high (feet; null on the ground or where it was not sent). The iOS
 *  app's PathPoint and the web's, kept the same so a path moves between
 *  them. */
typealias PathPoint = app.wingtipmaps.android.api.generated.TrailPoint

/** A saved flight's flown track as the gateway keeps it (TrackDto): t in
 *  ms since 1970, GPS altitude in feet. */
typealias SavedTrack = app.wingtipmaps.android.api.generated.gateway.TrackDto
typealias SavedTrackPoint = app.wingtipmaps.android.api.generated.gateway.TrackPointDto
