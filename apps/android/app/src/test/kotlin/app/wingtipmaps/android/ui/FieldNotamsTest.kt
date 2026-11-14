package app.wingtipmaps.android.ui

import app.wingtipmaps.android.api.generated.RankedNotam
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.ui.card.Status
import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.Instant
import java.time.ZoneOffset

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
        val lines = FieldNotams.timeLines(notam(inForce = true, starts = "2026-11-02T13:46:00Z", ends = "2026-11-11T17:59:00Z"), read(), now, ZoneOffset.UTC)
        assertEquals(
            listOf(
                FieldNotams.TimeLine(FieldNotams.Label.SINCE, "11/02 13:46"),
                FieldNotams.TimeLine(FieldNotams.Label.ENDS, "11/11 17:59", local = true, soon = "5m"),
            ),
            lines,
        )
    }

    @Test
    fun toComeSaysStartsEndsAndDuration() {
        val lines = FieldNotams.timeLines(notam(inForce = false, starts = "2026-11-12T12:00:00", ends = "2026-11-12T20:00:00"), read(estimated = true), now, ZoneOffset.UTC)
        assertEquals(FieldNotams.Label.STARTS, lines[0].label)
        assertEquals("18h06m", lines[0].soon)
        assertEquals(true, lines[1].estimated)
        assertEquals(FieldNotams.TimeLine(FieldNotams.Label.DURATION, "8h00m"), lines[2])
    }

    @Test
    fun permanentAndTheNotamsOwnTimesWhereTheFeedHasNone() {
        val lines = FieldNotams.timeLines(notam(), read(permanent = true, starts = "2026-11-01T00:00:00Z"), now, ZoneOffset.UTC)
        assertEquals(listOf(FieldNotams.TimeLine(FieldNotams.Label.SINCE, "11/01 00:00", local = true), FieldNotams.TimeLine(FieldNotams.Label.ENDS, permanent = true)), lines)
    }

    @Test
    fun numberDropsTheFieldsOwnName() {
        assertEquals("11/439", FieldNotams.number(notam("ORD 11/439"), "KORD"))
        assertEquals("FDC 6/2478", FieldNotams.number(notam("FDC 6/2478"), "KSJT"))
        assertEquals(listOf("KOSH", "OSH"), FieldNotams.identsOf("KOSH"))
    }

    @Test
    fun aNotamsBadgeIsActiveLaterOrInactive() {
        val at = now.toEpochMilli()
        assertEquals(Status.Active, FieldNotams.status(notam(), at))
        assertEquals(Status.Later, FieldNotams.status(notam(inForce = false, starts = "2026-11-12T12:00:00"), at))
        assertEquals(Status.Cold, FieldNotams.status(notam(inForce = false, starts = "2026-11-01T12:00:00Z"), at))
        assertEquals(Status.Cold, FieldNotams.status(notam(inForce = false), at))
    }
}
