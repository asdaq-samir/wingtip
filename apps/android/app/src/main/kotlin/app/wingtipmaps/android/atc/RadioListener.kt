package app.wingtipmaps.android.atc

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import androidx.core.content.ContextCompat
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/** The radio as the copilot hears it: a fake in the tests. */
interface AtcListener {
    /** The transmissions heard, oldest first, the last few kept. */
    val heard: StateFlow<List<Heard>>
    val listening: StateFlow<Boolean>
    /** Why it is not listening, in words; null when nothing is wrong. */
    val error: StateFlow<String?>
    fun start()
    fun stop()
    /** One transmission heard from now (Read Back with the radio off):
     *  its words, or null where nothing was said. */
    suspend fun once(): String?
}

/**
 * The phone's own speech recognizer (android.speech.SpeechRecognizer)
 * listened to on and on, as the web's lib/atcListening listens through
 * the audio panel: each utterance it settles is a transmission, and it
 * listens again at once after each, and after a silence or a miss. While
 * it listens, a foreground service of the microphone type keeps the
 * process with the screen off, with the notification Android requires
 * (AtcListenService). Nothing heard leaves the phone but through the
 * recognizer the pilot's phone has chosen. Main thread only, as the
 * recognizer is.
 */
class RadioListener private constructor(private val context: Context) : AtcListener {
    private val _heard = MutableStateFlow<List<Heard>>(emptyList())
    override val heard: StateFlow<List<Heard>> = _heard.asStateFlow()
    private val _listening = MutableStateFlow(false)
    override val listening: StateFlow<Boolean> = _listening.asStateFlow()
    private val _error = MutableStateFlow<String?>(null)
    override val error: StateFlow<String?> = _error.asStateFlow()

    private val main = Handler(Looper.getMainLooper())
    private var recognizer: SpeechRecognizer? = null
    private var nextId = 1
    private var waiting: CompletableDeferred<String?>? = null

    override fun start() {
        if (_listening.value) return
        if (!ready()) return
        _listening.value = true
        AtcListenService.keep(context, true)
        listen()
    }

    override fun stop() {
        _listening.value = false
        AtcListenService.keep(context, false)
        if (waiting == null) release()
    }

    override suspend fun once(): String? {
        if (_listening.value || !ready()) return null
        val answer = CompletableDeferred<String?>()
        waiting = answer
        listen()
        return try {
            answer.await()
        } finally {
            waiting = null
            if (!_listening.value) release()
        }
    }

    /** The microphone allowed and a recognizer on the phone; said where not. */
    private fun ready(): Boolean {
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            _error.value = "ATC: allow the microphone to listen to the radio"
            return false
        }
        if (!SpeechRecognizer.isRecognitionAvailable(context)) {
            _error.value = "ATC: this phone has no speech recognition"
            return false
        }
        _error.value = null
        return true
    }

    private fun listen() {
        val r = recognizer ?: SpeechRecognizer.createSpeechRecognizer(context).also {
            it.setRecognitionListener(callback)
            recognizer = it
        }
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            // US ATC's phraseology, in American English, as the engine reads it.
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE, "en-US")
            .putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
        r.startListening(intent)
    }

    private fun release() {
        recognizer?.destroy()
        recognizer = null
    }

    /** After an utterance settles or misses: on again while listening on
     *  and on, a beat later so the recognizer has let go. */
    private fun again() {
        if (_listening.value) main.postDelayed({ if (_listening.value) listen() }, AGAIN_MS)
    }

    private val callback = object : RecognitionListener {
        private var current: Int? = null

        override fun onPartialResults(partial: Bundle?) {
            val text = words(partial) ?: return
            val id = current ?: nextId++.also { current = it }
            put(Heard(id, text, System.currentTimeMillis(), final = false))
        }

        override fun onResults(results: Bundle?) {
            val text = words(results)
            val id = current ?: nextId++
            current = null
            waiting?.complete(text)
            if (text != null) put(Heard(id, text, System.currentTimeMillis(), final = true))
            again()
        }

        override fun onError(error: Int) {
            current = null
            waiting?.complete(null)
            if (error == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS) {
                _error.value = "ATC: allow the microphone to listen to the radio"
                stop()
                return
            }
            // A silence, a miss or a busy recognizer: listened to again.
            again()
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

    /** A transmission in, its partial words replaced as it settles. */
    private fun put(t: Heard) {
        _heard.value = (_heard.value.filterNot { it.id == t.id } + t).takeLast(KEPT)
    }

    companion object {
        const val KEPT = 20
        const val AGAIN_MS = 250L

        // The application's context, which lives as long as the process:
        // no activity is held, so nothing leaks.
        @SuppressLint("StaticFieldLeak")
        @Volatile
        private var shared: RadioListener? = null

        fun of(context: Context): RadioListener =
            shared ?: synchronized(this) { shared ?: RadioListener(context.applicationContext).also { shared = it } }
    }
}
