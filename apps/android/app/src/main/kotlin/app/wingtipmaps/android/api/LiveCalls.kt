package app.wingtipmaps.android.api

import app.wingtipmaps.android.api.generated.AirportAtis
import app.wingtipmaps.android.api.generated.AirportRvr
import app.wingtipmaps.android.api.generated.AirspaceAt
import app.wingtipmaps.android.api.generated.DepartureEvents
import app.wingtipmaps.android.api.generated.FlowAtAirports
import app.wingtipmaps.android.api.generated.SaaStatuses
import kotlinx.serialization.decodeFromString

// What the FAA's SWIM feeds say now, as the planner keeps it from ingest
// (app.routers.live), as extensions of Planner, each as the web's
// lib/api/client asks it: the D-ATIS, each runway's RVR, the Command
// Center's programs, special activity airspace's status from SFDPS, and a
// flight's tower departure events. What they mean for a flight is the
// engine's (read_datis, rvr_check, the Go / No-Go); the calls only fetch.

/** Idents as the planner's lists take them: upper case, once each. */
private fun idents(list: List<String>): String = list.map { it.trim().uppercase() }.filter { it.isNotEmpty() }.distinct().sorted().joinToString(",")

/** A field's D-ATIS with the engine's reading of each broadcast
 *  (/api/live/atis, wingtip.datis). */
suspend fun Planner.liveAtis(airport: String): AirportAtis =
    Gateway.json.decodeFromString(fetch("/api/live/atis", mapOf("airport" to airport.trim().uppercase())))

/** A field's runway visual range, end by end (/api/live/rvr, wingtip.rvr). */
suspend fun Planner.liveRvr(airport: String): AirportRvr =
    Gateway.json.decodeFromString(fetch("/api/live/rvr", mapOf("airport" to airport.trim().uppercase())))

/** The ground stops, delay programs and restrictions at these fields
 *  (/api/live/flow, wingtip.flow). */
suspend fun Planner.liveFlow(airports: List<String>): FlowAtAirports =
    Gateway.json.decodeFromString(fetch("/api/live/flow", mapOf("airports" to idents(airports))))

/** Special activity airspace's status now by designator (/api/live/saa,
 *  wingtip.saa); an area SFDPS never spoke of is left out. */
suspend fun Planner.liveSaa(designators: List<String>): SaaStatuses =
    Gateway.json.decodeFromString(fetch("/api/live/saa", mapOf("designators" to designators.filter { it.isNotBlank() }.distinct().sorted().joinToString(","))))

/** A flight's tower departure events by its call sign or registration,
 *  latest first (/api/live/departures, wingtip.departures). */
suspend fun Planner.liveDepartures(ident: String): DepartureEvents =
    Gateway.json.decodeFromString(fetch("/api/live/departures", mapOf("ident" to ident.trim().uppercase())))

/** What is over a point (/api/airspace/at): the classes in bands, the
 *  special-use areas and the TFRs there, as the web's airspace card asks. */
suspend fun Planner.airspaceAt(lat: Double, lon: Double): AirspaceAt =
    Gateway.json.decodeFromString(fetch("/api/airspace/at", mapOf("lat" to lat.toString(), "lon" to lon.toString())))
