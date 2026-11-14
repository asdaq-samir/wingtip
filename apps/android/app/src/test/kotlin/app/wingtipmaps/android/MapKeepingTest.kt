package app.wingtipmaps.android

import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import app.wingtipmaps.android.map.MapLayers
import app.wingtipmaps.android.map.MapLayersStore
import app.wingtipmaps.android.map.OverlayStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.runBlocking
import okhttp3.HttpUrl.Companion.toHttpUrl
import org.junit.After
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import kotlin.io.path.createTempDirectory

/** What the map keeps on the phone: Setup's switches across launches
 *  (MapLayersStore) and the overlay archive's ranges for the air
 *  (OverlayStore). */
class MapKeepingTest {
    private val dir = createTempDirectory("map").toFile()
    private val io = CoroutineScope(Dispatchers.IO + SupervisorJob())

    @After
    fun tearDown() {
        io.cancel()
        dir.deleteRecursively()
    }

    @Test
    fun theSwitchesStartAsTheWebsAndAreKept() = runBlocking {
        val store = PreferenceDataStoreFactory.create(scope = io) { File(dir, "settings.preferences_pb") }
        val first = MapLayersStore(store, this)
        first.loaded.join()
        assertEquals(MapLayers(airspace = true, navaids = true, tac = false, privateFields = false, military = false), first.layers.value)
        first.set(MapLayersStore.Switch.TAC, true).join()
        first.set(MapLayersStore.Switch.AIRSPACE, false).join()

        val next = MapLayersStore(store, this)
        next.loaded.join()
        assertTrue(next.layers.value.tac)
        assertFalse(next.layers.value.airspace)
        assertTrue(next.layers.value.navaids)
    }

    @Test
    fun aSwitchSetBeforeTheReadLandsWins() = runBlocking {
        val store = PreferenceDataStoreFactory.create(scope = io) { File(dir, "settings.preferences_pb") }
        MapLayersStore(store, this).set(MapLayersStore.Switch.MILITARY, true).join()
        val switches = MapLayersStore(store, this)
        switches.set(MapLayersStore.Switch.MILITARY, false).join()
        switches.loaded.join()
        assertFalse(switches.layers.value.military)
    }

    @Test
    fun aRangeIsMapLibresClosedOne() {
        assertEquals(0L to 16383L, OverlayStore.range("bytes=0-16383"))
        assertNull(OverlayStore.range("bytes=100-"))
        assertNull(OverlayStore.range("bytes=9-3"))
        assertNull(OverlayStore.range(null))
    }

    @Test
    fun theArchivesNameIsReadFromItsAddress() {
        assertEquals(
            "2026-10-29-v3-6cb8a5d8",
            OverlayStore.archiveName("https://wingtipmaps.app/api/planner/overlay-tiles/2026-10-29-v3-6cb8a5d8.pmtiles".toHttpUrl()),
        )
        assertNull(OverlayStore.archiveName("https://wingtipmaps.app/api/planner/overlay-tiles".toHttpUrl()))
        assertNull(OverlayStore.archiveName("https://wingtipmaps.app/api/planner/chart-tile/sec/5/1/2.png".toHttpUrl()))
    }

    @Test
    fun aRangeReadIsKeptAndAnsweredFromThePhone() {
        val store = OverlayStore(dir)
        assertNull(store.read("a", 0, 3))
        store.store("a", 0, 3, byteArrayOf(1, 2, 3, 4))
        val (bytes, length) = store.read("a", 0, 3)!!
        assertArrayEquals(byteArrayOf(1, 2, 3, 4), bytes)
        assertNull(length)
        // Another archive named: the old one's ranges go.
        store.keepOnly("b")
        assertNull(store.read("a", 0, 3))
    }

    @Test
    fun theWholeArchiveAnswersAnyRange() {
        val store = OverlayStore(dir)
        dir.mkdirs()
        store.whole("a").writeBytes(ByteArray(10) { it.toByte() })
        val (bytes, length) = store.read("a", 4, 20)!!
        assertArrayEquals(byteArrayOf(4, 5, 6, 7, 8, 9), bytes)
        assertEquals(10L, length)
        assertNull(store.read("a", 10, 12))
        assertTrue(store.hasWhole("a", 10))
    }

    @Test
    fun anEmergencyDrawsPrivateAndMilitaryFieldsAndLeavesTheSwitches() {
        // 14 CFR 91.3(b): any field may be landed at, so the chart shows them
        // all while the assistant is open, and the pilot's switches after.
        val kept = MapLayers(airspace = false, tac = true)
        assertEquals(kept.copy(privateFields = true, military = true), kept.duringEmergency(true))
        assertEquals(kept, kept.duringEmergency(false))
    }

    @Test
    fun theOldestRangesGoPastTheLimit() {
        val store = OverlayStore(dir, limitBytes = 10)
        store.store("a", 0, 5, ByteArray(6))
        File(File(File(dir, "ranges"), "a"), "0-5").setLastModified(1_000)
        store.store("a", 6, 11, ByteArray(6))
        store.trim()
        assertNull(store.read("a", 0, 5))
        assertEquals(6, store.read("a", 6, 11)!!.first.size)
    }
}
