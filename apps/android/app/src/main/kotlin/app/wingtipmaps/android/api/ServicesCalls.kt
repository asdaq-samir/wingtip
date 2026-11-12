package app.wingtipmaps.android.api

import app.wingtipmaps.android.api.generated.AirportServices
import kotlinx.serialization.decodeFromString

/** What a field offers on the ground (/api/airport/{ident}/services):
 *  its fuel, the remarks on it in words (the engine's remarks_read) and as
 *  written, what else is on the field and the places near it. The
 *  airport card's Fuel rows read it. */
suspend fun Planner.airportServices(ident: String): AirportServices =
    api.airportServices(ident).planned()
