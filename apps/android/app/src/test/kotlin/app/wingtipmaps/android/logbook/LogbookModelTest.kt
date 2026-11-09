package app.wingtipmaps.android.logbook

import app.wingtipmaps.android.MainRule
import app.wingtipmaps.android.api.generated.LogbookDraft
import app.wingtipmaps.android.api.generated.LogbookDraftAsk
import app.wingtipmaps.android.api.generated.gateway.CurrencyDto
import app.wingtipmaps.android.api.generated.gateway.LogbookEntryDto
import app.wingtipmaps.android.api.generated.gateway.LogbookEntryRequest
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

/** The logbook edited where it is shown: a row opened, changed and saved
 *  through the gateway's PUT, a bad figure said in the row, and a delete
 *  that waits on its Undo row before it is sent. */
class LogbookModelTest {
    @get:Rule val main = MainRule()

    private fun entry(id: Long, on: String, route: String) = LogbookEntryDto(
        aircraft = "N123AB", airHours = 1.2, approaches = 1, crossCountryHours = 1.4, dayLandings = 1, distanceNm = 70.0, dualHours = 0.0,
        flightId = 9, flownOn = on, fromTrack = true, holding = false, id = id, instrumentHours = 0.3, longestLegNm = 70.0, nightHours = 0.0,
        nightLandings = 0, route = route, soloHours = 0.0, totalHours = 1.4, touchAndGoes = 0, toweredLandings = 1, tracking = true,
    )

    private val older = entry(1, "2026-11-01", "KDPA KMSN")
    private val newer = entry(2, "2026-11-08", "KMSN KDPA")

    private class Servers(var list: List<LogbookEntryDto>) : LogbookSource, LogbookEdits {
        val updated = mutableListOf<Pair<Long, LogbookEntryRequest>>()
        val deleted = mutableListOf<Long>()
        var refuse = false
        override suspend fun draft(ask: LogbookDraftAsk): LogbookDraft = error("not asked")
        override suspend fun add(entry: LogbookEntryRequest): LogbookEntryDto = error("not asked")
        override suspend fun entries() = list.filterNot { it.id in deleted }
        override suspend fun currency() = CurrencyDto(
            approachesInWindow = 1, crossCountryHours = 1.4, flights = 2, holdingInWindow = false, landings = 2,
            nightHours = 0.0, totalHours = 2.8, trackingInWindow = true,
        )
        override suspend fun update(id: Long, entry: LogbookEntryRequest): LogbookEntryDto {
            if (refuse) error("refused")
            updated += id to entry
            val saved = list.first { it.id == id }.copy(flownOn = entry.flownOn, route = entry.route, totalHours = entry.totalHours, remarks = entry.remarks)
            list = list.map { if (it.id == id) saved else it }
            return saved
        }
        override suspend fun delete(id: Long) {
            if (refuse) error("refused")
            deleted += id
        }
    }

    @Test
    fun aRowIsEditedAndSavedWhereItIs() = runTest {
        val servers = Servers(listOf(older, newer))
        val model = LogbookModel(servers, servers)
        assertEquals(listOf(2L, 1L), model.state.value.entries.map { it.id })
        model.edit(1)
        assertEquals(1L, model.state.value.editing)
        model.save(LogbookForm.of(older).copy(total = "1.6", remarks = "Gusty", route = "kdpa kjvl kmsn"))
        val (id, sent) = servers.updated.single()
        assertEquals(1L, id)
        assertEquals(1.6, sent.totalHours, 0.0)
        assertEquals("KDPA KJVL KMSN", sent.route)
        // What the row does not show is kept as it was.
        assertEquals(1, sent.approaches)
        assertEquals(9L, sent.flightId)
        assertNull(model.state.value.editing)
        assertEquals(1.6, model.state.value.entries.first { it.id == 1L }.totalHours, 0.0)
    }

    @Test
    fun aFigureThatDoesNotReadIsSaidInTheRow() = runTest {
        val servers = Servers(listOf(older))
        val model = LogbookModel(servers, servers)
        model.edit(1)
        model.save(LogbookForm.of(older).copy(total = "one"))
        assertTrue(servers.updated.isEmpty())
        assertEquals(1L, model.state.value.editing)
        assertNotNull(model.state.value.editProblem)
        model.save(LogbookForm.of(older).copy(date = "9 Nov"))
        assertTrue(model.state.value.editProblem!!.contains("2026-11-09"))
        servers.refuse = true
        model.save(LogbookForm.of(older))
        assertTrue(model.state.value.editProblem!!.startsWith("The entry could not be saved"))
        model.cancelEdit()
        assertNull(model.state.value.editing)
        assertNull(model.state.value.editProblem)
    }

    @Test
    fun aDeleteWaitsOnItsUndo() = runTest {
        val servers = Servers(listOf(older, newer))
        val model = LogbookModel(servers, servers)
        model.delete(2)
        assertEquals(listOf(1L), model.state.value.entries.map { it.id })
        assertEquals(LogbookModel.Removed(newer, 0), model.state.value.removed)
        assertTrue("nothing sent yet", servers.deleted.isEmpty())
        model.undoDelete()
        assertEquals(listOf(2L, 1L), model.state.value.entries.map { it.id })
        assertNull(model.state.value.removed)

        model.delete(2)
        model.deleteKept(2)
        assertEquals(listOf(2L), servers.deleted)
        assertNull(model.state.value.removed)
        assertEquals(listOf(1L), model.state.value.entries.map { it.id })
    }

    @Test
    fun aSecondDeleteKeepsTheFirstAndARefusalBringsItBack() = runTest {
        val servers = Servers(listOf(older, newer))
        val model = LogbookModel(servers, servers)
        model.delete(2)
        model.delete(1)
        assertEquals(listOf(2L), servers.deleted)
        assertEquals(1L, model.state.value.removed?.entry?.id)
        servers.refuse = true
        model.deleteKept(1)
        assertEquals(listOf(1L), model.state.value.entries.map { it.id })
        assertTrue(model.state.value.problem!!.startsWith("The entry could not be deleted"))
    }
}
