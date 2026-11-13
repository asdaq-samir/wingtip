package app.wingtipmaps.android.map

import app.wingtipmaps.android.flight.OwnShip
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Which look the LocationComponent is given (OwnShipPuck.plane): the
 *  airplane only with a track and a position read now. */
class OwnShipPuckTest {
    private fun fix(track: Double?) = OwnShip.Fix(40.0, -105.0, 5_500.0, track, 110.0, 5.0, 1_000L)

    @Test fun aTrackReadNowIsTheAirplane() {
        assertTrue(OwnShipPuck.plane(OwnShipMark(fix(270.0), OwnShipMark.State.ON), stale = false))
        assertTrue(OwnShipPuck.plane(OwnShipMark(fix(90.0), OwnShipMark.State.DRY_RUN), stale = false))
    }

    @Test fun noTrackIsTheDot() {
        assertFalse(OwnShipPuck.plane(OwnShipMark(fix(null), OwnShipMark.State.ON), stale = false))
    }

    @Test fun staleOrOffIsTheGreyDot() {
        assertFalse(OwnShipPuck.plane(OwnShipMark(fix(270.0), OwnShipMark.State.ON), stale = true))
        assertFalse(OwnShipPuck.plane(OwnShipMark(fix(270.0), OwnShipMark.State.OFF), stale = false))
    }

    @Test fun noFixIsNothing() {
        assertFalse(OwnShipPuck.plane(OwnShipMark(), stale = false))
    }

    @Test fun offKeepsTheLastFixAndTheDryRunWins() {
        val phone = fix(270.0)
        val run = fix(90.0)
        assertEquals(OwnShipMark(phone, OwnShipMark.State.OFF), OwnShipMark.of(phone, on = false, dryRun = null))
        assertEquals(OwnShipMark(phone, OwnShipMark.State.ON), OwnShipMark.of(phone, on = true, dryRun = null))
        assertEquals(OwnShipMark(run, OwnShipMark.State.DRY_RUN), OwnShipMark.of(phone, on = false, dryRun = run))
    }
}
