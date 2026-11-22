package app.wingtipmaps.android.library

import org.junit.Assert.assertEquals
import org.junit.Test

/** A row TalkBack reads as one (the Brief's finding) still reaches each
 *  cited rule: one action a cite, named for it, once each (item 104). */
class CitationsTest {
    @Test
    fun eachCiteIsOneActionNamedForIt() {
        val vfr = DocPlace("cfr-14-91", at = "91.155")
        val pieces = listOf(
            CitedPiece("Below the VFR minimums of ", null),
            CitedPiece("14 CFR 91.155", vfr),
            CitedPiece(" (see ", null),
            CitedPiece("14 CFR 91.155", vfr),
            CitedPiece(").", null),
        )
        assertEquals(listOf("Open 14 CFR 91.155" to vfr), Citations.actions(pieces))
        assertEquals(emptyList<Pair<String, DocPlace>>(), Citations.actions(listOf(CitedPiece("No rule here.", null))))
    }
}
