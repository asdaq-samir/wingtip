package app.wingtipmaps.android

import androidx.test.ext.junit.runners.AndroidJUnit4
import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.flight.InFlight
import app.wingtipmaps.android.flight.OwnShip
import app.wingtipmaps.android.ui.DiagramPage
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@Serializable
private class Sample(@SerialName("t_s") val tS: Double, @SerialName("altitude_ft") val altitudeFt: Double)

@Serializable
private class Samples(val samples: List<Sample>)

@Serializable
private class Label(val text: String, val x: Double, val y: Double)

@Serializable
private class Labels(val labels: List<Label>)

/** The engine's in-flight names (#218) as Android asks them through JNI:
 *  in_flight as InFlight asks it, the vertical speed, and
 *  own ship on KDLH's diagram, which is drawn with north to the page's
 *  left. The same cases as the iPhone's InFlightTests. */
@RunWith(AndroidJUnit4::class)
class InFlightEngineTest {
    private fun ask(lat: Double, lon: Double, kt: Double): InFlight.Progress? {
        val a = InFlight.InFlightAsk(
            fix = InFlight.FixAsk(lat, lon, 0.0, kt),
            line = listOf(listOf(42.0, -88.0), listOf(43.0, -88.0), listOf(43.0, -87.0)),
            points = listOf(InFlight.PointAsk("A", 42.0, -88.0), InFlight.PointAsk("B", 43.0, -88.0), InFlight.PointAsk("C", 43.0, -87.0)),
            legs = listOf(InFlight.LegAsk(60.0, 6.0), InFlight.LegAsk(44.0, 4.4)),
            fuelStartGal = 40.0,
            nowS = 1_793_620_000.0,
        )
        return Engine.call<InFlight.InFlightAsk, InFlight.Progress?>("in_flight", a)
    }

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
        val fpm = Engine.call<Samples, Double?>("vertical_speed", Samples((0..10).map { Sample(it.toDouble(), 3000.0 + 5 * it) }))
        assertEquals(300.0, fpm!!, 0.001)
    }

    @Test
    fun ownShipIsPlacedOnKdlhsDiagram() {
        val g = Engine.call<Labels, DiagramPage.Graticule?>(
            "diagram_graticule",
            Labels(
                listOf(
                    Label("92°13'W", 363.85, 485.90), Label("46°51'N", 69.35, 77.21),
                    Label("46°50'N", 296.60, 76.58), Label("92°12'W", 362.69, 328.17),
                ),
            ),
        )
        assertNotNull(g)
        assertTrue(g!!.latOnX)
        assertEquals(270.0, g.northDeg, 1e-9)
        val page = DiagramPage(android.graphics.Bitmap.createBitmap(1, 1, android.graphics.Bitmap.Config.ARGB_8888), 387.36f, 594f, g)
        val at = page.place(OwnShip.Fix(46.8417, -92.1936, 1428.0, 90.0, 10.0, 5.0, 0L))!!
        assertTrue(at.onPage)
        assertEquals(183.0, at.x, 2.0)
    }

    /** AC 120-76D 11.17.2.3 and 11.17.2.4, the engine's
     *  diagram_fix_usable: off within 3 s, none past 30 m. */
    @Test
    fun ownShipGoesWhenItsFixIsStaleOrCoarse() {
        val now = 1_700_000_010_000L
        fun fix(ageMs: Long, metres: Double) = OwnShip.Fix(46.84, -92.19, null, null, 0.0, metres, now - ageMs)
        assertNotNull(DiagramPage.usable(fix(1_000, 5.0), now))
        assertEquals(null, DiagramPage.usable(fix(3_500, 5.0), now))
        assertEquals(null, DiagramPage.usable(fix(1_000, 31.0), now))
    }
}
