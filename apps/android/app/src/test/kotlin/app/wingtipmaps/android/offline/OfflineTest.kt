package app.wingtipmaps.android.offline

import app.wingtipmaps.android.api.generated.OfflineRegion
import java.io.File
import java.nio.file.Files
import java.time.Instant
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Downloads: the store of kept regions, the map's archives at either
 *  density, a cycle's expiry and sweep, the style the archives go into,
 *  and the picks, as the iOS app's OfflineChartsTests. */
class OfflineTest {
    private fun store() = OfflineStore(Files.createTempDirectory("offline").toFile())

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
        assertFalse(kept().expired(Instant.parse("2026-12-24T09:00:00Z")))
        assertTrue(kept().expired(Instant.parse("2026-12-24T09:01:00Z")))
        assertFalse(kept(expires = null).expired(Instant.MAX))
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
