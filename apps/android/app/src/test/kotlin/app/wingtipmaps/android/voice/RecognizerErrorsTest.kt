package app.wingtipmaps.android.voice

import android.speech.SpeechRecognizer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** A recognizer's error is said, never looped through in silence, unless
 *  it only means nothing was said (the offline audit's gap 11). */
class RecognizerErrorsTest {
    @Test
    fun silenceIsListenedThroughWithNothingSaid() {
        for (code in listOf(SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT)) {
            assertEquals(RecognizerErrors.Outcome(again = true, words = null), RecognizerErrors.of(code))
        }
    }

    @Test
    fun aBusyRecognizerIsTriedAgainButSaid() {
        val busy = RecognizerErrors.of(SpeechRecognizer.ERROR_RECOGNIZER_BUSY)
        assertTrue(busy.again)
        assertEquals("the phone's speech recognizer stopped; starting it again", busy.words)
    }

    @Test
    fun aMissingLanguageOrMicrophoneStopsAndSaysWhy() {
        val language = RecognizerErrors.of(SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE)
        assertFalse(language.again)
        assertTrue(language.words!!.contains("US English"))
        assertFalse(RecognizerErrors.of(SpeechRecognizer.ERROR_AUDIO).again)
        // An error this build does not know is said by its number.
        assertEquals("the phone's speech recognizer failed (error 99)", RecognizerErrors.of(99).words)
        assertNull(RecognizerErrors.of(SpeechRecognizer.ERROR_NO_MATCH).words)
    }
}
