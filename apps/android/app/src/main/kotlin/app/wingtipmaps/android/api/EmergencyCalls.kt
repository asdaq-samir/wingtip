package app.wingtipmaps.android.api

import app.wingtipmaps.android.api.generated.CopilotAround
import app.wingtipmaps.android.api.generated.EmergencyFields
import kotlinx.serialization.decodeFromString

// The planner's calls the flight's assistants make in the air -- the
// emergency assistant and the copilot -- as extensions of Planner, each
// as the web's lib/api/client asks it. Public: an emergency asks no
// sign-in. Each waits no longer than IN_FLIGHT_MS, so one bar of signal
// never holds a screen up.

/** What the emergency assistant ranks (/api/emergency/fields): the fields
 *  round a position with their runways, METARs, frequencies and phone,
 *  the modelled wind at the altitude, and the stock profile's glide
 *  (none for no airplane: the glide is not guessed). */
suspend fun Planner.emergencyFields(lat: Double, lon: Double, altitudeFt: Double?, aircraft: String?): EmergencyFields =
    Gateway.json.decodeFromString(
        fetch(
            "/api/emergency/fields",
            mapOf("lat" to lat.toString(), "lon" to lon.toString(), "altitude_ft" to altitudeFt?.toString(), "aircraft" to aircraft?.ifEmpty { null }),
            timeoutMs = IN_FLIGHT_MS,
        ),
    )

/** The copilot's reports round the airplane (/api/copilot/around): the
 *  fields near it and the destination with their weather, runways and
 *  fuel; the TFRs, active special-use areas and convective SIGMETs on the
 *  rest of the route ("lat,lon;…"); ITWS at the destination and alternate. */
suspend fun Planner.copilotAround(lat: Double, lon: Double, dest: String, alternate: String?, path: String): CopilotAround =
    Gateway.json.decodeFromString(
        fetch(
            "/api/copilot/around",
            mapOf("lat" to lat.toString(), "lon" to lon.toString(), "dest" to dest, "alternate" to alternate, "path" to path),
            timeoutMs = IN_FLIGHT_MS,
        ),
    )
