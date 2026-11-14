package app.wingtipmaps.android.ui

import app.wingtipmaps.android.api.AirportPlace
import app.wingtipmaps.android.api.generated.Metar
import app.wingtipmaps.android.api.generated.ModelledWeather
import app.wingtipmaps.android.api.generated.NearbyMetar
import app.wingtipmaps.android.api.generated.Runway
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** The airport card's fact strip (C1, the owner, 2026-11-14), as the web's
 *  PlaceFacts and runwayPicks read a field: the longest open runway, a
 *  NOTAM's closure left out, and the category marked "≈" where it is not
 *  the field's own. No start and no wind, so no engine is asked. */
class AirportFactsTest {
    private fun runway(ft: Int, closed: Boolean = false) = Runway(closed = closed, lengthFt = ft, lighted = false)

    private fun place(runways: List<Runway> = emptyList(), metar: Metar? = null, modelled: ModelledWeather? = null, nearby: NearbyMetar? = null) =
        AirportPlace(
            frequencies = emptyList(), ident = "KOSH", kind = "airport", lat = 43.98, lon = -88.56, name = "Wittman Regional",
            runways = runways, towered = true, elevationFt = 808.0, metar = metar, modelledWeather = modelled, nearbyMetar = nearby,
        )

    @Test
    fun theLongestOpenRunwayLeavesOutWhatNasrOrANotamCloses() {
        val p = place(listOf(runway(8002), runway(6178), runway(9000, closed = true), runway(3424)))
        val f = AirportFacts.of(p, null, null, unusable = setOf(0))
        assertEquals(6178, f.longestRunwayFt)
        assertEquals(2, f.openRunways)
        assertEquals(808.0, f.elevationFt)
    }

    @Test
    fun aFieldWithNoReportShowsTheModelsCategoryThenANearStations() {
        val modelled = ModelledWeather(flightCategory = "MVFR", validAt = "2026-11-14T12:00:00Z", visibilitySm = 4.0)
        val near = NearbyMetar(bearingDeg = 90, distanceNm = 6.0, ident = "KFLD", metar = Metar(flightCategory = "IFR"), near = true)
        assertEquals(AirportFacts.Approximate("MVFR"), AirportFacts.approximate(place(modelled = modelled, nearby = near)))
        assertEquals(AirportFacts.Approximate("IFR", "KFLD"), AirportFacts.approximate(place(nearby = near)))
        assertNull(AirportFacts.approximate(place(nearby = near.copy(near = false))))
        assertNull(AirportFacts.approximate(place(metar = Metar(flightCategory = "VFR"), modelled = modelled)))
    }
}
