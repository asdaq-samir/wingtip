package app.wingtipmaps.android.tiles

import org.junit.Assert.assertEquals
import org.junit.Test

/** The one tile-for-a-point helper (TileGrid) that the chart's card
 *  picture (TileTemplate.around) and the kept loop (KeptLoopTiles) share. */
class TileGridTest {
    @Test
    fun oshkoshIsInTheTileEveryXyzServerNamesForIt() {
        // KOSH, 43.98 N 88.56 W: z 10's x 260, y 372 (z/x/y as OSM's tiles name it).
        assertEquals(260, TileGrid.column(-88.5569, 10))
        assertEquals(372, TileGrid.row(43.9844, 10))
        // At zoom 4 southern Wisconsin is x 4, y 5.
        assertEquals(4, TileGrid.column(-89.0, 4))
        assertEquals(5, TileGrid.row(43.5, 4))
    }

    @Test
    fun aPointPastTheProjectionsLimitIsInItsLastRow() {
        // Past MapLibre's MAX_MERCATOR_LATITUDE, top row and bottom row, as
        // the map draws them; the poles themselves too.
        assertEquals(0, TileGrid.row(89.0, 6))
        assertEquals(0, TileGrid.row(90.0, 6))
        assertEquals(63, TileGrid.row(-89.0, 6))
        assertEquals(63, TileGrid.row(-90.0, 6))
        // The antimeridian's east edge is the last column, not one past it.
        assertEquals(63, TileGrid.column(180.0, 6))
        assertEquals(0, TileGrid.column(-180.0, 6))
    }
}
