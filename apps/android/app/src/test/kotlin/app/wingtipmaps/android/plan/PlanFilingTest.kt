package app.wingtipmaps.android.plan

import app.wingtipmaps.android.api.Leg
import app.wingtipmaps.android.api.NavLogTotals
import app.wingtipmaps.android.engine.generated.EngineContract
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

/** The flight plan's forms from a plan: a flight a form, landing to
 *  landing; each item the engine's (given here); what Flight Service is
 *  sent only where every item it needs is there; the persons typed. */
class PlanFilingTest {
    private fun leg(from: String, to: String, ft: Double = 4500.0) =
        Leg(altitudeFt = ft, distanceNm = 30.0, from = from, magneticCourseDeg = 300.0, magneticVariationDeg = -3.0, to = to, trueCourseDeg = 297.0, tasKt = 110.0)

    private val legs = listOf(leg("C81", "BAE"), leg("BAE", "KJVL"), leg("KJVL", "KMSN"), leg("KMSN", "KOSH"))

    private object Fake : PlanFiling.Rules {
        override fun speed(tasKt: Double) = "N%04d".format(tasKt.toInt())
        override fun level(ft: Double) = "A%03d".format((ft / 100).toInt())
        override fun route(via: List<String>, airways: List<String>) = via.ifEmpty { listOf("DCT") }.joinToString(" ")
        override fun times(eteMin: Double?, fuelGal: Double?, legs: List<Leg>) =
            EngineContract.FiledTimesAnswer(eetMinutes = 75, eet = "0115", enduranceMinutes = 270, endurance = "0430")
        override fun dof(depart: String, today: String): String? = null
    }

    private val totals = NavLogTotals(distanceNm = 120.0, legsWithoutWind = 0, unflyableLegs = 0, eteMin = 74.2, usableFuelGal = 40.0)

    @Test
    fun aRouteThatLandsOnTheWayIsOneFlightALanding() {
        val flights = PlanFiling.flights("C81", "KOSH", listOf("BAE", "KJVL", "KMSN"), listOf("KJVL"), legs)
        assertEquals(2, flights.size)
        assertEquals(PlanFiling.Flight("C81", "KJVL", listOf("BAE"), legs.take(2)), flights[0])
        assertEquals(PlanFiling.Flight("KJVL", "KOSH", listOf("KMSN"), legs.drop(2)), flights[1])
    }

    @Test
    fun theFirstFlightsFormIsFiledWhereEveryItemIsThere() {
        val flight = PlanFiling.flights("C81", "KOSH", emptyList(), emptyList(), legs).single()
        val form = PlanFiling.form(
            flight, first = true, last = true, rules = "vfr", aircraftId = "n12345", aircraftType = "c172", depart = "2026-11-21T15:30:00Z",
            totals = totals, fuelGal = null, alternate = "KATW", today = "2026-11-21T12:00:00Z", engine = Fake,
        ).getOrThrow()
        assertEquals("VFR", form.rules)
        assertEquals("N0110", form.speed)
        assertEquals("A045", form.level)
        assertEquals("DCT", form.route)
        // Under VFR no alternate is filed.
        assertNull(form.alternate)
        val request = form.request(persons = 2)
        assertNotNull(request)
        assertEquals("N12345", request!!.aircraftId)
        assertEquals(75, request.eetMinutes)
        assertEquals(2, request.personsOnBoard)
        assertEquals("1530", PlanFiling.utcFigures(form.departTime!!))
    }

    @Test
    fun aFormWithoutItsNumberOrTimeIsNotSent() {
        val flight = PlanFiling.flights("C81", "KOSH", emptyList(), emptyList(), legs).single()
        val form = PlanFiling.form(flight, true, true, "ifr", null, "C172", null, totals, null, "KATW", "2026-11-21T12:00:00Z", Fake).getOrThrow()
        assertEquals("KATW", form.alternate)
        assertNull(form.request(null))
    }

    @Test
    fun thePersonsAreOneTo999() {
        assertEquals(3, PlanFiling.persons(" 3 "))
        assertNull(PlanFiling.persons("0"))
        assertNull(PlanFiling.persons("1000"))
        assertNull(PlanFiling.persons("two"))
    }

    @Test
    fun onlyAnAirportsRouteWithItsLogIsFileable() {
        val planned = app.wingtipmaps.android.Plan.State(dep = "C81", dest = "KOSH", totals = totals)
        assertEquals(true, PlanFiling.fileable(planned))
        assertEquals(false, PlanFiling.fileable(planned.copy(dep = "@41.8800,-87.6300")))
        assertEquals(false, PlanFiling.fileable(planned.copy(totals = null)))
        assertEquals(true, PlanFiling.isAirway("V191"))
        assertEquals(false, PlanFiling.isAirway("KJVL"))
    }
}
