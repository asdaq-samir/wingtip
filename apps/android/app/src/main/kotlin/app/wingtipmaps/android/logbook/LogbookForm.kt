package app.wingtipmaps.android.logbook

import app.wingtipmaps.android.api.Gateway
import app.wingtipmaps.android.api.deleteLogbook
import app.wingtipmaps.android.api.generated.gateway.LogbookEntryDto
import app.wingtipmaps.android.api.generated.gateway.LogbookEntryRequest
import app.wingtipmaps.android.api.updateLogbook
import java.time.LocalDate
import java.time.format.DateTimeParseException

/**
 * A logbook entry's row opened for editing (LogbookEntryRow): the columns
 * a paper logbook's line has that a pilot corrects -- the date, route and
 * airplane, the total and night time, the day and night landings, the
 * remarks -- as typed. The rest of the entry (its approaches, cross-
 * country time, the flight it came from) is kept as it was. Pure, so the
 * JVM tests hold it.
 */
data class LogbookForm(
    val date: String,
    val route: String,
    val airplane: String,
    val total: String,
    val night: String,
    val dayLandings: String,
    val nightLandings: String,
    val remarks: String,
) {
    /** The entry as the gateway takes it (PUT /api/logbook/{id}), or what
     *  does not read, in words, so the row says it where it is. */
    fun request(was: LogbookEntryDto): Result<LogbookEntryRequest> = runCatching {
        val flownOn = try {
            LocalDate.parse(date.trim()).toString()
        } catch (e: DateTimeParseException) {
            throw IllegalArgumentException("The date reads as a year, month and day: 2026-11-09.", e)
        }
        LogbookEntryRequest(
            aircraft = airplane.trim().uppercase().ifEmpty { null }, aircraftType = was.aircraftType, airHours = was.airHours,
            approaches = was.approaches, crossCountryHours = was.crossCountryHours, dayLandings = count(dayLandings, "day landings"),
            distanceNm = was.distanceNm, dualHours = was.dualHours, flightId = was.flightId, flownOn = flownOn, fromTrack = was.fromTrack,
            holding = was.holding, instrumentHours = was.instrumentHours, longestLegNm = was.longestLegNm, nightHours = hours(night, "night"),
            nightLandings = count(nightLandings, "night landings"), remarks = remarks.trim().ifEmpty { null },
            route = route.trim().uppercase().ifEmpty { null }, soloHours = was.soloHours, totalHours = hours(total, "total"),
            touchAndGoes = was.touchAndGoes, toweredLandings = was.toweredLandings, tracking = was.tracking,
        )
    }

    companion object {
        fun of(e: LogbookEntryDto) = LogbookForm(
            date = e.flownOn, route = e.route.orEmpty(), airplane = e.aircraft.orEmpty(), total = DraftEntry.tenths(e.totalHours),
            night = DraftEntry.tenths(e.nightHours), dayLandings = e.dayLandings.toString(), nightLandings = e.nightLandings.toString(),
            remarks = e.remarks.orEmpty(),
        )

        /** A time typed, in hours and tenths, none below nought. */
        fun hours(text: String, name: String): Double =
            text.trim().toDoubleOrNull()?.takeIf { it >= 0 } ?: throw IllegalArgumentException("The $name time reads as hours, 1.4 or 0.")

        /** A count typed: landings, a whole number. */
        fun count(text: String, name: String): Int =
            text.trim().toIntOrNull()?.takeIf { it >= 0 } ?: throw IllegalArgumentException("The $name read as a whole number, 1 or 0.")
    }
}

/** The logbook's changes in the row: the gateway's update and delete, a
 *  fake in the tests. */
interface LogbookEdits {
    suspend fun update(id: Long, entry: LogbookEntryRequest): LogbookEntryDto
    suspend fun delete(id: Long)
}

object ServerLogbookEdits : LogbookEdits {
    override suspend fun update(id: Long, entry: LogbookEntryRequest) = Gateway.updateLogbook(id, entry)
    override suspend fun delete(id: Long) = Gateway.deleteLogbook(id)
}
