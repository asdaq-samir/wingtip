package app.wingtipmaps.android.ui

import app.wingtipmaps.android.api.generated.VerdictItem
import app.wingtipmaps.android.strip.Finding
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** What the plan's Brief button counts (PlanFoot's badge): every stop and
 *  caution of the Go / No-Go, the stops first, as the web's findingRows
 *  counts them; a go, an unknown and one still asked count for nothing. */
class BriefFindingsTest {
    private fun item(key: String, finding: String) = VerdictItem(detail = "", finding = finding, key = key, label = key, tab = "brief")

    @Test
    fun theStopsAndCautionsAreCountedStopsFirst() {
        val state = BriefModel.State(items = listOf(item("a", "caution"), item("b", "ok"), item("c", "stop"), item("d", "pending"), item("e", "caution")))
        assertEquals(listOf(Finding.STOP, Finding.CAUTION, Finding.CAUTION), state.found)
    }

    @Test
    fun aBriefWithNothingToActOnCountsNone() {
        assertTrue(BriefModel.State(items = listOf(item("a", "ok"), item("b", "unknown"))).found.isEmpty())
        assertTrue(BriefModel.State().found.isEmpty())
    }
}
