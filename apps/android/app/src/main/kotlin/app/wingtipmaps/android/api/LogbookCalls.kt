package app.wingtipmaps.android.api

import app.wingtipmaps.android.Config
import app.wingtipmaps.android.api.generated.LogbookDraft
import app.wingtipmaps.android.api.generated.LogbookDraftAsk
import app.wingtipmaps.android.api.generated.gateway.CurrencyDto
import app.wingtipmaps.android.api.generated.gateway.LogbookEntryDto
import app.wingtipmaps.android.api.generated.gateway.LogbookEntryRequest
import app.wingtipmaps.android.logbook.AirplaneKind
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString

// The logbook's calls, as the web's api.logbookDraft and api.logbook:
// the planner draws an entry from a recorded track (the engine's
// logbook_from_track, with the fields and approaches round it), and the
// gateway keeps the pilot's logbook and works the currency out from it
// (14 CFR 61.56, 61.57). Signed in only.

/** The entry drawn from the track (POST /api/logbook-draft). */
suspend fun Planner.logbookDraft(ask: LogbookDraftAsk): LogbookDraft =
    api.draft(ask).planned()

/** The pilot's logbook, newest first; null signed out. */
suspend fun Gateway.logbook(): List<LogbookEntryDto>? = api.logbookList().readOrNone()

/** An entry logged (POST /api/logbook): the gateway's copy of it. */
suspend fun Gateway.addLogbook(entry: LogbookEntryRequest): LogbookEntryDto =
    writes.logbookAdd(entry).accepted()

/** What the logbook says of the pilot's currency, passengers judged for
 *  the airplane to be flown where its category, class and gear are known
 *  (14 CFR 61.57(a)(1)), else for the newest flight's; null signed out. */
suspend fun Gateway.currency(toFly: AirplaneKind? = null): CurrencyDto? =
    api.currency(category = toFly?.category, aircraftClass = toFly?.aircraftClass, tailwheel = toFly?.tailwheel).readOrNone()

/** An entry changed in its row (PUT /api/logbook/{id}): the gateway's copy. */
suspend fun Gateway.updateLogbook(id: Long, entry: LogbookEntryRequest): LogbookEntryDto =
    writes.logbookUpdate(id, entry).accepted()

/** An entry deleted (DELETE /api/logbook/{id}), once its Undo has gone. */
suspend fun Gateway.deleteLogbook(id: Long) {
    writes.logbookDelete(id).done()
}
