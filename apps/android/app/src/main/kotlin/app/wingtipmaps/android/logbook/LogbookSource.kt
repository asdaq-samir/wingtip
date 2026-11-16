package app.wingtipmaps.android.logbook

import app.wingtipmaps.android.api.Gateway
import app.wingtipmaps.android.api.Planner
import app.wingtipmaps.android.api.SavedTrack
import app.wingtipmaps.android.api.addLogbook
import app.wingtipmaps.android.api.currency
import app.wingtipmaps.android.api.generated.LogbookDraft
import app.wingtipmaps.android.api.generated.LogbookDraftAsk
import app.wingtipmaps.android.api.generated.gateway.CurrencyDto
import app.wingtipmaps.android.api.generated.gateway.FlightSummaryDto
import app.wingtipmaps.android.api.generated.gateway.LogbookEntryDto
import app.wingtipmaps.android.api.generated.gateway.LogbookEntryRequest
import app.wingtipmaps.android.api.logbook
import app.wingtipmaps.android.api.logbookDraft
import app.wingtipmaps.android.api.readOrNone
import app.wingtipmaps.android.api.saveTrack
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/** The logbook's servers: the planner's draft and the gateway's logbook;
 *  a fake in the tests. */
interface LogbookSource {
    suspend fun draft(ask: LogbookDraftAsk): LogbookDraft
    suspend fun add(entry: LogbookEntryRequest): LogbookEntryDto
    suspend fun entries(): List<LogbookEntryDto>?
    suspend fun currency(): CurrencyDto?

    /** The pilot's saved flights, the logged flight's track's home; none
     *  where a source keeps none, and then no track is linked. */
    suspend fun flights(): List<FlightSummaryDto> = emptyList()

    /** The flown track put with its saved flight (PUT /api/flights/{id}/track). */
    suspend fun saveTrack(flight: Long, track: SavedTrack): Unit = throw UnsupportedOperationException("No saved flights here")
}

object ServerLogbook : LogbookSource {
    override suspend fun draft(ask: LogbookDraftAsk) = Planner.logbookDraft(ask)
    override suspend fun add(entry: LogbookEntryRequest) = Gateway.addLogbook(entry)
    override suspend fun entries() = Gateway.logbook()
    override suspend fun currency() = Gateway.currency()
    override suspend fun flights() = Gateway.api.flightList().readOrNone().orEmpty()
    override suspend fun saveTrack(flight: Long, track: SavedTrack) = Gateway.saveTrack(flight, track)
}

/** The saved flight a logged route most likely is: the latest whose ends
 *  are the route's first and last idents (the web's and the iPhone's
 *  likelyFlight). */
fun likelyFlight(flights: List<FlightSummaryDto>, route: String?): FlightSummaryDto? {
    val idents = route.orEmpty().split(" ").filter { it.isNotBlank() }
    val from = idents.firstOrNull() ?: return null
    val to = idents.last()
    return flights.firstOrNull { it.departureIdent.equals(from, ignoreCase = true) && it.destinationIdent.equals(to, ignoreCase = true) }
}

/** A change to the logbook, so a list shown reads it again (LogbookModel)
 *  once a flight is logged from the track (LogbookDraftModel). */
object LogbookChanged {
    private val _version = MutableStateFlow(0)
    val version: StateFlow<Int> = _version.asStateFlow()

    fun changed() {
        _version.value += 1
    }
}

/** What the gateway's currency says, a line each, the dates as it gives
 *  them: the rules (14 CFR 61.56(c), 61.57(a)-(c)) are the gateway's and
 *  the engine's; only the words are here. */
object CurrencyWords {
    fun lines(c: CurrencyDto): List<String> = listOfNotNull(
        "${DraftEntry.tenths(c.totalHours)} h logged, ${DraftEntry.tenths(c.nightHours)} at night",
        // Each "until" date as the gateway gives it, which may be past: a
        // lapsed currency reads as one, never as none logged.
        c.flightReviewUntil?.let { "Flight review: until $it" },
        c.dayPassengersUntil?.let { "Passengers by day: until $it" } ?: "Passengers by day: not current by the logbook",
        c.nightPassengersUntil?.let { "Passengers at night: until $it" } ?: "Passengers at night: not current by the logbook",
        c.instrumentCurrentUntil?.let { "Instrument currency: until $it" },
    )
}
