package app.wingtipmaps.android.logbook

import app.wingtipmaps.android.api.generated.DraftTrackPoint
import app.wingtipmaps.android.api.generated.LogbookDraft
import app.wingtipmaps.android.api.generated.gateway.LogbookEntryRequest
import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.engine.generated.logbookFromTrack
import java.util.Locale

/** The engine's own reading of the track on the phone, as much as says
 *  whether a flight has ended: a fake in the tests. */
data class TrackReading(val landings: Int, val endsAirborne: Boolean, val blockTo: Double?)

fun interface DraftRules {
    fun read(points: List<DraftTrackPoint>): TrackReading?
}

/** logbook_from_track on the phone; a track it cannot read says nothing. */
val EngineDraft = DraftRules { points ->
    Engine.logbookFromTrack(points.map { EngineContract.TrackPoint(t = it.t, lat = it.lat, lon = it.lon, altFt = it.altFt) }).getOrNull()
        ?.let { TrackReading(it.landings.size, it.endsAirborne, it.block.to) }
}

/** The figures of the draft the pilot may change, as typed. */
enum class DraftField { DATE, AIRPLANE, ROUTE, TOTAL, NIGHT, CROSS_COUNTRY, DAY_LANDINGS, NIGHT_LANDINGS }

/**
 * The draft as the logbook keeps it (the web's draftEntry): whether the
 * recorded flight has ended, and the entry from the draft with the
 * pilot's changes. Pure, so the JVM tests hold it.
 */
object DraftEntry {
    /**
     * When the recorded flight ended, by the engine's reading of it: a
     * landing in it, the track not ending in the air, and the flight time
     * over (the engine's block ends where the airplane came to rest after
     * landing, 14 CFR 1.1) before the last point recorded. Past `askedTo`,
     * the end last offered, so a draft let go is not offered again.
     */
    fun ended(reading: TrackReading?, points: List<DraftTrackPoint>, askedTo: Double?): Double? {
        val last = points.lastOrNull() ?: return null
        val to = reading?.blockTo ?: return null
        if (reading.endsAirborne || reading.landings == 0 || to >= last.t) return null
        return if (askedTo != null && to <= askedTo) null else to
    }

    /** A figure as the sheet shows it: the pilot's change, else the draft's. */
    fun shown(draft: LogbookDraft, edits: Map<DraftField, String>, field: DraftField): String {
        edits[field]?.let { return it }
        val e = draft.entry
        return when (field) {
            DraftField.DATE -> e.flownOn
            DraftField.AIRPLANE -> e.aircraft.orEmpty()
            DraftField.ROUTE -> e.route
            DraftField.TOTAL -> tenths(e.totalHours)
            DraftField.NIGHT -> tenths(e.nightHours)
            DraftField.CROSS_COUNTRY -> tenths(e.crossCountryHours)
            DraftField.DAY_LANDINGS -> e.dayLandings.toString()
            DraftField.NIGHT_LANDINGS -> e.nightLandings.toString()
        }
    }

    /** Hours to the tenth, as a logbook writes them. */
    fun tenths(hours: Double): String = String.format(Locale.US, "%.1f", hours)

    /**
     * The entry the gateway keeps (POST /api/logbook): the draft's columns
     * with the pilot's changes (a figure that does not read as one keeps
     * the draft's), and 61.57(c)'s approaches, holding and tracking only
     * where the pilot says it was flown by instruments -- no track shows
     * that (14 CFR 61.51(g)(1)).
     */
    fun request(draft: LogbookDraft, edits: Map<DraftField, String>, byInstruments: Boolean, flightId: Long? = null): LogbookEntryRequest {
        val e = draft.entry
        fun hours(f: DraftField, had: Double) = edits[f]?.trim()?.toDoubleOrNull()?.takeIf { it >= 0 } ?: had
        fun count(f: DraftField, had: Int) = edits[f]?.trim()?.toIntOrNull()?.takeIf { it >= 0 } ?: had
        return LogbookEntryRequest(
            flownOn = edits[DraftField.DATE]?.trim()?.ifEmpty { null } ?: e.flownOn,
            aircraft = (edits[DraftField.AIRPLANE] ?: e.aircraft)?.trim()?.ifEmpty { null },
            aircraftType = e.aircraftType,
            route = edits[DraftField.ROUTE] ?: e.route,
            totalHours = hours(DraftField.TOTAL, e.totalHours),
            nightHours = hours(DraftField.NIGHT, e.nightHours),
            crossCountryHours = hours(DraftField.CROSS_COUNTRY, e.crossCountryHours),
            dayLandings = count(DraftField.DAY_LANDINGS, e.dayLandings),
            nightLandings = count(DraftField.NIGHT_LANDINGS, e.nightLandings),
            remarks = e.remarks,
            dualHours = 0.0, soloHours = 0.0, instrumentHours = 0.0,
            toweredLandings = e.toweredLandings,
            distanceNm = e.distanceNm,
            longestLegNm = e.longestLegNm,
            approaches = if (byInstruments) draft.instrument.approaches else 0,
            holding = byInstruments && draft.instrument.holding,
            tracking = byInstruments && draft.instrument.tracking,
            airHours = e.airHours,
            touchAndGoes = e.touchAndGoes,
            fromTrack = true,
            flightId = flightId,
        )
    }

    /** The reasons the engine gave for one figure, folded under it. */
    fun why(draft: LogbookDraft, item: String): String? =
        draft.reasons.filter { it.item == item }.joinToString(" ") { "${it.says} (${it.source})" }.ifEmpty { null }
}
