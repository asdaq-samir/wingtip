package app.wingtipmaps.android.altitude

import app.wingtipmaps.android.engine.generated.EngineContract
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Test

/** The altitude screens' own pieces: the planner's words for the
 *  points' altitudes, the slider's nearest step, a row's figures and a
 *  change's words. The figures are the engine's (its own tests). */
class AltitudeTest {
    private val route = listOf("KMSN", "KJVL", "KOSH")

    @After
    fun clear() = PlanAltitudes.clear()

    @Test
    fun crossAtGoesInAltitudesAndStartAtInAltitudeStarts() {
        assertEquals(mapOf("altitudes" to null, "altitude_starts" to null, "altitude_nearest" to null), PlanAltitudes.query(route))
        PlanAltitudes.set(PlanAltitudes.Point("KJVL", 4500.0, PlanAltitudes.How.CROSS_AT))
        PlanAltitudes.set(PlanAltitudes.Point("KJVL", 6500.0, PlanAltitudes.How.CROSS_AT))
        PlanAltitudes.set(PlanAltitudes.Point("KMSN", 5500.0, PlanAltitudes.How.START_AT))
        // A point the route no longer has is not asked for.
        PlanAltitudes.set(PlanAltitudes.Point("KDLH", 3500.0, PlanAltitudes.How.CROSS_AT))
        PlanAltitudes.nearest(true)
        assertEquals(mapOf("altitudes" to "KJVL:6500", "altitude_starts" to "KMSN:5500", "altitude_nearest" to "true"), PlanAltitudes.query(route))
        PlanAltitudes.remove("KJVL")
        assertEquals(null, PlanAltitudes.query(route)["altitudes"])
    }

    @Test
    fun theSliderStartsAtTheNearestStep() {
        val steps = listOf(3500.0, 4500.0, 5500.0)
        assertEquals(1, nearest(steps, 4400.0))
        assertEquals(2, nearest(steps, 9000.0))
        assertEquals(0, nearest(steps, null))
    }

    @Test
    fun aRowsFiguresAreWrittenAsTheNavLogWritesThem() {
        val row = EngineContract.AltitudeAdvisorAnswerItem(
            altitudeFt = 4500.0, eteMin = 65.0, fuelGal = 9.4, tailwindKt = -12.0,
            legal = true, flown = false, fastest = true, economical = false,
        )
        assertEquals("1h 5m · 9.4 gal · 12 kt head", figures(row))
        assertEquals("", figures(row.copy(eteMin = null, fuelGal = null, tailwindKt = null)))
    }

    @Test
    fun aChangeSaysWhereItIsFlown() {
        val c = EngineContract.AltitudeChangeAnswer(kind = "descent", beginsNm = 12.0, endsNm = 18.7, ftPerNm = 318.0)
        assertEquals("Descent from 12.0 nm to 18.7 nm", changeWords(c))
    }
}
