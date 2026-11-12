package app.wingtipmaps.android.api

import app.wingtipmaps.android.api.generated.AirportSearch
import app.wingtipmaps.android.api.generated.TrafficFound
import kotlinx.serialization.decodeFromString

// The planner's calls the one search makes, beside Planner.kt's: the
// airport search with its named fixes and navaids, and an airplane named
// by its N-number. The models are the generated ones; none is written here.

/**
 * Fields by ident, name or town, then the named fixes and navaids whose
 * ident starts with the line (/api/airports/search with `fixes`), the
 * fields nearest `near` ("lat,lon") first among alike ones.
 */
suspend fun Planner.searchWithFixes(q: String, near: String?): List<AirportSuggestion> =
    api.airportSearch(q = q, fixes = true, near = near).planned().airports

/** An airplane named by its N-number (/api/traffic/find): the ones heard
 *  in the air, and the FAA registry's record of it (`registered`). */
suspend fun Planner.findAirplane(q: String): TrafficFound =
    api.trafficFind(q).planned()
