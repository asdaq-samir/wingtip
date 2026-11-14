package app.wingtipmaps.android

import app.wingtipmaps.android.api.AheadAlert
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.flight.InFlight
import app.wingtipmaps.android.flight.SpokenAlerts
import app.wingtipmaps.android.ui.InstrumentsWords
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** The instruments bar's writing of the engine's figures (#218), as the
 *  iPhone's InstrumentsBar writes them, and the alerts ahead as said
 *  aloud, as the iPhone's SpokenAlerts says them. The figures themselves
 *  are the engine's, held in the androidTest's InFlightEngineTest. */
class InFlightWordsTest {
    @Test
    fun theFiguresAreWrittenAsAVsiAndAClockRead() {
        assertEquals("+300", InstrumentsWords.verticalSpeed(304.0))
        assertEquals("-450", InstrumentsWords.verticalSpeed(-447.0))
        assertEquals("+1,200", InstrumentsWords.verticalSpeed(1196.0))
        assertEquals("—", InstrumentsWords.verticalSpeed(null))
        assertEquals("092°T", InstrumentsWords.track(92.0, null))
        assertEquals("090°", InstrumentsWords.track(92.0, 89.6))
        assertEquals("7:30", InstrumentsWords.minutesSeconds(7.5))
        // 2026-11-02 11:46:40 UTC.
        assertEquals("1146Z", InstrumentsWords.zulu(1_793_620_000.0))
    }

    @Test
    fun offCourseIsSaidPastATenth() {
        val p = EngineContract.InFlightAnswer(
            onRoute = true, alongNm = 30.0, totalNm = 104.0, leftNm = 74.0, offNm = 2.2, offSide = "left",
            desiredTrackDeg = 0.0, burntGal = 3.0, hop = 0, hopBurntGal = 3.0,
        )
        assertEquals("2.2 nm left of course", InstrumentsWords.offCourse(p))
        assertNull(InstrumentsWords.offCourse(p.copy(offNm = 0.04, offSide = null)))
    }

    private fun alert(id: String, seconds: Double, name: String = "Chicago Class B") =
        AheadAlert(id = id, kind = "airspace", level = "warning", name = name, need = "", seconds = seconds, distanceNm = 4.0, lat = 0.0, lon = 0.0)

    @Test
    fun eachAlertIsSaidOnceTheSoonestFirst() {
        val (words, said) = SpokenAlerts.toSay(listOf(alert("b", 130.0), alert("a", 40.0, "Terrain")), emptySet())
        assertEquals("Terrain, in 40 seconds, and 1 more.", words)
        assertEquals(setOf("a", "b"), said)
        val (again, kept) = SpokenAlerts.toSay(listOf(alert("b", 100.0)), said)
        assertNull(again)
        assertEquals(setOf("b"), kept)
    }
}
