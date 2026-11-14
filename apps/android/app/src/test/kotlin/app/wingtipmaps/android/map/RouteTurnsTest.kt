package app.wingtipmaps.android.map

import app.wingtipmaps.android.route.RoutePoint
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Where a route point's name goes (the owner's option A, 2026-11-14),
 *  held to the web's routeTurns.test cases. */
class RouteTurnsTest {
    private val pos0 = listOf(41.0, -88.0)
    private val wetev = listOf(41.0, -87.0)
    private val kmyj = listOf(40.0, -87.0)

    @Test
    fun theNameGoesAwayFromTheTurn() {
        // In from the west, out to the south: the turn's inside is down-left.
        assertEquals(45, RouteTurns.outsideOfTurn(listOf(pos0, wetev, kmyj), 41.0, -87.0))
    }

    @Test
    fun aStraightPointsNameIsSquareToTheCourseOnItsUpperSide() {
        assertEquals(0, RouteTurns.outsideOfTurn(listOf(pos0, wetev, listOf(41.0, -86.0)), 41.0, -87.0))
    }

    @Test
    fun theFirstPointsNameIsOffItsOneLeg() {
        assertEquals(0, RouteTurns.outsideOfTurn(listOf(pos0, wetev, kmyj), 41.0, -88.0))
        assertTrue(RouteTurns.outsideOfTurn(listOf(wetev, kmyj), 41.0, -87.0) in setOf(90, 270))
    }

    @Test
    fun theTurnIsFoundOnADensifiedLinePastARepeatedVertex() {
        val line = listOf(pos0, listOf(41.0, -87.5), wetev, wetev, listOf(40.5, -87.0), kmyj)
        assertEquals(45, RouteTurns.outsideOfTurn(line, 41.0, -87.0))
    }

    @Test
    fun theSideTakesTheMapsBearingOff() {
        assertEquals("bottom", RouteTurns.SIDES[RouteTurns.sideOf(0, 0.0)].first)
        assertEquals("bottom-left", RouteTurns.SIDES[RouteTurns.sideOf(45, 0.0)].first)
        assertEquals("top", RouteTurns.SIDES[RouteTurns.sideOf(180, 0.0)].first)
        // Turned 90 degrees, a name to the east of a point is now above it.
        assertEquals("bottom", RouteTurns.SIDES[RouteTurns.sideOf(90, 90.0)].first)
    }

    @Test
    fun onlyTheFixesAreMarkedAsTurns() {
        val json = RouteTurns.json(
            listOf(pos0, wetev, kmyj),
            listOf(RoutePoint("WETEV", "VFR waypoint", 41.0, -87.0, fix = true), RoutePoint("KMYJ", "Mexico", 40.0, -87.0)),
        )
        assertTrue("\"ident\":\"WETEV\"" in json)
        assertTrue("\"out\":45" in json)
        assertFalse("KMYJ" in json)
    }
}
