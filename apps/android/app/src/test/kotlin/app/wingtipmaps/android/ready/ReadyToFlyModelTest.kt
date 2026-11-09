package app.wingtipmaps.android.ready

import app.wingtipmaps.android.MainRule
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.offline.OfflineKept
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

/** Ready to fly's facts as the app gathers them, over a fake of the
 *  engine and the planner: no airplane is none, the ages are the
 *  fetches' own, and what is shown is the engine's answer as it is. */
class ReadyToFlyModelTest {
    @get:Rule val main = MainRule()

    // 2026-11-09 18:00Z, as the shared fixture (readyToFly.json) has it.
    private val nowMs = 1_794_247_200_000L

    private fun item(key: String, fix: String?) = EngineContract.ReadyItem(key = key, finding = "caution", line = "Fix $key", detail = "", source = "", fix = fix)

    private val answer = EngineContract.ReadyToFlyAnswer(
        ready = false, finding = "caution", line = "4 things to fix while you have a signal",
        actions = listOf(item("airplane", "pick_airplane"), item("charts", "download_charts"), item("battery", null)),
        items = listOf(item("airplane", "pick_airplane"), item("charts", "download_charts"), item("battery", null), item("notams", "fetch_notams")),
        nextCycle = "2026-11-26", nextCycleIdent = "2612", briefingAgeMin = null,
    )

    private class Weather : ReadyWeather {
        val asked = mutableListOf<String>()
        override suspend fun field(ident: String, role: String): ReadyFacts.FieldWeather {
            asked += ident
            return ReadyFacts.FieldWeather(ident, role, metarObservedS = 1_794_245_400.0, taf = ident == "KMSN")
        }
        override suspend fun notams(plan: Plan.State, cruiseFt: Double?) = listOf("!OSH 11/001 OSH RWY 18/36 CLSD")
    }

    @Test
    fun noAirplaneIsSentAsNoneAndTheEnginesActionsAreShownAsTheyCome() {
        val inputs = mutableListOf<EngineContract.ReadyToFlyInput>()
        val weather = Weather()
        val model = ReadyToFlyModel(rule = { inputs += it; Result.success(answer) }, weather = weather, nowMs = { nowMs })
        model.check(Plan.State(dep = "KOSH", dest = "KMSN"), cruiseFt = null, local = ReadyFacts.Local())

        val sent = inputs.last()
        assertNull(sent.plan?.airplane)
        assertNull(sent.plan?.altitudeFt)
        assertEquals(true, sent.plan?.route)
        assertEquals(1_794_247_200.0, sent.now, 0.0)
        // The departure's and destination's weather, by the roles the engine reads.
        assertEquals(listOf("KOSH", "KMSN"), weather.asked)
        assertEquals(listOf("departure", "destination"), sent.fields?.map { it.role })
        assertEquals(listOf(false, true), sent.fields?.map { it.taf })
        // No NOTAMs fetched is no time, never a guess.
        assertNull(sent.notams?.fetchedAt)
        // The actions are the engine's, in its order; none is added or dropped.
        assertEquals(answer.actions, model.state.value.answer?.actions)
        assertTrue(model.state.value.caution)
    }

    @Test
    fun aPickedAirplaneAndTheFetchesAreSentWithTheirTimes() {
        val inputs = mutableListOf<EngineContract.ReadyToFlyInput>()
        val model = ReadyToFlyModel(rule = { inputs += it; Result.success(answer) }, weather = Weather(), nowMs = { nowMs })
        val plan = Plan.State(dep = "KOSH", dest = "KMSN", aircraft = "c172")
        model.check(plan, cruiseFt = 5500.0, local = ReadyFacts.Local(briefAtMs = nowMs - 20 * 60_000))
        model.fetchNotams()

        val sent = inputs.last()
        assertEquals("C172", sent.plan?.airplane)
        assertEquals(5500.0, sent.plan?.altitudeFt)
        assertEquals(1_794_246_000.0, sent.briefing?.fetchedAt)
        assertEquals(1_794_247_200.0, sent.notams?.fetchedAt)
        assertEquals(listOf("!OSH 11/001 OSH RWY 18/36 CLSD"), model.state.value.notams)
    }

    @Test
    fun theEnginesFailureIsSaidNotHidden() {
        val model = ReadyToFlyModel(rule = { Result.failure(IllegalStateException("bad edition")) }, weather = Weather(), nowMs = { nowMs })
        model.check(Plan.State(), cruiseFt = null, local = ReadyFacts.Local())
        assertNull(model.state.value.answer)
        assertTrue(model.state.value.problem!!.contains("bad edition"))
        assertFalse(model.state.value.caution)
    }

    @Test
    fun noRouteAsksNoWeather() {
        val weather = Weather()
        val inputs = mutableListOf<EngineContract.ReadyToFlyInput>()
        val model = ReadyToFlyModel(rule = { inputs += it; Result.success(answer) }, weather = weather, nowMs = { nowMs })
        model.check(Plan.State(), cruiseFt = null, local = ReadyFacts.Local())
        assertTrue(weather.asked.isEmpty())
        assertEquals(false, inputs.last().plan?.route)
        assertEquals(emptyList<EngineContract.ReadyToFlyInputFieldsItem>(), inputs.last().fields)
    }

    @Test
    fun theRoutesChartsAreKeptOnlyWhereAWholeRegionTakesItAllIn() {
        val box = listOf(-90.0, 42.0, -88.0, 45.0)
        val whole = OfflineKept("chicago", "Chicago", "10-29-2026", boxes = listOf(box), wanted = mapOf("sec" to 1L), done = listOf("sec"))
        val half = whole.copy(cycle = "12-24-2026", done = emptyList())
        val route = listOf(43.0 to -89.0, 44.0 to -88.5)

        val kept = ReadyFacts.charts(listOf(whole, half), route)!!
        assertEquals(true, kept.kept)
        // The cycle's effective date as the engine reads an edition.
        assertEquals("2026-10-29", kept.edition)

        val beyond = ReadyFacts.charts(listOf(whole), route + (46.0 to -88.5))!!
        assertEquals(false, beyond.kept)
        assertNull(beyond.edition)
        assertNull(ReadyFacts.charts(listOf(whole), emptyList()))
    }

    @Test
    fun theCruiseIsTheHighestLegAndNoneWithoutLegs() {
        assertEquals(6500.0, ReadyFacts.cruise(listOf(4500.0, 6500.0, 3000.0)))
        assertNull(ReadyFacts.cruise(emptyList()))
    }
}
