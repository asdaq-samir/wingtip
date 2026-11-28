package app.wingtipmaps.android.logbook

import app.wingtipmaps.android.api.generated.gateway.CurrencyDto
import app.wingtipmaps.android.api.generated.gateway.LogbookEntryDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The airplane's category, class and gear, sent only where the logbook has said them (61.57(a)(1)). */
class AirplaneKindTest {
    private fun entry(on: String, tail: String?, category: String? = null, cls: String? = null, tailwheel: Boolean? = null, fullStops: Int? = null) =
        LogbookEntryDto(
            airHours = 1.0, approaches = 0, crossCountryHours = 0.0, dayLandings = 2, distanceNm = 0.0, dualHours = 0.0,
            flownOn = on, fromTrack = false, holding = false, id = 1, instrumentHours = 0.0, longestLegNm = 0.0, nightHours = 0.0,
            nightLandings = 1, soloHours = 0.0, totalHours = 1.2, touchAndGoes = 0, toweredLandings = 0, tracking = false,
            aircraft = tail, category = category, aircraftClass = cls, tailwheel = tailwheel, fullStopLandings = fullStops,
        )

    @Test
    fun theSameNNumbersNewestEntryThatSaysThem() {
        val entries = listOf(
            entry("2026-10-01", "N3429J", "airplane", "single-engine land", false),
            entry("2026-11-01", "n3429j"),
            entry("2026-11-05", "N55GX", "airplane", "single-engine land", true),
        )
        assertEquals(AirplaneKind("airplane", "single-engine land", false), AirplaneKind.of(entries, "N3429J"))
        assertEquals(true, AirplaneKind.of(entries, "N55GX")?.tailwheel)
    }

    @Test
    fun noneWhereTheLogbookHasNotSaidThem() {
        assertNull(AirplaneKind.of(listOf(entry("2026-11-01", "N3429J")), "N3429J"))
        assertNull(AirplaneKind.of(listOf(entry("2026-11-01", "N3429J", "airplane")), null))
    }

    @Test
    fun anEditKeepsTheAirplanesColumnsWhileItIsTheSameAirplane() {
        val was = entry("2026-11-01", "N3429J", "airplane", "single-engine land", false, fullStops = 3)
        val kept = LogbookForm.of(was).request(was).getOrThrow()
        assertEquals("single-engine land", kept.aircraftClass)
        assertEquals(3, kept.fullStopLandings)
        // Another airplane typed: its own columns where known, else none; landings changed: its full stops not known.
        val other = LogbookForm.of(was).copy(airplane = "N55GX", dayLandings = "1").request(was).getOrThrow()
        assertNull(other.aircraftClass)
        assertNull(other.fullStopLandings)
        val known = LogbookForm.of(was).copy(airplane = "N55GX").request(was, AirplaneKind("airplane", "single-engine land", true)).getOrThrow()
        assertEquals(true, known.tailwheel)
    }

    @Test
    fun passengerCurrencyTheLogbookCannotJudgeSaysCantTell() {
        val unknown = "Can't tell: your newest flight doesn't say the category and class, so no landing can be counted for the airplane you'll fly (61.57(a)(1))"
        val c = CurrencyDto(
            approachesInWindow = 0, crossCountryHours = 0.0, flights = 1, holdingInWindow = false, landings = 3, nightHours = 0.0,
            totalHours = 1.2, trackingInWindow = false, dayPassengersUnknown = unknown, nightPassengersUntil = "2027-01-10",
            passengerClass = "airplane/single-engine land",
        )
        val lines = CurrencyWords.lines(c)
        assertTrue(lines.contains("Passengers by day: $unknown"))
        assertTrue(lines.contains("Passengers at night: until 2027-01-10"))
        assertTrue(lines.contains("Passengers judged in airplane/single-engine land"))
    }
}
