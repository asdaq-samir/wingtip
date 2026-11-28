package app.wingtipmaps.android.plan

import app.wingtipmaps.android.api.generated.FuelStop
import app.wingtipmaps.android.api.generated.FuelStopSuggestion
import app.wingtipmaps.android.engine.generated.EngineContract
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The plan's fuel gauges: the points sent to the engine's fuel_in_tanks
 *  (a stop fuelled, the pilot's own fill), its answers put at each field,
 *  no gauges where a stop matches no leg; the `tanks` query; Add Fuel
 *  Stops' route; and the gauge's words. */
class PlanTanksTest {
    private val figures = PlanTanks.Figures(usableGal = 40.0, taxiGal = 1.4, reservesGal = listOf(6.0, 7.5))
    private val legs = listOf(PlanTanks.LegBurn("WP1", 4.0), PlanTanks.LegBurn("KJVL", 6.0), PlanTanks.LegBurn("KOSH", 9.0))

    private fun stop(ident: String) = FuelStop(
        addedNm = 4.0, city = "", fromNm = 100.0, fuelTypes = "100LL", ident = ident, landsWithGal = 12.0,
        lat = 40.0, lon = -110.0, minutes = 60.0, name = ident, runwayFt = 5000,
    )

    @After
    fun forget() = PlanTanks.clear()

    @Test
    fun aStopLandedAtIsFuelledWithThePilotsOwnFigureAndEachFieldGetsItsAnswer() {
        var sent: List<EngineContract.FuelInTanksInputPointsItem> = emptyList()
        val tanks = PlanTanks.walk(legs, "C81", listOf("KJVL"), listOf(true), figures, mapOf("C81" to 20, "KJVL" to 0)) { points, _ ->
            sent = points
            Result.success(points.indices.map { EngineContract.FuelInTanksAnswerItem(gal = 30.0 - it * 10, low = it == 3) })
        }
        assertEquals(4, sent.size)
        assertEquals(true, sent[0].departure)
        assertEquals(20.0, sent[0].fillGal)
        // KJVL ends the second leg: fuelled there, none bought.
        assertEquals(true, sent[2].refuel)
        assertEquals(0.0, sent[2].fillGal)
        assertEquals(false, sent[1].refuel)
        assertEquals(30.0, tanks.getValue(PlanTanks.At(-1)).gal, 0.0)
        assertEquals(10.0, tanks.getValue(PlanTanks.At(0)).gal, 0.0)
        assertEquals(0, tanks.getValue(PlanTanks.At(0)).own)
        assertTrue(tanks.getValue(PlanTanks.At(1)).low)
    }

    @Test
    fun aStopNoLegEndsAtShowsNoGaugesRatherThanWrongOnes() {
        val tanks = PlanTanks.walk(legs, "C81", listOf("KMSN"), listOf(true), figures, emptyMap()) { _, _ -> error("not asked") }
        assertTrue(tanks.isEmpty())
        assertTrue(PlanTanks.walk(legs, "C81", emptyList(), emptyList(), null, emptyMap()) { _, _ -> error("not asked") }.isEmpty())
    }

    @Test
    fun theQueryNamesOnlyTheRoutesFields() {
        PlanTanks.set("c81", 20)
        PlanTanks.set("KMSN", 0)
        assertEquals("C81:20", PlanTanks.query(listOf("C81", "KOSH"))["tanks"])
        PlanTanks.set("C81", null)
        assertNull(PlanTanks.query(listOf("C81", "KOSH"))["tanks"])
    }

    @Test
    fun everyFlightsFuelStopsGoInAfterItsOwnDeparture() {
        val suggested = listOf(
            FuelStopSuggestion(departure = "KLAS", destination = "KSLC", reason = "fuel", stops = listOf(stop("KCDC")), usableGal = 40.0),
            FuelStopSuggestion(departure = "KSLC", destination = "KPWK", reason = "fuel", stops = listOf(stop("KRKS")), usableGal = 40.0),
            FuelStopSuggestion(departure = "KLAS", destination = "KPWK", reason = "break", stops = listOf(stop("KBTF")), usableGal = 40.0),
        )
        val (stops, added) = PlanTanks.withFuelStops("KLAS", listOf("KSLC"), suggested)!!
        assertEquals(listOf("KCDC", "KSLC", "KRKS"), stops)
        assertEquals(listOf("KCDC", "KRKS"), added)
        assertNull(PlanTanks.withFuelStops("KLAS", stops, suggested))
    }

    @Test
    fun theGaugesWords() {
        assertEquals("23 gal", PlanTanks.words(23.9))
        assertEquals("12 gal short", PlanTanks.words(-11.2))
    }

    @Test
    fun eachFlightIsReadAgainstItsOwnReserveAndTheAlternatesFuel() {
        fun totals(reserve: Double?) = app.wingtipmaps.android.api.NavLogTotals(distanceNm = 100.0, legsWithoutWind = 0, unflyableLegs = 0, usableFuelGal = 40.0, taxiGal = 1.4, reserveGal = reserve)
        val route = totals(null).copy(
            hops = listOf(
                app.wingtipmaps.android.api.generated.HopTotals("C81", "KJVL", totals(5.0)),
                app.wingtipmaps.android.api.generated.HopTotals("KJVL", "KOSH", totals(null)),
            ),
            alternate = app.wingtipmaps.android.api.generated.AlternateLeg(altitudeFt = 3000.0, distanceNm = 20.0, fuelGal = 2.5, ident = "KATW"),
        )
        val f = PlanTanks.Figures.of(route)!!
        assertEquals(listOf(5.0, null), f.reservesGal)
        assertEquals(2.5, f.alternateGal!!, 0.0)
        var asked: PlanTanks.Figures? = null
        PlanTanks.walk(legs, "C81", listOf("KJVL"), listOf(true), f, emptyMap()) { points, figures ->
            asked = figures
            Result.success(points.map { EngineContract.FuelInTanksAnswerItem(gal = 20.0, low = false) })
        }
        assertEquals(f, asked)
    }
}
