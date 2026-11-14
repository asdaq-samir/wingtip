package app.wingtipmaps.android.api

import app.wingtipmaps.android.api.generated.AircraftRegistration
import app.wingtipmaps.android.api.generated.AirplaneDetails
import app.wingtipmaps.android.api.generated.AirplanePhoto
import app.wingtipmaps.android.api.generated.PastFlight
import app.wingtipmaps.android.api.generated.PastFlights
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.SerializationException

// The planner's calls an airplane's card makes (the owner's P1,
// 2026-11-14): its FAA record by itself, at once; the rest of its public
// record; its photo; and its past flights by its ICAO address. The models
// are the generated ones; none is written here.

/** The FAA's record of an N-number or ICAO address (/api/traffic/registered),
 *  from the planner's own disk, so it answers in milliseconds where
 *  /api/traffic/find waits on the live sources: null for any other name.
 *  Asked apart from the find, so the record is drawn before the find
 *  answers (the owner, 2026-11-14: "Why does looking up a plane takes a
 *  long time?"). */
suspend fun Planner.registered(q: String): AircraftRegistration? = try {
    api.trafficRegistered(q).plannedOrNone(setOf(404, 422))
} catch (e: SerializationException) {
    // The planner's `null`: no record by that name.
    null
}

/** Everything public about a US airplane (/api/airplanes/{n_number}): its
 *  registration in full, the FAA's make, model and engine references, its
 *  past registrations, documents, reservation, NTSB cases and where it is
 *  usually based (`based_pending` while that is looked up). */
suspend fun Planner.airplaneDetails(nNumber: String): AirplaneDetails = api.airplane(nNumber).planned()

/** The newest photo of this very airplane on Planespotters.net, or null
 *  where it has none or the call cannot be had now: shown only where it
 *  answers, with its photographer beside it (their terms). */
suspend fun Planner.airplanePhoto(nNumber: String): AirplanePhoto? = try {
    api.airplanePhoto(nNumber).plannedOrNone(setOf(404, 422))
} catch (e: CancellationException) {
    throw e
} catch (e: Exception) {
    null
}

/** The airplane's past flights by its ICAO address, newest first
 *  (/api/traffic/flight/{hex}/history: adsb.lol's archive, about six weeks). */
suspend fun Planner.pastFlights(hex: String): PastFlights = api.trafficHistory(hex.lowercase()).planned()

/** One past flight's track, its points as heard (/api/traffic/flight/{hex}/history/{id}). */
suspend fun Planner.pastFlight(hex: String, id: Int): PastFlight = api.trafficPastFlight(hex.lowercase(), id).planned()
