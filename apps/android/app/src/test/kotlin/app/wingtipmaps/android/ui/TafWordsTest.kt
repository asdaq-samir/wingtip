package app.wingtipmaps.android.ui

import app.wingtipmaps.android.engine.generated.EngineContract
import org.junit.Assert.assertEquals
import org.junit.Test

/** The airport card's TAF line in the web's words (tafLine): the UTC day
 *  and time as a TAF's header writes them, its state's own sentence. */
class TafWordsTest {
    // 2026-11-11 1130Z, 2026-11-11 1200Z, 2026-11-12 1200Z.
    private val issued = 1_794_396_600.0
    private val from = 1_794_398_400.0
    private val to = 1_794_484_800.0

    private fun taf(state: String) = EngineContract.TafValidityAnswer(station = "KMSN", issued = issued, validFrom = from, validTo = to, state = state)

    @Test
    fun eachStateItsLine() {
        assertEquals("TAF issued 11 1130Z, valid to 12 1200Z" to false, TafWords.line(taf("in_force")))
        assertEquals("TAF issued 11 1130Z, valid from 11 1200Z" to false, TafWords.line(taf("not_yet")))
        assertEquals("TAF expired 12 1200Z: no forecast in force" to true, TafWords.line(taf("expired")))
    }
}
