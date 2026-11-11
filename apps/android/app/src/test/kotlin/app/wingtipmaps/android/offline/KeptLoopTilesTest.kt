package app.wingtipmaps.android.offline

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** The loop's newest frame over the route: the tiles asked, whole zoom
 *  levels within the cap, and the address of each. */
class KeptLoopTilesTest {
    @Test
    fun aShortRouteKeepsEveryZoomToTheRadarsDeepest() {
        // KMSN to KOSH, padded a tenth of a degree.
        val tiles = KeptLoopTiles.tiles(42.9, -89.5, 44.1, -88.4)
        assertEquals((KeptLoopTiles.MIN_Z..KeptLoopTiles.MAX_Z).toList(), tiles.map { it.z }.distinct())
        assertTrue(tiles.size <= KeptLoopTiles.MAX_TILES)
        // At zoom 4 southern Wisconsin is in one tile: x 4, y 5.
        assertEquals(listOf(KeptLoopTiles.Tile(4, 4, 5)), tiles.filter { it.z == 4 })
    }

    @Test
    fun aLongRouteDropsTheDeepestZoomsRatherThanPassTheCap() {
        // Seattle to Miami.
        val tiles = KeptLoopTiles.tiles(25.7, -122.4, 47.5, -80.2)
        assertTrue(tiles.size <= KeptLoopTiles.MAX_TILES)
        assertTrue(tiles.maxOf { it.z } < KeptLoopTiles.MAX_Z)
        assertEquals(KeptLoopTiles.MIN_Z, tiles.minOf { it.z })
    }

    @Test
    fun aTilesAddressFillsTheTemplate() {
        assertEquals(
            "https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/ridge::USCOMP-N0Q-202611101200/7/32/47.png",
            KeptLoopTiles.url("https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/ridge::USCOMP-N0Q-202611101200/{z}/{x}/{y}.png", KeptLoopTiles.Tile(7, 32, 47)),
        )
    }

    @Test
    fun aFieldsOwnNotamsAreKeptUnderTheCardsKey() {
        assertEquals("KOSH|field", KeptForAir.fieldNotams("KOSH"))
    }
}
