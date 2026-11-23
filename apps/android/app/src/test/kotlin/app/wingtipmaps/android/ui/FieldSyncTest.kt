package app.wingtipmaps.android.ui

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** A field kept in step with its model: what is typed goes up once, the
 *  model's late echoes never undo newer keys, and a value set elsewhere
 *  comes into the field. */
class FieldSyncTest {
    @Test
    fun typedGoesUpOnceAndItsEchoStaysOut() {
        val sync = FieldSync("")
        assertFalse(sync.typed(""))
        assertTrue(sync.typed("a"))
        assertTrue(sync.typed("ab"))
        // The model's state a frame behind the keys: "a" is an echo, not a reset.
        assertFalse(sync.arrived("a", shown = "ab"))
        assertFalse(sync.arrived("ab", shown = "ab"))
    }

    @Test
    fun aValueSetElsewhereComesIn() {
        val sync = FieldSync("12")
        assertTrue(sync.arrived("", shown = "12"))
        // The field's own copy of it is not sent back up.
        assertFalse(sync.typed(""))
    }

    @Test
    fun aChangeTheModelMadeToWhatWasTypedComesIn() {
        val sync = FieldSync("")
        assertTrue(sync.typed("n1"))
        assertTrue(sync.arrived("N1", shown = "n1"))
    }

    @Test
    fun theNewestEchoClearsTheOlderOnes() {
        val sync = FieldSync("")
        sync.typed("a")
        sync.typed("ab")
        sync.typed("a")
        // Conflated: the model gives back only the newest "a".
        assertFalse(sync.arrived("a", shown = "a"))
        // So a later "ab" was set elsewhere, and comes in.
        assertTrue(sync.arrived("ab", shown = "a"))
    }
}
