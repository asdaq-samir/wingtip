package app.wingtipmaps.android.route

import app.wingtipmaps.android.api.generated.ProcedureList
import app.wingtipmaps.android.api.generated.ProcedureSummary
import app.wingtipmaps.android.engine.generated.EngineContract
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** A typed SID or STAR not found where its field's list did not load is unchecked, never said
 *  unpublished (route_typed_picks, 14 CFR 91.103; the web's useProcedurePicks). The engine does not
 *  load on the JVM, so its answer is given here, as the engine's own tests pin what it says: these
 *  hold what the phone sends it and what the phone makes of its answer. */
class TypedRouteTest {
    private val departure = ProcedureList("KPWK", "2611", listOf(ProcedureSummary("PWK1", "departure", "PALWAUKEE ONE", null, emptyList(), emptyList())))

    private fun read(vararg names: Pair<String, String?>) = TypedRoute.Read(
        listOf("KPWK", "KLAS"),
        null,
        names.map { (name, before) -> EngineContract.RouteTypedAnswerProceduresItem(name, before, null) },
    )

    private fun answer(
        picks: List<EngineContract.RouteTypedPicksAnswerPicksItem> = emptyList(),
        missed: List<String> = emptyList(),
        unchecked: List<String> = emptyList(),
    ) = Result.success(EngineContract.RouteTypedPicksAnswer(picks, missed, unchecked))

    @Test
    fun aListThatDidNotLoadIsSentAsNoneSoTheEngineCallsItsNamesUnchecked() = runBlocking {
        var sentArrival: EngineContract.RouteTypedPicksInputArrival? = EngineContract.RouteTypedPicksInputArrival("X", emptyList())
        var sentDeparture: EngineContract.RouteTypedPicksInputDeparture? = null
        val picked = TypedRoute.picks(read("ANJLL4" to "BCE"), "KPWK", "KLAS", { if (it == "KPWK") departure else null }) { _, d, a ->
            sentDeparture = d
            sentArrival = a
            answer(unchecked = listOf("ANJLL4"))
        }
        assertEquals("KPWK", sentDeparture?.ident)
        assertEquals(listOf("PWK1"), sentDeparture?.procedures?.map { it.id })
        assertNull(sentArrival)
        assertEquals(emptyList<String>(), picked.missed)
        assertEquals(listOf("ANJLL4"), picked.unchecked)
        assertEquals(0, picked.picks.size)
    }

    @Test
    fun thePickTakesItsNameFromTheFieldsOwnListAndKeepsMissedAndUncheckedApart() = runBlocking {
        val arrival = ProcedureList("KLAS", "2611", emptyList())
        val picked = TypedRoute.picks(read("PWK1" to "KPWK", "ANJLL4" to "BCE", "OSHH2" to null), "KPWK", "KLAS", { if (it == "KPWK") departure else arrival }) { _, _, _ ->
            answer(listOf(EngineContract.RouteTypedPicksAnswerPicksItem("KPWK", "PWK1", "departure", null)), listOf("ANJLL4"), listOf("OSHH2"))
        }
        assertEquals(listOf("PALWAUKEE ONE"), picked.picks.map { it.name })
        assertEquals(listOf("ANJLL4"), picked.missed)
        assertEquals(listOf("OSHH2"), picked.unchecked)
    }

    @Test
    fun whereTheEngineCannotAnswerEveryNameIsUncheckedNeverMissed() = runBlocking {
        val arrival = ProcedureList("KLAS", "2611", emptyList())
        val picked = TypedRoute.picks(read("ANJLL4" to "BCE", "PWK1" to "KPWK"), "KPWK", "KLAS", { if (it == "KPWK") departure else arrival }) { _, _, _ ->
            Result.failure(IllegalStateException("no engine"))
        }
        assertEquals(emptyList<String>(), picked.missed)
        assertEquals(listOf("ANJLL4", "PWK1"), picked.unchecked)
    }
}
