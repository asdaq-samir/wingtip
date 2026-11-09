package app.wingtipmaps.android.offline

import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.api.generated.NotamsRanked
import app.wingtipmaps.android.ready.ReadyFacts
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.io.IOException
import java.nio.file.Files

/** What is kept for the air: written and read back as it was, given back
 *  with its own time where the network fails, and counted on board for
 *  ready_to_fly only where it is there. */
class KeptForAirTest {
    private val dir: File = Files.createTempDirectory("kept-air").toFile().also { it.deleteOnExit() }
    private val store = KeptForAir(dir)
    private val ranked = NotamsRanked(notams = emptyList(), top = 0, coverageSince = "2026-11-09T12:00:00Z")

    @Test
    fun anAnswerIsReadBackAsItWasWrittenWithItsTime() {
        store.write(KeptForAir.NOTAMS, "KOSH||KMSN", "{\"top\":0}", atMs = 1_794_246_000_000L)
        val back = store.read(KeptForAir.NOTAMS, "KOSH||KMSN")!!
        assertEquals("{\"top\":0}", back.body)
        assertEquals(1_794_246_000_000L, back.fetchedAtMs)
        assertNull(store.read(KeptForAir.NOTAMS, "KOSH||KGRB"))
        assertTrue(store.bytes(KeptForAir.NOTAMS, listOf("KOSH||KMSN")) > 0)
    }

    @Test
    fun theNetworksAnswerIsKeptAndTheKeptOneGivenBackWhenItFails() = runBlocking {
        val fresh = store.orKept(KeptForAir.NOTAMS, "route", NotamsRanked.serializer(), nowMs = 1_000L) { ranked }
        assertFalse(fresh.kept)
        assertEquals(1_000L, fresh.fetchedAtMs)
        val offline = store.orKept(KeptForAir.NOTAMS, "route", NotamsRanked.serializer(), nowMs = 9_000L) { throw IOException("no signal") }
        assertTrue(offline.kept)
        assertEquals(1_000L, offline.fetchedAtMs)
        assertEquals(ranked, offline.value)
    }

    @Test
    fun withNothingKeptTheFailureIsSaid() {
        val failed = runCatching {
            runBlocking { store.orKept(KeptForAir.NOTAMS, "other", NotamsRanked.serializer()) { throw IOException("no signal") } }
        }
        assertEquals("no signal", failed.exceptionOrNull()?.message)
    }

    @Test
    fun readyToFlyCountsOnBoardOnlyWhatIsThere() {
        val plan = Plan.State(dep = "KOSH", dest = "KMSN")
        val before = KeepForAir.status(store, plan, planSaved = true)
        assertEquals(listOf(KeptForAir.PLAN), before.onBoard)
        assertTrue(KeptForAir.NOTAMS in before.missing.orEmpty())
        // The size said before the download: something, never none.
        assertTrue((before.sizeMb ?: 0.0) > 0.0)

        store.write(KeptForAir.NOTAMS, ReadyFacts.flightKey(plan), "{}")
        store.write(KeptForAir.GO_NO_GO, ReadyFacts.flightKey(plan), "{}")
        val after = KeepForAir.status(store, plan, planSaved = false)
        assertEquals(listOf(KeptForAir.NOTAMS, KeptForAir.GO_NO_GO), after.onBoard)
        assertTrue(KeptForAir.PLAN in after.missing.orEmpty())
    }

    @Test
    fun aPlaceByPositionIsNoField() {
        assertEquals(listOf("KOSH", "KMSN"), KeepForAir.fields(Plan.State(dep = "KOSH", dest = "KMSN", stops = listOf("@43.9,-88.5", "KOSH"))))
    }
}
