package app.wingtipmaps.android.offline

import app.wingtipmaps.android.api.generated.OfflineRegion
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.nio.file.Files
import java.time.Instant

/** Downloads: the store of kept regions, the map's archives at either
 *  density, a cycle's expiry and sweep, the style the archives go into,
 *  and the picks, as the iOS app's OfflineChartsTests. */
class OfflineTest {
    /** The engine's data_cycle on the chart schedule, which does not load
     *  on the JVM: the shared fixture's chart cases (dataCycles.json), and
     *  the next edition's own asks, which it does not list, as the engine
     *  answers them (in force from 0901Z on its date). Any other ask fails. */
    private val answers: Map<Pair<String, String>, String> = Json.parseToJsonElement(
        checkNotNull(javaClass.classLoader!!.getResource("dataCycles.json")) { "dataCycles.json is not on the test's classpath" }.readText(),
    ).jsonObject.getValue("cases").jsonArray.map { it.jsonObject }.filter { it.getValue("kind").jsonPrimitive.content == "chart" }.associate {
        (it.getValue("effective").jsonPrimitive.content to it.getValue("on").jsonPrimitive.content) to
            it.getValue("expected").jsonObject.getValue("state").jsonPrimitive.content
    } + mapOf(
        ("2026-12-24" to "2026-12-24T09:00:00Z") to "not_yet",
        ("2026-12-24" to "2026-12-24T09:01:00Z") to "in_force",
        ("2026-10-29" to "2026-12-25T00:00:00Z") to "expired",
        ("2026-12-24" to "2026-12-25T00:00:00Z") to "in_force",
    )
    private val cycles = ChartCycle { effective, on -> answers[effective to on] ?: error("data_cycle asked of $effective at $on, which the test does not answer") }

    private fun store() = OfflineStore(Files.createTempDirectory("offline").toFile(), cycles)

    private fun kept(cycle: String = "10-29-2026", expires: String? = "2026-12-24", done: List<String> = emptyList()) =
        OfflineKept("Chicago", "Chicago", cycle, expires, listOf(listOf(-93.0, 40.0, -84.0, 44.0)), mapOf("sec@2x" to 3L), done)

    private fun file(text: String): File = Files.createTempFile("part", ".pmtiles").toFile().apply { writeText(text) }

    @Test
    fun aFinishedArchiveIsDrawnAtEitherDensity() {
        val store = store()
        val k = kept()
        store.update(k.id) { k }
        assertTrue(store.archives("10-29-2026", "sec", 2).isEmpty())
        store.finish("10-29-2026", "Chicago", "sec@2x", file("abc"))
        assertTrue(store.all().single().complete)
        assertEquals(listOf(store.path("10-29-2026", "Chicago", "sec@2x")), store.archives("10-29-2026", "sec", 2))
        // The 256-pixel archive asked for, the 512 one drawn in its place.
        assertEquals(listOf(store.path("10-29-2026", "Chicago", "sec@2x")), store.archives("10-29-2026", "sec", 1))
        assertTrue(store.archives("12-24-2026", "sec", 2).isEmpty())
        assertTrue(store.archives("10-29-2026", "tac", 2).isEmpty())
        // Kept across a restart: read again from the manifest.
        assertEquals(store.all(), OfflineStore(store.root).all())
        store.update(k.id) { null }
        assertTrue(store.all().isEmpty() && !store.path("10-29-2026", "Chicago", "sec@2x").exists())
    }

    @Test
    fun anEditionExpiresAt0901ZOnTheNextOnesDay() {
        // The minute before, of and after the 24 Dec 2026 edition takes over.
        assertFalse(kept().expired(Instant.parse("2026-12-24T09:00:00Z"), cycles))
        assertTrue(kept().expired(Instant.parse("2026-12-24T09:01:00Z"), cycles))
        assertTrue(kept().expired(Instant.parse("2026-12-24T09:02:00Z"), cycles))
        assertEquals("2026-10-29", OfflineKept.isoDay("10-29-2026"))
        assertNull(OfflineKept.isoDay("latest"))
    }

    @Test
    fun theKeptNextCycleIsDrawnOverTheOldOneInItsRegionFrom0901Z() {
        // Offline across a changeover, the chart answer still the old
        // cycle's: the next cycle's region kept ahead is drawn over the old
        // chart from 0901Z on its date, the engine's data_cycle asked; past
        // the region the old chart shows (the data-cycles audit's 14).
        val store = store()
        val old = kept(done = listOf("sec@2x"))
        val next = kept(cycle = "12-24-2026", expires = "2027-02-18")
        store.update(old.id) { old }
        store.update(next.id) { next }
        store.finish("10-29-2026", "Chicago", "sec@2x", file("old"))
        store.finish("12-24-2026", "Chicago", "sec@2x", file("new"))
        val before = Instant.parse("2026-12-24T09:00:00Z")
        val after = Instant.parse("2026-12-24T09:01:00Z")
        assertNull(store.keptInForce("10-29-2026", before))
        assertEquals(listOf(store.path("10-29-2026", "Chicago", "sec@2x")), store.archives("10-29-2026", "sec", 2, before))
        assertEquals("12-24-2026", store.keptInForce("10-29-2026", after))
        assertEquals(
            listOf(store.path("10-29-2026", "Chicago", "sec@2x"), store.path("12-24-2026", "Chicago", "sec@2x")),
            store.archives("10-29-2026", "sec", 2, after),
        )
        // Never an older cycle in place of the one asked for.
        assertNull(store.keptInForce("12-24-2026", after))
    }

    @Test
    fun anExpiredEditionGoesOnlyOnceItsUpdateIsWhole() {
        val store = store()
        val old = kept(done = listOf("sec@2x"))
        val new = kept(cycle = "12-24-2026", expires = "2027-02-18")
        store.update(old.id) { old }
        store.update(new.id) { new }
        val later = Instant.parse("2026-12-25T00:00:00Z")
        store.sweep(later)
        assertEquals(2, store.all().size)
        store.update(new.id) { it?.copy(done = listOf("sec@2x")) }
        store.sweep(later)
        assertEquals(listOf("12-24-2026"), store.all().map { it.cycle })
    }

    @Test
    fun theArchivesGoStraightOverTheChartWithItsPaint() {
        val style = """{"version":8,"sources":{"chart":{"type":"raster"}},"layers":[
            {"id":"chart","type":"raster","source":"chart","paint":{"raster-contrast":0.1}},{"id":"airports","type":"symbol"}]}"""
        assertEquals(style, OfflineLayers.withDownloads(style, emptyList()))
        val out = Json.parseToJsonElement(OfflineLayers.withDownloads(style, listOf(File("/data/a/sec@2x.pmtiles")))).jsonObject
        val ids = out["layers"]!!.jsonArray.map { it.jsonObject["id"]!!.jsonPrimitive.content }
        assertEquals(listOf("chart", "offline-0", "airports"), ids)
        val source = out["sources"]!!.jsonObject["offline-0"]!!.jsonObject
        assertEquals("pmtiles://file:///data/a/sec@2x.pmtiles", source["url"]!!.jsonPrimitive.content)
        assertEquals("0.1", out["layers"]!!.jsonArray[1].jsonObject["paint"]!!.jsonObject["raster-contrast"]!!.jsonPrimitive.content)
    }

    @Test
    fun theTerminalChartsComeWithTheirSwitch() {
        val store = store()
        val k = OfflineKept("Chicago", "Chicago", "10-29-2026", null, listOf(listOf(-93.0, 40.0, -84.0, 44.0)),
            mapOf("sec@2x" to 3L, "tac@2x" to 3L))
        store.update(k.id) { k }
        store.finish("10-29-2026", "Chicago", "sec@2x", file("a"))
        store.finish("10-29-2026", "Chicago", "tac@2x", file("b"))
        assertEquals(2, OfflineLayers.archives(store, "10-29-2026", "sec", 2, terminal = true).size)
        assertEquals(1, OfflineLayers.archives(store, "10-29-2026", "sec", 2, terminal = false).size)
    }

    @Test
    fun aTapPicksTheSmallestSheetAndSizesFollowThePicks() {
        val big = OfflineRegion(listOf(listOf(-93.0, 40.0, -84.0, 44.0)), "sheet", "Chicago", "Chicago", mapOf("sec@2x" to 583L, "tac@2x" to 75L))
        val small = OfflineRegion(listOf(listOf(-88.5, 41.5, -87.0, 42.5)), "sheet", "box", "Box", emptyMap())
        assertEquals("box", sheetAt(42.0, -87.9, listOf(big, small))?.id)
        assertEquals("Chicago", sheetAt(43.0, -90.0, listOf(big, small))?.id)
        assertNull(sheetAt(30.0, -90.0, listOf(big, small)))
        assertEquals(658L, DownloadsModel.size(big, listOf("sec@2x", "tac@2x")))
        assertEquals(583L, DownloadsModel.size(big, listOf("sec@2x", "ifr_area@2x")))
        assertNull(DownloadsModel.size(small, listOf("sec@2x")))
    }
}
