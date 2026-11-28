package app.wingtipmaps.android.ui

import app.wingtipmaps.android.FieldRules
import app.wingtipmaps.android.api.generated.RankedNotam
import app.wingtipmaps.android.engine.generated.EngineContract
import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.Instant

/** The airport card's NOTAM lines, as the web's notamTimes.test and
 *  fieldNotams say them: ForeFlight's spans, the labelled time lines, the
 *  number without the field's own name. The engine's readings are given. */
class FieldNotamsTest {
    private fun notam(id: String = "ORD 11/439", inForce: Boolean? = null, starts: String? = null, ends: String? = null, kind: String = "notam") =
        RankedNotam(closed = false, id = id, kind = kind, rank = 1, raw = "!ORD $id", reasons = emptyList(), runways = emptyList(), score = 0, tied = false, top = false, inForce = inForce, starts = starts, ends = ends)

    private fun read(estimated: Boolean = false, permanent: Boolean = false, starts: String? = null, ends: String? = null) =
        EngineContract.NotamReadAnswer(form = "domestic", words = "words", estimated = estimated, permanent = permanent, starts = starts, ends = ends)

    private val now = Instant.parse("2026-11-11T17:54:00Z")

    @Test
    fun spansAsForeFlightWritesThem() {
        assertEquals("5m", FieldNotams.span(5 * 60_000L))
        assertEquals("5h45m", FieldNotams.span((5 * 60 + 45) * 60_000L))
        assertEquals("2h05m", FieldNotams.span((2 * 60 + 5) * 60_000L))
        assertEquals("4d16h", FieldNotams.span(((4 * 24 + 16) * 60) * 60_000L))
        assertEquals("18d", FieldNotams.span(18L * 24 * 60 * 60_000L))
        assertEquals("0m", FieldNotams.span(-1))
    }

    @Test
    fun inForceSaysSinceAndEndsWithHowLongIsLeft() {
        // In the field's zone with its short name; never "local" or a Z.
        val lines = NotamTimes.timeLines(notam(inForce = true, starts = "2026-11-02T13:46:00Z", ends = "2026-11-11T17:59:00Z"), read(), false, "America/Chicago", now)
        assertEquals(
            listOf(
                NotamTimes.TimeLine(NotamTimes.Label.SINCE, "11/02 07:46 CST"),
                NotamTimes.TimeLine(NotamTimes.Label.ENDS, "11/11 11:59 CST", soon = "5m"),
            ),
            lines,
        )
    }

    @Test
    fun toComeSaysStartsEndsAndDuration() {
        val lines = NotamTimes.timeLines(notam(inForce = false, starts = "2026-11-12T12:00:00", ends = "2026-11-12T20:00:00"), read(estimated = true), false, null, now)
        assertEquals(NotamTimes.Label.STARTS, lines[0].label)
        assertEquals("18h06m", lines[0].soon)
        // An EST end is its time alone; no zone known, UTC said so.
        assertEquals(NotamTimes.TimeLine(NotamTimes.Label.ENDS, "11/12 20:00 UTC", soon = "1d2h"), lines[1])
        assertEquals(NotamTimes.TimeLine(NotamTimes.Label.DURATION, "8h00m"), lines[2])
    }

    @Test
    fun permanentAndTheNotamsOwnTimesWhereTheFeedHasNone() {
        val lines = NotamTimes.timeLines(notam(), read(permanent = true, starts = "2026-11-01T00:00:00Z"), false, null, now)
        assertEquals(listOf(NotamTimes.TimeLine(NotamTimes.Label.SINCE, "11/01 00:00 UTC"), NotamTimes.TimeLine(NotamTimes.Label.ENDS, permanent = true)), lines)
    }

    /** FDC 6/3373 (the r7 audit's A-H1): a permanent condition with an
     *  EST end the engine reads as until the charts are updated ends
     *  "Permanent" on its row as on its card, never the EST date; the year
     *  where an end is not this year's. */
    @Test
    fun untilTheChartsEndsPermanentNotItsEstimate() {
        val lines = NotamTimes.timeLines(notam(inForce = false, starts = "2026-12-01T00:00:00Z", ends = "2028-05-27T18:43:00Z"), read(estimated = true), false, "America/Chicago", now)
        assertEquals(NotamTimes.TimeLine(NotamTimes.Label.STARTS, "11/30/26 18:00 CST", soon = "19d"), lines[0])
        assertEquals(NotamTimes.TimeLine(NotamTimes.Label.ENDS, "05/27/28 13:43 CDT", soon = "563d"), lines[1])
        val permanent = NotamTimes.timeLines(notam(starts = "2026-05-27T18:43:00Z", ends = "2028-05-27T18:43:00Z"), read(estimated = true, permanent = true), true, null, now)
        assertEquals(listOf(NotamTimes.TimeLine(NotamTimes.Label.SINCE, "05/27 18:43 UTC"), NotamTimes.TimeLine(NotamTimes.Label.ENDS, permanent = true)), permanent)
    }

    /** The year is counted in the zone the date is shown in: 23:30 on 12/31
     *  in Chicago is 05:30 UTC the next day, still this year's there. */
    @Test
    fun theYearIsCountedInTheShownZone() {
        val chicago = java.time.ZoneId.of("America/Chicago")
        val nye = Instant.parse("2026-12-31T12:00:00Z")
        val late = Instant.parse("2027-01-01T05:30:00Z")
        assertEquals(false, NotamTimes.withYear(listOf(late), nye, chicago))
        assertEquals(true, NotamTimes.withYear(listOf(late), nye))
    }

    @Test
    fun numberDropsTheFieldsOwnName() {
        // The field's names are the engine's field_names, which does not
        // load on the JVM: given, as it answers for KORD and KSJT.
        assertEquals("11/439", FieldNotams.number(notam("ORD 11/439"), "KORD", listOf("KORD", "ORD")))
        assertEquals("FDC 6/2478", FieldNotams.number(notam("FDC 6/2478"), "KSJT", listOf("KSJT", "SJT")))
        // The engine's names taken as it gives them (fieldNames.json), the
        // ident alone where it cannot be asked.
        assertEquals(listOf("KOSH", "OSH"), FieldNotams.identsOf("KOSH", FieldRules::names))
        assertEquals(listOf("KOSH"), FieldNotams.identsOf("KOSH") { null })
    }
}
