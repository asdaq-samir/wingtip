package app.wingtipmaps.android

import androidx.test.ext.junit.runners.AndroidJUnit4
import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.engine.generated.diagramGraticule
import app.wingtipmaps.android.engine.generated.inFlight
import app.wingtipmaps.android.engine.generated.verticalSpeed
import app.wingtipmaps.android.flight.OwnShip
import app.wingtipmaps.android.ui.DiagramPage
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/** The engine's in-flight names (#218) as Android asks them through the bindings:
 *  in_flight as InFlight asks it, the vertical speed, and
 *  own ship on KDLH's diagram, which is drawn with north to the page's
 *  left. The same cases as the iPhone's InFlightTests. */
@RunWith(AndroidJUnit4::class)
class InFlightEngineTest {
    private fun ask(lat: Double, lon: Double, kt: Double): EngineContract.InFlightAnswer? =
        Engine.inFlight(
            fix = EngineContract.InFlightInputFix(lat, lon, 0.0, kt),
            line = listOf(listOf(42.0, -88.0), listOf(43.0, -88.0), listOf(43.0, -87.0)),
            points = listOf(
                EngineContract.InFlightInputPointsItem("A", 42.0, -88.0),
                EngineContract.InFlightInputPointsItem("B", 43.0, -88.0),
                EngineContract.InFlightInputPointsItem("C", 43.0, -87.0),
            ),
            legs = listOf(EngineContract.InFlightInputLegsItem(60.0, 6.0), EngineContract.InFlightInputLegsItem(44.0, 4.4)),
            fuelStartGal = 40.0,
            nowS = 1_793_620_000.0,
        ).getOrThrow()

    @Test
    fun halfWayUpTheFirstLegTheNextIsItsEnd() {
        val p = ask(42.5, -88.05, 120.0)!!
        assertTrue(p.onRoute)
        assertEquals("B", p.next?.name)
        assertEquals(30.0, p.next!!.distanceNm, 0.5)
        assertEquals("C", p.destination?.name)
        assertEquals(3.0, p.burntGal, 0.1)
        assertEquals("left", p.offSide)
        assertFalse(ask(42.5, -88.2, 120.0)!!.onRoute)
    }

    @Test
    fun theVerticalSpeedIsTheSlopeOfTenSeconds() {
        val fpm = Engine.verticalSpeed((0..10).map { EngineContract.VerticalSpeedInputSamplesItem(it.toDouble(), 3000.0 + 5 * it) }).getOrThrow()
        assertEquals(300.0, fpm!!, 0.001)
    }

    @Test
    fun ownShipIsPlacedOnKdlhsDiagram() {
        fun label(text: String, x: Double, y: Double) = EngineContract.DiagramGraticuleInputLabelsItem(text, x, y)
        val g = Engine.diagramGraticule(
            listOf(
                label("92°13'W", 363.85, 485.90), label("46°51'N", 69.35, 77.21),
                label("46°50'N", 296.60, 76.58), label("92°12'W", 362.69, 328.17),
            ),
        ).getOrThrow()
        assertNotNull(g)
        assertTrue(g!!.latOnX)
        assertEquals(270.0, g.northDeg, 1e-9)
        val page = DiagramPage(android.graphics.Bitmap.createBitmap(1, 1, android.graphics.Bitmap.Config.ARGB_8888), 387.36f, 594f, g)
        val at = page.place(OwnShip.Fix(46.8417, -92.1936, 1428.0, 90.0, 10.0, 5.0, 0L)).getOrThrow()!!
        assertTrue(at.onPage)
        assertEquals(183.0, at.x, 2.0)
    }

    /** AC 120-76D 11.17.2.3 and 11.17.2.4, the engine's
     *  diagram_fix_usable: off within 3 s, none past 30 m. */
    @Test
    fun ownShipGoesWhenItsFixIsStaleOrCoarse() {
        val now = 1_700_000_010_000L
        fun fix(ageMs: Long, metres: Double) = OwnShip.Fix(46.84, -92.19, null, null, 0.0, metres, now - ageMs)
        assertNotNull(DiagramPage.usable(fix(1_000, 5.0), now).getOrThrow())
        assertEquals(null, DiagramPage.usable(fix(3_500, 5.0), now).getOrThrow())
        assertEquals(null, DiagramPage.usable(fix(1_000, 31.0), now).getOrThrow())
    }
}
