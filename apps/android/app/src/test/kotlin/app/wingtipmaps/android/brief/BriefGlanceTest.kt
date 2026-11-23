package app.wingtipmaps.android.brief

import app.wingtipmaps.android.engine.generated.EngineContract
import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.ZoneId

/** The Brief's Adverse Conditions rows said as the web's whenWords says
 *  them: the legs 1-based, then the time on the phone's clock with its
 *  zone, each kind its own word; nothing known, "During the flight". */
class BriefGlanceTest {
    private val chicago = ZoneId.of("America/Chicago")

    private fun row(legs: List<Double>, kind: String?, time: String?) =
        EngineContract.GonogoAdverseRowsAnswerRowsItem(
            source = "SIGMET", title = "Severe turbulence", finding = "stop", tab = "enroute", section = "Adverse Conditions",
            timeKind = kind, time = time, legs = legs,
        )

    @Test
    fun theLegsThenTheTimeWithItsZone() {
        assertEquals("Leg 2 · until 14:40 CST", whenWords(row(listOf(1.0), "until", "2026-11-21T20:40:00Z"), chicago))
        assertEquals("Legs 1–3 · in force at 08:05 CST", whenWords(row(listOf(0.0, 1.0, 2.0), "at", "2026-11-21T14:05:00Z"), chicago))
        assertEquals("Reported 08:05 CST", whenWords(row(emptyList(), "reported", "2026-11-21T14:05:00Z"), chicago))
    }

    @Test
    fun nothingKnownIsDuringTheFlight() {
        assertEquals("During the flight", whenWords(row(emptyList(), null, null), chicago))
        assertEquals("Leg 1", whenWords(row(listOf(0.0), "until", "not a time"), chicago))
    }
}
