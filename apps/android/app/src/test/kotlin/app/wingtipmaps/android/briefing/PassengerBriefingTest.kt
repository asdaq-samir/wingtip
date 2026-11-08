package app.wingtipmaps.android.briefing

import app.wingtipmaps.android.checklist.MemoryStore
import java.time.ZoneId
import java.time.ZonedDateTime
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The passenger briefing's items, its message and the ticks kept for a
 *  flight (PassengerBriefing, PassengerTicks): the words the web app's
 *  lib/passengers writes. */
class PassengerBriefingTest {
    private val chicago = ZoneId.of("America/Chicago")
    private val leaves = ZonedDateTime.of(2026, 11, 8, 14, 10, 0, 0, chicago).toInstant().toEpochMilli()

    @Test
    fun theItemsAreSafetysEachWithItsSource() {
        val keys = PassengerBriefing.ITEMS.map { it.key }
        assertEquals(listOf("pax-belts", "pax-fastened", "pax-air", "pax-fire", "pax-exits", "pax-traffic", "pax-questions"), keys)
        assertEquals("14 CFR 91.107(a)(1)", PassengerBriefing.ITEMS[0].source)
        assertEquals("14 CFR 91.107(a)(2), (3)", PassengerBriefing.ITEMS[1].source)
        assertTrue(PassengerBriefing.ITEMS.first { it.key == "pax-exits" }.source.contains("PA.II.B.S2"))
        assertTrue(PassengerBriefing.ITEMS.all { it.source.isNotBlank() })
    }

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
