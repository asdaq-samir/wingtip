package app.wingtipmaps.android.map

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** A shelf's tab offered in several places round its edge (the web's
 *  airspaceShelves.test's "places spread and ranked, a small shelf given
 *  fewer"). */
class ShelfPlacesTest {
    /** A square ring about `side` degrees of latitude across, at 42 N. */
    private fun square(side: Double): List<Pair<Double, Double>> {
        val w = -88.0
        val s = 42.0
        return listOf(w to s, w + side to s, w + side to s + side, w to s + side, w to s)
    }

    @Test
    fun aLargeShelfGetsEightPlacesTheSouthernmostFirst() {
        val places = ShelfPlaces.on(square(1.0))
        assertEquals(ShelfPlaces.LABEL_PLACES, places.size)
        assertEquals(42.0, places[0].second, 1e-9)
        // The next two either way round from it.
        assertTrue(places[1].first > places[0].first || places[1].second > places[0].second)
        assertEquals(places.size, places.distinct().size)
    }

    @Test
    fun aSmallShelfGetsFewerPlacesAtLeastOne() {
        assertEquals(1, ShelfPlaces.on(square(0.01)).size)
        // About 18 km round: two places, 8 km apart at least.
        assertEquals(2, ShelfPlaces.on(square(0.05)).size)
    }

    @Test
    fun aRingOfOnePointIsThatPoint() {
        assertEquals(listOf(1.0 to 2.0), ShelfPlaces.on(listOf(1.0 to 2.0)))
    }
}
