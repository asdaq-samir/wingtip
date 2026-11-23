package app.wingtipmaps.android.offline

import app.wingtipmaps.android.api.generated.FlightPlates
import app.wingtipmaps.android.api.generated.KeptPlateField
import app.wingtipmaps.android.api.generated.PlateStateCharts
import app.wingtipmaps.android.api.generated.PlateStateField
import app.wingtipmaps.android.api.generated.PlateStates
import app.wingtipmaps.android.api.generated.TerminalChart
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.w3c.dom.Element
import java.io.File
import java.io.IOException
import java.nio.file.Files
import java.time.Instant
import javax.xml.parsers.DocumentBuilderFactory

/** The plates kept by state and for a flight: a kept state's progress,
 *  a delete that leaves a booklet another state holds, the update at its
 *  cycle's 0901Z and not a minute before, and the size said before Keep
 *  for the Air, as the web's statePlates and keepPlates tests. */
class StatePlatesTest {
    private val dir: File = Files.createTempDirectory("plates").toFile().also { it.deleteOnExit() }
    private val kept = KeptForAir(File(dir, "kept-air"))
    private val store = StatePlatesStore(File(dir, "plate-states"))
    private val keeper = ChartKeeper(kept) { url, to ->
        if ("BAD" in url) throw IOException("The FAA answered 502.")
        to.parentFile?.mkdirs()
        to.writeText(url)
    }

    private fun chart(url: String) = TerminalChart(kind = "IAP", name = url.substringAfterLast("/"), url = url)

    private fun list(id: String, cycle: String, vararg urls: String, nextAt: String = "2026-12-24T09:01:00Z") =
        PlateStateCharts(cycle = cycle, fields = listOf(PlateStateField(charts = urls.map(::chart), ident = "K$id")), id = id, name = id, nextAt = nextAt)

    /** The planner, answering from the lists given. */
    private class Planner(val lists: List<PlateStateCharts>, val cycle: String? = null) : PlatesPlanner {
        override suspend fun flight(ask: FlightPlatesAsk): FlightPlates = error("not asked")
        override suspend fun states(): PlateStates = PlateStates(cycle = cycle, nextAt = "2027-01-21T09:01:00Z", state = "in_force", states = emptyList())
        override suspend fun state(cycle: String, id: String): PlateStateCharts = lists.first { it.cycle == cycle && it.id == id }
    }

    private fun keep(planner: PlatesPlanner, id: String, cycle: String) = runBlocking {
        StatePlates.keep(store, keeper, planner, id, cycle, held = { StatePlates.held(store, kept, except = id) })
    }

    @Test
    fun aKeptStatesProgressIsItsChartsDoneAndWhatFailedIsCounted() {
        val half = KeptState("CA", "California", "2611", "2026-12-24T09:01:00Z", charts = 40, done = 10)
        assertEquals(0.25f, half.progress)
        assertTrue(half.unfinished)

        val planner = Planner(listOf(list("CA", "2611", "https://aeronav.faa.gov/d-tpp/2611/A.PDF", "https://aeronav.faa.gov/d-tpp/2611/BAD.PDF")))
        assertTrue(keep(planner, "CA", "2611"))
        val record = store.get("CA")!!
        assertEquals(2, record.charts)
        assertEquals(2, record.done)
        assertEquals(1, record.failed)
        assertFalse(record.unfinished)
        assertEquals(1f, record.progress)
        // Kept across a restart: read again from its file.
        assertEquals(record, StatePlatesStore(store.root).get("CA"))
    }

    @Test
    fun deletingAStateLeavesTheBookletAnotherStateHolds() {
        val booklet = "https://aeronav.faa.gov/d-tpp/2611/SW2TO.PDF"
        val ca = "https://aeronav.faa.gov/d-tpp/2611/CA1.PDF"
        val nv = "https://aeronav.faa.gov/d-tpp/2611/NV1.PDF"
        val planner = Planner(listOf(list("CA", "2611", ca, booklet), list("NV", "2611", nv, booklet)))
        keep(planner, "CA", "2611")
        keep(planner, "NV", "2611")
        assertTrue(listOf(ca, nv, booklet).all(keeper::kept))

        StatePlates.delete(store, keeper, "NV", StatePlates.held(store, kept, except = "NV"))
        assertNull(store.get("NV"))
        assertFalse(keeper.kept(nv))
        assertTrue(keeper.kept(booklet))
        assertTrue(keeper.kept(ca))

        // The last one deleted takes the booklet with it.
        StatePlates.delete(store, keeper, "CA", StatePlates.held(store, kept, except = "CA"))
        assertFalse(keeper.kept(booklet))
    }

    @Test
    fun aChartAFlightKeptStaysWhenAStateGoes() {
        val shared = "https://aeronav.faa.gov/d-tpp/2611/00366IL10R.PDF"
        keep(Planner(listOf(list("WI", "2611", shared))), "WI", "2611")
        val flight = FlightPlates(
            alternatePicked = false, basis = "reserve", bytes = 1, charts = 1, cycle = "2611",
            fields = listOf(KeptPlateField(charts = listOf(chart(shared)), ident = "KMSN", role = "destination")),
            nextAt = "2026-12-24T09:01:00Z", rangeNm = 100.0, reserveMin = 45.0, state = "in_force",
        )
        kept.write(KeptForAir.PLATES, "KOSH||KMSN", KeptForAir.JSON.encodeToString(FlightPlates.serializer(), flight))
        StatePlates.delete(store, keeper, "WI", StatePlates.held(store, kept, except = "WI"))
        assertTrue(keeper.kept(shared))
    }

    @Test
    fun aStateIsFetchedAgainAtItsCyclesNextAtAndNotAMinuteBefore() = runBlocking {
        val old = "https://aeronav.faa.gov/d-tpp/2611/A.PDF"
        val new = "https://aeronav.faa.gov/d-tpp/2612/A.PDF"
        val planner = Planner(listOf(list("CA", "2611", old), list("CA", "2612", new, nextAt = "2027-01-21T09:01:00Z")), cycle = "2612")
        keep(planner, "CA", "2611")

        assertTrue(StatePlates.due(store, planner, Instant.parse("2026-12-24T09:00:00Z")).isEmpty())
        assertEquals(listOf("CA" to "2612"), StatePlates.due(store, planner, Instant.parse("2026-12-24T09:01:00Z")))
        // Already being fetched: not asked twice.
        assertTrue(StatePlates.due(store, planner, Instant.parse("2026-12-24T09:01:00Z"), running = setOf("CA")).isEmpty())

        keep(planner, "CA", "2612")
        val record = store.get("CA")!!
        assertEquals("2612", record.cycle)
        assertEquals("2027-01-21T09:01:00Z", record.nextAt)
        assertTrue(keeper.kept(new))
        // The old cycle's charts and list gone once the new one is done.
        assertFalse(keeper.kept(old))
        assertNull(store.list("2611", "CA"))
    }

    @Test
    fun aStoppedDownloadGoesOnInItsOwnCycle() = runBlocking {
        store.update("CA") { KeptState("CA", "California", "2611", "2026-12-24T09:01:00Z", charts = 40, done = 20) }
        assertEquals(listOf("CA" to "2611"), StatePlates.due(store, Planner(emptyList()), Instant.parse("2026-12-01T00:00:00Z")))
        assertEquals("24 Dec 0901Z", StatePlates.until("2026-12-24T09:01:00Z"))
    }

    private fun plates(basis: String, rangeNm: Double?, bytes: Long, fields: Int) = FlightPlates(
        alternatePicked = false, basis = basis, bytes = bytes, charts = fields, cycle = "2611",
        fields = List(fields) { KeptPlateField(charts = emptyList(), ident = "K$it", role = "diversion") },
        nextAt = "2026-12-24T09:01:00Z", rangeNm = rangeNm, reserveMin = 45.0, state = "in_force",
    )

    /** A plural's words for `quantity`, from the module's own strings. */
    private fun plural(name: String, quantity: String): String {
        val doc = DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(File("src/main/res/values/plates_offline_strings.xml"))
        val plurals = doc.getElementsByTagName("plurals")
        val node = (0 until plurals.length).map { plurals.item(it) as Element }.first { it.getAttribute("name") == name }
        val items = node.getElementsByTagName("item")
        return (0 until items.length).map { items.item(it) as Element }.first { it.getAttribute("quantity") == quantity }.textContent.replace("\\'", "'")
    }

    @Test
    fun theSizeLineSaysTheFlightsPlatesAndTheirReach() {
        val line = FlightPlatesLine.of(plates("reserve", 117.6, 52_400_000, 9))!!
        assertEquals(FlightPlatesLine("52", 9, 118), line)
        assertEquals(
            "This flight's plates: about 52 MB, 9 fields, within 118 nm of the route.",
            String.format(plural("plates_flight_size", "other"), line.mb, line.fields, line.rangeNm),
        )
        val none = FlightPlatesLine.of(plates("no_airplane", null, 400_000, 1))!!
        assertNull(none.rangeNm)
        assertEquals(
            "This flight's plates: about 0.4 MB, 1 field. Pick an airplane to keep the fields within diversion range too.",
            String.format(plural("plates_flight_size_no_airplane", "one"), none.mb, none.fields),
        )
        assertEquals("0.1", FlightPlatesLine.aboutMb(10_000))
        assertNull(FlightPlatesLine.of(null))
    }

    @Test
    fun aLongCourseIsThinnedToSixtyPointsItsEndsKept() {
        val line = List(130) { listOf(43.0 + it / 100.0, -88.0) }
        val fixes = FlightPlatesAsk.fixes(line).split(";")
        assertTrue(fixes.size <= FlightPlatesAsk.MOST_FIXES)
        assertEquals("43.0000,-88.0000", fixes.first())
        assertEquals("44.2900,-88.0000", fixes.last())
        // Just over the most: still no more than it, the last point kept.
        val twice = FlightPlatesAsk.fixes(List(120) { listOf(43.0 + it / 100.0, -88.0) }).split(";")
        assertTrue(twice.size <= FlightPlatesAsk.MOST_FIXES)
        assertEquals("44.1900,-88.0000", twice.last())
    }
}
