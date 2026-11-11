package app.wingtipmaps.android.voice

import android.annotation.SuppressLint
import android.speech.SpeechRecognizer

/**
 * What an on-device speech recognizer's error means for whoever is
 * listening, the radio (RadioListener) or a question asked by voice
 * (VoiceInput): heard again in silence where it only means nothing was
 * said, else said in words and, unless it passes, stopped (the offline
 * audit's gap 11: every error was listened through again, so a missing
 * language pack or a dead microphone looped with nothing on the screen).
 * The codes are SpeechRecognizer's ERROR_ constants.
 */
object RecognizerErrors {
    /** `again`: listen on. `words`: what to say, null for nothing. */
    data class Outcome(val again: Boolean, val words: String?)

    /** How many passing errors in a row before listening stops and says so. */
    const val MAX_IN_A_ROW = 3

    // The codes from API 31 on arrive only from the on-device recognizer,
    // which the app uses only from API 31 (RadioListener.canListen), so
    // naming them below minSdk is safe: an older phone never sends them.
    @SuppressLint("InlinedApi")
    fun of(code: Int): Outcome = when (code) {
        // Silence, or words it could not match: nothing went wrong.
        SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> Outcome(true, null)
        // Busy with the last one, or its service restarted: passes.
        SpeechRecognizer.ERROR_RECOGNIZER_BUSY, SpeechRecognizer.ERROR_CLIENT, SpeechRecognizer.ERROR_SERVER_DISCONNECTED ->
            Outcome(true, "the phone's speech recognizer stopped; starting it again")
        SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> Outcome(false, "allow the microphone")
        SpeechRecognizer.ERROR_AUDIO -> Outcome(false, "the microphone could not be read")
        SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED -> Outcome(false, "this phone's speech recognizer has no US English")
        SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE ->
            Outcome(false, "US English for speech is not on this phone yet; download it in the phone's speech settings")
        SpeechRecognizer.ERROR_TOO_MANY_REQUESTS -> Outcome(false, "the phone's speech recognizer is busy; try again in a minute")
        // The on-device recognizer needs no network: one asking for it has
        // no offline model for the language.
        SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT, SpeechRecognizer.ERROR_SERVER ->
            Outcome(false, "speech can't be recognised on this phone without its offline language download")
        else -> Outcome(false, "the phone's speech recognizer failed (error $code)")
    }
}
