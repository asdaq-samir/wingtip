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
        val lines = FieldNotams.timeLines(notam(inForce = true, starts = "2026-11-02T13:46:00Z", ends = "2026-11-11T17:59:00Z"), read(), "America/Chicago", now)
        assertEquals(
            listOf(
                FieldNotams.TimeLine(FieldNotams.Label.SINCE, "11/02 07:46 CST"),
                FieldNotams.TimeLine(FieldNotams.Label.ENDS, "11/11 11:59 CST", soon = "5m"),
            ),
            lines,
        )
    }

    @Test
    fun toComeSaysStartsEndsAndDuration() {
        val lines = FieldNotams.timeLines(notam(inForce = false, starts = "2026-11-12T12:00:00", ends = "2026-11-12T20:00:00"), read(estimated = true), null, now)
        assertEquals(FieldNotams.Label.STARTS, lines[0].label)
        assertEquals("18h06m", lines[0].soon)
        // An EST end is its time alone; no zone known, UTC said so.
        assertEquals(FieldNotams.TimeLine(FieldNotams.Label.ENDS, "11/12 20:00 UTC", soon = "1d2h"), lines[1])
        assertEquals(FieldNotams.TimeLine(FieldNotams.Label.DURATION, "8h00m"), lines[2])
    }

    @Test
    fun permanentAndTheNotamsOwnTimesWhereTheFeedHasNone() {
        val lines = FieldNotams.timeLines(notam(), read(permanent = true, starts = "2026-11-01T00:00:00Z"), null, now)
        assertEquals(listOf(FieldNotams.TimeLine(FieldNotams.Label.SINCE, "11/01 00:00 UTC"), FieldNotams.TimeLine(FieldNotams.Label.ENDS, permanent = true)), lines)
    }

    /** The card's lines: the year where an end is not this year's, a this
     *  year's date without it as the shorter form, how soon; a permanent
     *  one until the charts just Permanent. */
    @Test
    fun theCardsLinesAndTheirShorterForms() {
        val lines = NotamCardTimes.lines(notam(inForce = false, starts = "2026-12-01T00:00:00Z", ends = "2028-05-27T18:43:00Z"), read(estimated = true), false, "America/Chicago", now)
        assertEquals(NotamCardTimes.Line(NotamCardTimes.Kind.STARTS, "11/30/26 18:00 CST", "11/30 18:00 CST", "19d"), lines[0])
        assertEquals(NotamCardTimes.Line(NotamCardTimes.Kind.UNTIL, "05/27/28 13:43 CDT", "05/27/28 13:43 CDT", "563d"), lines[1])
        val permanent = NotamCardTimes.lines(notam(starts = "2026-05-27T18:43:00Z", ends = "2028-05-27T18:43:00Z"), read(estimated = true), true, null, now)
        assertEquals(NotamCardTimes.Line(NotamCardTimes.Kind.PERMANENT), permanent[1])
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
