package app.wingtipmaps.android.api

import app.wingtipmaps.android.Config
import app.wingtipmaps.android.api.generated.LogbookDraft
import app.wingtipmaps.android.api.generated.LogbookDraftAsk
import app.wingtipmaps.android.api.generated.gateway.CurrencyDto
import app.wingtipmaps.android.api.generated.gateway.LogbookEntryDto
import app.wingtipmaps.android.api.generated.gateway.LogbookEntryRequest
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString

// The logbook's calls, as the web's api.logbookDraft and api.logbook:
// the planner draws an entry from a recorded track (the engine's
// logbook_from_track, with the fields and approaches round it), and the
// gateway keeps the pilot's logbook and works the currency out from it
// (14 CFR 61.56, 61.57). Signed in only.

/** The entry drawn from the track (POST /api/logbook-draft). */
suspend fun Planner.logbookDraft(ask: LogbookDraftAsk): LogbookDraft =
    Gateway.json.decodeFromString(Gateway.send("POST", Config.plannerPath("/api/logbook-draft"), Gateway.json.encodeToString(ask)))

/** The pilot's logbook, newest first; null signed out. */
suspend fun Gateway.logbook(): List<LogbookEntryDto>? = read("/api/logbook")

/** An entry logged (POST /api/logbook): the gateway's copy of it. */
suspend fun Gateway.addLogbook(entry: LogbookEntryRequest): LogbookEntryDto =
    json.decodeFromString(send("POST", "/api/logbook", json = json.encodeToString(entry)))

/** What the logbook says of the pilot's currency; null signed out. */
suspend fun Gateway.currency(): CurrencyDto? = read("/api/logbook/currency")

/** An entry changed in its row (PUT /api/logbook/{id}): the gateway's copy. */
suspend fun Gateway.updateLogbook(id: Long, entry: LogbookEntryRequest): LogbookEntryDto =
    json.decodeFromString(send("PUT", "/api/logbook/$id", json = json.encodeToString(entry)))

/** An entry deleted (DELETE /api/logbook/{id}), once its Undo has gone. */
suspend fun Gateway.deleteLogbook(id: Long) {
    send("DELETE", "/api/logbook/$id")
}
