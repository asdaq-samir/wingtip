package app.wingtipmaps.android.brief

import app.wingtipmaps.android.api.generated.DataCycle
import app.wingtipmaps.android.engine.generated.EngineContract
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.Instant

/** The Brief's out-of-date line (the web's dataWarning): the data sets
 *  past their cycle named in a sentence, each judged again on the
 *  phone's own day by the engine's data_cycle. */
class DataCyclesTest {
    private fun cycle(key: String, name: String, state: String) =
        DataCycle(current = "2026-10-29", edition = "2026-10-29", key = key, kind = "chart", name = name, state = state)

    @Test
    fun theExpiredSetsAreNamedInOneLine() {
        assertNull(DataCycles.warning(listOf(cycle("charts", "Charts", "in_force"))))
        assertEquals("FAA data out of date: charts", DataCycles.warning(listOf(cycle("charts", "Charts", "expired"))))
        assertEquals(
            "FAA data out of date: charts, procedures, and obstacles",
            DataCycles.warning(listOf(cycle("charts", "Charts", "expired"), cycle("cifp", "CIFP", "expired"), cycle("dof", "DOF", "expired"))),
        )
    }

    @Test
    fun aKeptAnswerIsJudgedAgainOnThisDay() {
        val kept = listOf(cycle("charts", "Charts", "in_force"))
        val expired = EngineContract.DataCycleAnswer(
            kind = "chart", cycleDays = 56, current = "2026-12-24", next = "2027-02-18", nextAt = "2027-02-18T09:01:00Z",
            effective = "2026-10-29", expires = "2026-12-24", state = "expired", behind = 1,
        )
        var asked: String? = null
        val judged = DataCycles.onThisDay(kept, Instant.parse("2026-12-30T12:00:00Z")) { _, _, on -> asked = on; expired }
        assertEquals("2026-12-30", asked)
        assertEquals("expired", judged.single().state)
        // Where the engine cannot answer, the planner's judgement stands.
        assertEquals(kept, DataCycles.onThisDay(kept, Instant.parse("2026-12-30T12:00:00Z")) { _, _, _ -> null })
    }
}
