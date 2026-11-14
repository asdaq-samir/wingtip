package app.wingtipmaps.android.map

import org.junit.Assert.assertEquals
import org.junit.Test

/** Where a mark is against the room a card leaves (the web's camera rules,
 *  2026-11-14): a tap in the room moves nothing; one the card hides is
 *  eased out from under it; one off the screen is gone to. */
class MapCameraTest {
    // A 1080 by 2400 phone with its sheet at half, an edge of 80 px.
    private fun at(x: Float, y: Float) = MapCamera.sight(x, y, 1080, 2400, 1200, 80f)

    @Test
    fun aMarkInTheRoomStaysWhereItIs() {
        assertEquals(MapCamera.Sight.InRoom, at(540f, 600f))
    }

    @Test
    fun aMarkUnderTheCardOrAtAnEdgeIsHidden() {
        assertEquals(MapCamera.Sight.Hidden, at(540f, 1800f))
        assertEquals(MapCamera.Sight.Hidden, at(540f, 1150f))
        assertEquals(MapCamera.Sight.Hidden, at(20f, 600f))
        assertEquals(MapCamera.Sight.Hidden, at(540f, 40f))
    }

    @Test
    fun aMarkOffTheScreenIsAway() {
        assertEquals(MapCamera.Sight.Away, at(-5f, 600f))
        assertEquals(MapCamera.Sight.Away, at(540f, 2500f))
    }
}
