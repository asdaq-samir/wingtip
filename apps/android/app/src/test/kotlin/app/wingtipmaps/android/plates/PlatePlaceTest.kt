package app.wingtipmaps.android.plates

import app.wingtipmaps.android.api.generated.PlateCorner
import app.wingtipmaps.android.api.generated.PlateOverlay
import app.wingtipmaps.android.api.generated.PlatePage
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** A plate placed from the planner's answer, its corners in MapLibre's
 *  image order, and a tap found on its page, turned or not. */
class PlatePlaceTest {
    private val pick = PlatePick("KOSH", "I36")
    private val overlay = PlateOverlay(circling = false, cycle = "2611", east = -88.50, fixes = emptyList(), name = "ILS OR LOC RWY 36", north = 44.05, south = 43.85, west = -88.62)

    @Test
    fun aPlateWithNoPageIsPlacedByItsPlanViewTopLeftFirst() {
        val placed = PlacedPlate.of(pick, overlay)!!
        assertEquals(listOf(LatLon(44.05, -88.62), LatLon(44.05, -88.50), LatLon(43.85, -88.50), LatLon(43.85, -88.62)), placed.corners)
        assertEquals("/api/approach-plate/2611/KOSH/I36.png", placed.picture)
        assertEquals("KOSH-I36", pick.key)
    }

    @Test
    fun theWholePageIsPlacedByItsFourCornersWithItsOwnPicture() {
        fun at(lat: Double, lon: Double) = PlateCorner(lat, lon)
        val page = PlatePage(
            topLeft = at(44.10, -88.70), topRight = at(44.11, -88.40),
            bottomRight = at(43.70, -88.39), bottomLeft = at(43.69, -88.69),
            width = 1700, height = 2200,
        )
        val placed = PlacedPlate.of(pick, overlay.copy(page = page))!!
        assertEquals(listOf(LatLon(44.10, -88.70), LatLon(44.11, -88.40), LatLon(43.70, -88.39), LatLon(43.69, -88.69)), placed.corners)
        assertEquals("/api/approach-plate-page/2611/KOSH/I36.png", placed.picture)
    }

    @Test
    fun aPlateWithNoPlaceIsNotPlaced() {
        assertNull(PlacedPlate.of(pick, overlay.copy(north = Double.NaN)))
    }

    @Test
    fun aTapIsOnThePageInsideItsCornersTurnedOrNot() {
        val square = PlacedPlate.of(pick, overlay)!!.corners
        assertTrue(PlacedPlate.contains(square, 43.95, -88.56))
        assertFalse(PlacedPlate.contains(square, 44.10, -88.56))
        // A page turned 45 degrees: a diamond round the same middle.
        val diamond = listOf(LatLon(44.05, -88.56), LatLon(43.95, -88.46), LatLon(43.85, -88.56), LatLon(43.95, -88.66))
        assertTrue(PlacedPlate.contains(diamond, 43.95, -88.56))
        assertFalse(PlacedPlate.contains(diamond, 44.04, -88.65))
    }
}
