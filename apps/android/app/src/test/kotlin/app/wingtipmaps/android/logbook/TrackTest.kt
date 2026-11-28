package app.wingtipmaps.android.logbook

import app.wingtipmaps.android.api.generated.DraftTrackPoint
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotSame
import org.junit.Test

/** The recorded track appended to without a copy of it (Track; the
 *  round-4 phones audit, 2026-11-27): each view holds its own points. */
class TrackTest {
    private fun at(t: Int) = DraftTrackPoint(lat = 42.0, lon = -88.0, t = t * 5_000.0)

    @Test
    fun eachViewKeepsItsOwnPointsAsTheTrackGrows() {
        val one = Track.of(listOf(at(0)))
        val two = one.appended(at(1))
        val three = two.appended(at(2))
        assertEquals(1, one.size)
        assertEquals(listOf(at(0), at(1)), two)
        assertEquals(listOf(at(0), at(1), at(2)), three)
    }

    @Test
    fun anOlderViewAppendedToIsCopiedNotOverwritten() {
        val one = Track.of(listOf(at(0)))
        val two = one.appended(at(1))
        val fork = one.appended(at(9))
        assertEquals(listOf(at(0), at(1)), two)
        assertEquals(listOf(at(0), at(9)), fork)
        assertNotSame(two, fork)
    }

    @Test
    fun aTrackIsTakenAsItIsAndEqualsAPlainList() {
        val track = Track.of(listOf(at(0), at(1)))
        assertEquals(track, Track.of(track))
        assertEquals(listOf(at(0), at(1)), track)
        assertEquals(Recorded(points = listOf(at(0), at(1))), Recorded(points = track))
    }
}
