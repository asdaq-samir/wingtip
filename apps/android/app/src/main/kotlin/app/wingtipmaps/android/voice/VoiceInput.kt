package app.wingtipmaps.android.voice

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import app.wingtipmaps.android.atc.RadioListener
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Ask by voice: the pilot says one thing to the app -- a search, a route,
 * a question -- and the words appear in the field as they are said, as
 * Material's voice input on a search bar has them. A feature of its own,
 * apart from listening to the radio (RadioListener, the ATC copilot's
 * capsule, the clearance sheet and the notification): the owner,
 * 2026-11-10, "the mic is a speaking feature for a pilot to ask anything
 * vs radio listening is a separate feature. So they should not share
 * animations." So it keeps its own recognizer and state, and the radio's
 * views never read them.
 *
 * The phone's on-device recognizer only (createOnDeviceSpeechRecognizer,
 * Android 12, API 31; the owner, 2026-11-09): where there is none,
 * RadioListener.canListen is false and no microphone is shown. Main
 * thread only, as the recognizer is.
 */
class VoiceInput private constructor(private val context: Context) {
    private val _listening = MutableStateFlow(false)
    /** Listening for the pilot's words now. */
    val listening: StateFlow<Boolean> = _listening.asStateFlow()
    private val _words = MutableStateFlow("")
    /** The words so far, for the field to show as they are said. */
    val words: StateFlow<String> = _words.asStateFlow()
    private val _problem = MutableStateFlow<String?>(null)
    /** Why the last ask heard nothing, where the recognizer said why
     *  (RecognizerErrors); null where it was only silence. */
    val problem: StateFlow<String?> = _problem.asStateFlow()

    private var recognizer: SpeechRecognizer? = null
    private var answer: CompletableDeferred<String?>? = null

    /**
     * One thing said: the words in [words] as they come, the whole once the
     * recognizer settles them (its own end of speech) or [finish] is
     * called. Null where nothing was said, where there is no on-device
     * recognizer, or while the radio is being listened to, which has the
     * microphone.
     */
    suspend fun hear(): String? {
        if (_listening.value || Build.VERSION.SDK_INT < Build.VERSION_CODES.S || !RadioListener.canListen(context)) return null
        if (RadioListener.of(context).listening.value) return null
        val done = CompletableDeferred<String?>()
        answer = done
        _words.value = ""
        _problem.value = null
        _listening.value = true
        val r = SpeechRecognizer.createOnDeviceSpeechRecognizer(context).also {
            it.setRecognitionListener(callback)
            recognizer = it
        }
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_WEB_SEARCH)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE, "en-US")
            .putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            // The on-device recognizer is offline already; said again for
            // any service that reads only the extra.
            .putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
        r.startListening(intent)
        return try {
            done.await()
        } finally {
            answer = null
            _listening.value = false
            _words.value = ""
            recognizer?.destroy()
            recognizer = null
        }
    }

    /** The mic tapped again: what was said so far is what was said. */
    fun finish() {
        recognizer?.stopListening()
    }

    private val callback = object : RecognitionListener {
        override fun onPartialResults(partial: Bundle?) {
            words(partial)?.let { _words.value = it }
        }

        override fun onResults(results: Bundle?) {
            answer?.complete(words(results) ?: _words.value.ifBlank { null })
        }

        override fun onError(error: Int) {
            // Said where it is more than silence, so the field can say why.
            _problem.value = RecognizerErrors.of(error).words?.let { it.replaceFirstChar(Char::uppercaseChar) + "." }
            answer?.complete(_words.value.ifBlank { null })
        }

        override fun onReadyForSpeech(params: Bundle?) {}
        override fun onBeginningOfSpeech() {}
        override fun onRmsChanged(rmsdB: Float) {}
        override fun onBufferReceived(buffer: ByteArray?) {}
        override fun onEndOfSpeech() {}
        override fun onEvent(eventType: Int, params: Bundle?) {}
    }

    private fun words(bundle: Bundle?): String? =
        bundle?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()?.trim()?.takeIf { it.isNotEmpty() }

    companion object {
        // The application's context, which lives as long as the process:
        // no activity is held, so nothing leaks.
        @SuppressLint("StaticFieldLeak")
        @Volatile
        private var shared: VoiceInput? = null

        fun of(context: Context): VoiceInput =
            shared ?: synchronized(this) { shared ?: VoiceInput(context.applicationContext).also { shared = it } }
    }
}
