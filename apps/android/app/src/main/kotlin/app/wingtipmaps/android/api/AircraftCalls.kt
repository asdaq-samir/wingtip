package app.wingtipmaps.android.api

import app.wingtipmaps.android.api.generated.gateway.AircraftDto
import app.wingtipmaps.android.api.generated.gateway.AircraftRequest
import app.wingtipmaps.android.api.generated.gateway.HandbookFigures
import app.wingtipmaps.android.api.generated.gateway.HandbookRequest
import app.wingtipmaps.android.api.generated.gateway.OwnFigures
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString

// The pilot's own airplanes the gateway keeps (/api/aircraft), as the
// web's and the iPhone's aircraft calls: signed in only, each the
// pilot's; the gateway holds the record and works no figure out.

/** The pilot's airplanes; null signed out. */
suspend fun Gateway.aircraft(): List<AircraftDto>? = read("/api/aircraft")

/** An airplane added (POST /api/aircraft). */
suspend fun Gateway.addAircraft(request: AircraftRequest): AircraftDto =
    json.decodeFromString(send("POST", "/api/aircraft", json = json.encodeToString(request)))

/** An airplane's record replaced (PUT /api/aircraft/{id}). */
suspend fun Gateway.updateAircraft(id: Long, request: AircraftRequest): AircraftDto =
    json.decodeFromString(send("PUT", "/api/aircraft/$id", json = json.encodeToString(request)))

/** The handbook figures its pilot confirmed from a photographed page
 *  (PUT /api/aircraft/{id}/handbook); null takes them away. */
suspend fun Gateway.saveHandbook(id: Long, figures: HandbookFigures?): AircraftDto =
    json.decodeFromString(send("PUT", "/api/aircraft/$id/handbook", json = json.encodeToString(HandbookRequest(figures))))

/** An airplane and everything kept with it deleted (DELETE /api/aircraft/{id}). */
suspend fun Gateway.deleteAircraft(id: Long) {
    send("DELETE", "/api/aircraft/$id")
}

/** The pilot's own handbook figures added to the record, only those given
 *  (PUT /api/aircraft/{id}/figures): the inline ask's one figure. */
suspend fun Gateway.saveFigures(id: Long, figures: OwnFigures): AircraftDto =
    json.decodeFromString(send("PUT", "/api/aircraft/$id/figures", json = json.encodeToString(figures)))
