package app.wingtipmaps.android.briefing

import app.wingtipmaps.android.checklist.MemoryStore
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.ZoneId
import java.time.ZonedDateTime

/** The passenger briefing's message and the ticks kept for a flight
 *  (PassengerBriefing, PassengerTicks): the words the web app's
 *  lib/passengers writes. Its items are the engine's (EngineTest). */
class PassengerBriefingTest {
    private val chicago = ZoneId.of("America/Chicago")
    private val leaves = ZonedDateTime.of(2026, 11, 8, 14, 10, 0, 0, chicago).toInstant().toEpochMilli()

    @Test
    fun theMessageSaysWhereWhenHowLongAndTheWeather() {
        val message = PassengerBriefing.message(
            dep = "C81", dest = "KDLH", destName = "Duluth International", departMs = leaves,
            eteMin = 155.0, weather = "VFR, no ceiling · 10 sm", zone = chicago,
        )
        assertEquals(
            "C81 to Duluth International (KDLH)\n" +
                "Leaving 14:10 (2010Z), about 2h 35m in the air, landing about 16:45.\n" +
                "Weather at KDLH now: VFR, no ceiling · 10 sm.",
            message,
        )
    }

    @Test
    fun whatIsNotKnownIsLeftOut() {
        assertEquals("C81 to KDLH", PassengerBriefing.message("C81", "KDLH", null, null, null, null, chicago))
        assertEquals(
            "C81 to KDLH\nAbout 45m in the air.",
            PassengerBriefing.message("C81", "KDLH", "", null, 45.0, null, chicago),
        )
    }

    @Test
    fun theWeatherIsTheCategoryCeilingAndVisibility() {
        assertEquals("MVFR, 2,500 ft · 4 sm", PassengerBriefing.weatherWords("MVFR", 2500.0, 4.0))
        assertEquals("VFR, no ceiling · 1.5 sm", PassengerBriefing.weatherWords("VFR", null, 1.5))
        assertNull(PassengerBriefing.weatherWords(null, null, null))
    }

    @Test
    fun theTicksAreKeptForTheFlightAndANewFlightStartsAfresh() {
        val memory = MemoryStore()
        val ticks = PassengerTicks(memory)
        assertEquals(emptySet<String>(), ticks.ticked("C81 → KDLH"))
        ticks.save("C81 → KDLH", setOf("pax-belts", "pax-fire"))
        assertEquals(setOf("pax-belts", "pax-fire"), PassengerTicks(memory).ticked("C81 → KDLH"))
        assertEquals(emptySet<String>(), ticks.ticked("KDLH → C81"))
    }
}
