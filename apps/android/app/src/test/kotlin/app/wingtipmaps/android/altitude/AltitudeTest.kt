package app.wingtipmaps.android.altitude

import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.api.Leg
import app.wingtipmaps.android.api.generated.AircraftProfile
import app.wingtipmaps.android.engine.generated.EngineContract
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
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

    private fun leg(from: String, to: String, gph: Double?) = Leg(
        altitudeFt = 5500.0, distanceNm = 30.0, from = from, to = to, groundspeedKt = 110.0, tasKt = 118.0, fuelBurnGph = gph, oatC = 4.0,
        magneticCourseDeg = 300.0, magneticVariationDeg = -3.0, trueCourseDeg = 297.0,
    )

    // A made-up airplane for the mapping alone; its figures are no type's.
    private val airplane = AircraftProfile(
        name = "test", cruiseTasKt = 120.0, fuelBurnGph = 9.0, climbTasKt = 75.0, climbRateFpmSeaLevel = 700.0, climbFuelBurnGph = 11.0, serviceCeilingFt = 14000.0,
    )

    @Test
    fun aWaypointsChangeIsFlownOnTheLegOutOfItElseTheLegIn() {
        val plan = Plan.State(legs = listOf(leg("KMSN", "KJVL", 8.5), leg("KJVL", "KOSH", 9.5)))
        val points = ProfileModel.waypoints(plan, 60.0)
        assertEquals(listOf("KMSN", "KJVL", "KOSH"), points.map { it.ident })
        assertEquals(listOf("KMSN", "KJVL", "KJVL"), points.map { it.leg?.from })
    }

    @Test
    fun thePickedAirplanesFiguresGoToTheEngineAndNoneWithout() {
        val profile = AltitudeEngine.profileOf(airplane)
        assertEquals(700.0, profile.climbRateFpmSeaLevel)
        assertEquals(75.0, profile.climbTasKt)
        assertEquals(11.0, profile.climbFuelBurnGph)
        assertEquals(120.0, profile.cruiseTasKt)
        // The leg's burn first, then the airplane's cruise burn; with no
        // airplane none, so the engine gives no fuel.
        assertEquals(8.5, AltitudeEngine.burn(8.5, airplane))
        assertEquals(9.0, AltitudeEngine.burn(null, airplane))
        assertNull(AltitudeEngine.burn(8.5, null))
    }
}
