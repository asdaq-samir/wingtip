package app.wingtipmaps.android.route

import app.wingtipmaps.android.api.generated.ProcedureList
import app.wingtipmaps.android.api.generated.ProcedureSummary
import app.wingtipmaps.android.engine.generated.EngineContract
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Test

/** A typed SID or STAR not found where its field's list did not load is unchecked, never said
 *  unpublished (route_typed_picks, 14 CFR 91.103; the web's useProcedurePicks). */
class TypedRouteTest {
    private val departure = ProcedureList("KPWK", "2611", listOf(ProcedureSummary("PWK1", "departure", "PALWAUKEE ONE", null, emptyList(), emptyList())))

    private fun read(vararg names: Pair<String, String?>) = TypedRoute.Read(
        listOf("KPWK", "KLAS"),
        null,
        names.map { (name, before) -> EngineContract.RouteTypedAnswerProceduresItem(name, before, null) },
    )

    @Test
    fun aStarIntoADestinationWhoseListDidNotLoadIsUncheckedNotMissed() = runBlocking {
        val picked = TypedRoute.picks(read("ANJLL4" to "BCE"), "KPWK", "KLAS") { if (it == "KPWK") departure else null }
        assertEquals(emptyList<String>(), picked.missed)
        assertEquals(listOf("ANJLL4"), picked.unchecked)
        assertEquals(0, picked.picks.size)
    }

    /** The engine does not load on the JVM (as FieldRules says), which is the failure this holds: with both
     *  lists in, a name the engine could not look at is unchecked, never told the pilot it is unpublished. */
    @Test
    fun whereTheEngineCannotAnswerEveryNameIsUncheckedNeverMissed() = runBlocking {
        val arrival = ProcedureList("KLAS", "2611", emptyList())
        val picked = TypedRoute.picks(read("ANJLL4" to "BCE", "PWK1" to "KPWK"), "KPWK", "KLAS") { if (it == "KPWK") departure else arrival }
        assertEquals(emptyList<String>(), picked.missed)
        assertEquals(listOf("ANJLL4", "PWK1"), picked.unchecked)
    }
}
