package app.wingtipmaps.android.ui

import app.wingtipmaps.android.api.generated.VerdictItem
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.strip.Finding
import app.wingtipmaps.android.strip.GlanceAction
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

    /** The head's actions are the engine's gonogo_glance_lines as it
     *  answers, in its order and words: the app neither ranks nor cuts
     *  them, and sends every finding with its section kept. */
    @Test
    fun theActionsAreTheEnginesLines() {
        var asked: List<EngineContract.GonogoItem> = emptyList()
        val line = { key: String, finding: String, words: String ->
            EngineContract.GonogoGlanceLinesAnswerActItem(key = key, finding = finding, tab = "brief", line = words, lead = words, action = "", why = "", cite = "", raw = emptyList())
        }
        val actions = BriefModel.glanceActions(listOf(item("fuel", "caution"), item("weather", "stop").copy(section = "Ceiling"))) { items ->
            asked = items
            EngineContract.GonogoGlanceLinesAnswer(
                act = listOf(line("weather", "stop", "IFR at the destination: wait or plan another field."), line("fuel", "caution", "Fuel is short.")),
                rest = EngineContract.GonogoGlanceLinesAnswerRest(line = "", finding = "ok", items = emptyList()),
            )
        }
        assertEquals(listOf("fuel", "weather"), asked.map { it.key })
        assertEquals("Ceiling", asked[1].section)
        assertEquals(
            listOf(GlanceAction("weather", Finding.STOP, "IFR at the destination: wait or plan another field."), GlanceAction("fuel", Finding.CAUTION, "Fuel is short.")),
            actions,
        )
    }

    @Test
    fun noLinesWhereTheEngineCannotAnswer() {
        assertTrue(BriefModel.glanceActions(listOf(item("fuel", "caution"))) { null }.isEmpty())
        assertTrue(BriefModel.glanceActions(emptyList()) { error("not asked") }.isEmpty())
    }
}
