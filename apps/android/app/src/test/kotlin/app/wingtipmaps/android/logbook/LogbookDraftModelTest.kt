package app.wingtipmaps.android.logbook

import app.wingtipmaps.android.MainRule
import app.wingtipmaps.android.api.generated.DraftTrackPoint
import app.wingtipmaps.android.api.generated.LogbookDraft
import app.wingtipmaps.android.api.generated.LogbookDraftAsk
import app.wingtipmaps.android.api.SavedTrack
import app.wingtipmaps.android.api.generated.gateway.CurrencyDto
import app.wingtipmaps.android.api.generated.gateway.FlightSummaryDto
import app.wingtipmaps.android.api.generated.gateway.LogbookEntryDto
import app.wingtipmaps.android.api.generated.gateway.LogbookEntryRequest
import app.wingtipmaps.android.flight.OwnShip
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import java.io.File
import java.nio.file.Files

/** The flight logged from its track over fakes of the recording, the
 *  engine and the servers: offered once the engine finds a landing and
 *  rest, drawn by the planner, changed by the pilot, logged only on Log,
 *  the currency read again; Later and Not a Flight let it go. */
class LogbookDraftModelTest {
    @get:Rule val main = MainRule()

    companion object {
        private val JSON = Json { ignoreUnknownKeys = true }

        /** A draft as the planner answers one (POST /api/logbook-draft):
         *  KDPA to KMSN, 1.4 h, an approach, no hold. */
        val DRAFT: LogbookDraft = JSON.decodeFromString(
            LogbookDraft.serializer(),
            """{"approaches":[{"airport":"KMSN","also_fits":[],"faf_at":1,"id":"I18","name":"ILS 18","outcome":"landed"}],
            "block":{"from":0,"to":600000},"cross_country":{"farthest_nm":70,"landed_elsewhere":true,"over_50_nm":true},"ends_airborne":false,
            "entry":{"aircraft":"N123AB","aircraftType":"C172","airHours":1.2,"approaches":0,"crossCountryHours":1.4,"dayLandings":1,"distanceNm":70,
            "flownOn":"2026-11-09","holding":false,"longestLegNm":70,"nightHours":0,"nightLandings":0,"remarks":"From the track","route":"KDPA KMSN",
            "totalHours":1.4,"touchAndGoes":0,"toweredLandings":1,"tracking":false},
            "holds":[],"instrument":{"approaches":1,"holding":false,"tracking":true},"landings":[],"reasons":[{"item":"totalHours","says":"Takeoff roll to rest","source":"14 CFR 1.1"}],"takeoffs":[]}""",
        )
    }

    private class Flight : RecordedFlight {
        override val recorded = MutableStateFlow(Recorded())
        override fun asked(to: Double) { recorded.value = recorded.value.copy(askedTo = to) }
        override fun forget() { recorded.value = Recorded() }
        fun points(n: Int) { recorded.value = recorded.value.copy(points = (0 until n).map { DraftTrackPoint(lat = 42.0, lon = -88.0, t = it * 5_000.0) }) }
    }

    private class Shelf : TrackShelf {
        override val unsent = MutableStateFlow<List<Unsent>>(emptyList())
        override val problem = MutableStateFlow<String?>(null)
        override suspend fun keep(item: Unsent, problem: String) { unsent.value += item; this.problem.value = problem }
        override suspend fun send(upload: suspend (Long, SavedTrack) -> Unit) {
            for (item in unsent.value) runCatching { upload(item.flight, item.track) }.onSuccess { unsent.value -= item }
            if (unsent.value.isEmpty()) problem.value = null
        }
    }

    private class Servers(var signal: Boolean = true) : LogbookSource {
        var asked: LogbookDraftAsk? = null
        var added: LogbookEntryRequest? = null
        val tracks = mutableMapOf<Long, SavedTrack>()
        override suspend fun flights() = listOf(
            FlightSummaryDto(createdAt = "2026-11-09T12:00:00Z", departureIdent = "KDPA", destinationIdent = "KMSN", id = 42, stops = emptyList()),
        )
        override suspend fun saveTrack(flight: Long, track: SavedTrack) {
            if (!signal) throw java.io.IOException("No signal")
            tracks[flight] = track
        }
        override suspend fun draft(ask: LogbookDraftAsk): LogbookDraft { asked = ask; return DRAFT }
        override suspend fun add(entry: LogbookEntryRequest): LogbookEntryDto {
            added = entry
            return LogbookEntryDto(
                aircraft = entry.aircraft, airHours = entry.airHours, approaches = entry.approaches, crossCountryHours = entry.crossCountryHours,
                dayLandings = entry.dayLandings, distanceNm = entry.distanceNm, dualHours = 0.0, flownOn = entry.flownOn, fromTrack = true,
                holding = entry.holding, id = 7, instrumentHours = 0.0, longestLegNm = entry.longestLegNm, nightHours = entry.nightHours,
                nightLandings = entry.nightLandings, route = entry.route, soloHours = 0.0, totalHours = entry.totalHours, touchAndGoes = 0,
                toweredLandings = 1, tracking = entry.tracking,
            )
        }
        override suspend fun entries() = emptyList<LogbookEntryDto>()
        override suspend fun currency() = CurrencyDto(
            approachesInWindow = 1, crossCountryHours = 1.4, flights = 1, holdingInWindow = false, landings = 1,
            nightHours = 0.0, totalHours = 1.4, trackingInWindow = true, dayPassengersUntil = "2027-02-07",
        )
    }

    /** The engine's reading: landed and at rest at 600 s, by its block. */
    private val landed = DraftRules { TrackReading(landings = 1, endsAirborne = false, blockTo = 600_000.0) }

    @Test
    fun aFlightEndedIsDrawnChangedAndLoggedOnlyOnLog() {
        val flight = Flight()
        val servers = Servers()
        val model = LogbookDraftModel(flight, Shelf(), landed, servers) { -360.0 }
        model.context(signedIn = true, tail = "N123AB", type = "c172")
        // Under a minute of points: not read yet.
        flight.points(11)
        assertFalse(model.state.value.open)
        // Two minutes, the last point past the block's end: offered, drawn.
        flight.points(150)
        assertTrue(model.state.value.open)
        assertEquals(600_000.0, model.state.value.endedAt!!, 0.0)
        assertEquals("N123AB", servers.asked!!.aircraft)
        assertEquals("C172", servers.asked!!.aircraftType)
        assertEquals(-360.0, servers.asked!!.utcOffsetMin!!, 0.0)
        assertNotNull(model.state.value.draft)
        assertNull(servers.added)
        // The pilot's changes, and the instrument items only when said.
        model.edit(DraftField.TOTAL, "1.5")
        model.edit(DraftField.DAY_LANDINGS, "two")
        model.byInstruments(true)
        model.log()
        val added = servers.added!!
        assertEquals(1.5, added.totalHours, 0.0)
        assertEquals(1, added.dayLandings)
        assertEquals(1, added.approaches)
        assertTrue(added.tracking && added.fromTrack)
        val logged = model.state.value.logged!!
        assertTrue(logged.currency.contains("Passengers by day: until 2027-02-07"))
        assertTrue(flight.recorded.value.points.isEmpty())
        model.close()
        assertFalse(model.state.value.open)
    }

    @Test
    fun theTrackGoesToItsSavedFlightAndWithNoSignalIsKeptUntilSent() {
        val flight = Flight()
        val shelf = Shelf()
        val servers = Servers(signal = false)
        val model = LogbookDraftModel(flight, shelf, landed, servers) { 0.0 }
        model.context(signedIn = true, tail = "N123AB", type = "c172")
        flight.points(150)
        model.log()
        // Linked to the saved flight whose ends are the route's.
        assertEquals(42L, servers.added!!.flightId)
        // No signal: the entry logged, the track kept before the recorder let it go.
        assertTrue(flight.recorded.value.points.isEmpty())
        assertEquals(1, shelf.unsent.value.size)
        assertEquals(150, shelf.unsent.value.single().track.points.size)
        assertNotNull(model.trackProblem.value)
        // A network again: sent whole, and let go.
        servers.signal = true
        model.sendUnsent()
        assertEquals(150, servers.tracks[42L]!!.points.size)
        assertTrue(shelf.unsent.value.isEmpty())
        assertNull(model.trackProblem.value)
    }

    @Test
    fun laterAndNotAFlightLetItGo() {
        val flight = Flight()
        val model = LogbookDraftModel(flight, Shelf(), landed, Servers()) { 0.0 }
        flight.points(150)
        assertTrue(model.state.value.open)
        // Signed out: no draft asked.
        assertNull(model.state.value.draft)
        model.later()
        assertFalse(model.state.value.open)
        assertEquals(150, flight.recorded.value.points.size)
        // Still in the air by the engine: nothing offered.
        val flying = LogbookDraftModel(flight, Shelf(), { TrackReading(1, endsAirborne = true, blockTo = 600_000.0) }, Servers()) { 0.0 }
        flight.asked(0.0)
        assertFalse(flying.state.value.open)
        model.discard()
        assertTrue(flight.recorded.value.points.isEmpty())
    }

    @Test
    fun theLogbookListsNewestFirstWithItsCurrency() {
        val servers = object : LogbookSource by Servers() {
            override suspend fun entries() = listOf("2026-10-01", "2026-11-09").mapIndexed { i, day ->
                LogbookEntryDto(
                    airHours = 1.0, approaches = 0, crossCountryHours = 0.0, dayLandings = i + 1, distanceNm = 0.0, dualHours = 0.0, flownOn = day,
                    fromTrack = false, holding = false, id = i.toLong(), instrumentHours = 0.0, longestLegNm = 0.0, nightHours = 0.0, nightLandings = 0,
                    route = "KDPA", soloHours = 0.0, totalHours = 1.04, touchAndGoes = 0, toweredLandings = 0, tracking = false,
                )
            }
        }
        val model = LogbookModel(servers)
        val s = model.state.value
        assertEquals(listOf("2026-11-09", "2026-10-01"), s.entries.map { it.flownOn })
        assertEquals("KDPA · 1.0 h · 2 landings", LogbookModel.line(s.entries[0]))
        assertEquals("KDPA · 1.0 h · 1 landing", LogbookModel.line(s.entries[1]))
        assertEquals("1.4 h logged, 0.0 at night", s.currency.first())
    }

    @Test
    fun theRecorderKeepsAPointEachFiveSecondsAcrossLaunches() {
        val file = File(Files.createTempDirectory("rec").toFile(), "flight.json")
        var now = 0L
        val rec = FlightRecorder(file, Dispatchers.Unconfined) { now }
        fun fix(atMs: Long) = OwnShip.Fix(42.0, -88.0, 800.0, 90.0, 0.0, 5.0, atMs)
        rec.took(fix(1_000))
        rec.took(fix(3_000))
        rec.took(fix(6_000))
        assertEquals(listOf(1_000.0, 6_000.0), rec.recorded.value.points.map { it.t })
        now = 40_000
        rec.asked(600.0)
        val again = FlightRecorder(file, Dispatchers.Unconfined) { now }
        assertEquals(2, again.recorded.value.points.size)
        assertEquals(600.0, again.recorded.value.askedTo!!, 0.0)
    }
}
