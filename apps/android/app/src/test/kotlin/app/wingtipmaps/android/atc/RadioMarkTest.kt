package app.wingtipmaps.android.atc

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Mic
import app.wingtipmaps.android.ui.WingtipIcons
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

/** The radio listened to and Ask by voice are two features with two looks
 *  (the owner, 2026-11-10): the radio's mark is its waves, never the mic. */
class RadioMarkTest {
    @Test
    fun theRadioHasItsOwnMark() {
        assertEquals("Filled.CellTower", WingtipIcons.radio.name)
        assertNotEquals(Icons.Filled.Mic.name, WingtipIcons.radio.name)
    }
}
