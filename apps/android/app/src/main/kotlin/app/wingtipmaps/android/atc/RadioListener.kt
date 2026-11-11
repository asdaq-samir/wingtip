package app.wingtipmaps.android.atc

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import androidx.core.content.ContextCompat
import app.wingtipmaps.android.voice.RecognizerErrors
import app.wingtipmaps.android.voice.VoiceInput
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
 * (AtcListenService). The recognizer is the phone's on-device one only
 * (SpeechRecognizer.createOnDeviceSpeechRecognizer, Android 12, API 31),
 * so nothing a pilot says goes to Google or anyone (the owner,
 * 2026-11-09); never createSpeechRecognizer, which may send the audio to
 * the recognizer service's servers. Where the phone has no on-device
 * recognizer (below Android 12, or none installed), voice is not offered:
 * canListen is false and the ATC copilot, its setting and the search's
 * microphone (Ask by voice, VoiceInput, a feature apart) are hidden.
 * Main thread only, as the recognizer is.
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
    /** Passing recognizer errors in a row, since the last words heard. */
    private var failures = 0

    override fun start() {
        if (_listening.value) return
        if (!ready()) return
        // The radio takes the microphone: a question being said ends
        // (Ask by voice, a feature apart).
        VoiceInput.of(context).finish()
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
        if (_listening.value || VoiceInput.of(context).listening.value || !ready()) return null
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

    /** An on-device recognizer and the microphone allowed; said where not. */
    private fun ready(): Boolean {
        if (!canListen(context)) {
            _error.value = "ATC: speech can't be recognised on this phone"
            return false
        }
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            _error.value = "ATC: allow the microphone to listen to the radio"
            return false
        }
        _error.value = null
        failures = 0
        return true
    }

    private fun listen() {
        // On the device or not at all: below Android 12 there is no
        // on-device recognizer to ask for (ready() has said so already).
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return
        val r = recognizer ?: SpeechRecognizer.createOnDeviceSpeechRecognizer(context).also {
            it.setRecognitionListener(callback)
            recognizer = it
        }
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            // US ATC's phraseology, in American English, as the engine reads it.
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE, "en-US")
            .putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            // The on-device recognizer is offline already; said again for
            // any service that reads only the extra.
            .putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
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
            // Heard again: a passing error said before is over.
            if (failures > 0) _error.value = null
            failures = 0
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
            // A silence or a miss: listened to again, nothing said. Any
            // other error is said (RecognizerErrors); one that passes is
            // tried again, up to MAX_IN_A_ROW, and the rest stop the listening.
            val outcome = RecognizerErrors.of(error)
            if (outcome.words == null) return again()
            failures++
            _error.value = "ATC: ${outcome.words}"
            if (outcome.again && failures < RecognizerErrors.MAX_IN_A_ROW) again() else stop()
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

        /** Whether voice is offered on this phone: an on-device speech
         *  recognizer (Android 12, API 31, and one installed). Every
         *  microphone control shows only where it is. */
        fun canListen(context: Context): Boolean =
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && SpeechRecognizer.isOnDeviceRecognitionAvailable(context)

        fun of(context: Context): RadioListener =
            shared ?: synchronized(this) { shared ?: RadioListener(context.applicationContext).also { shared = it } }
    }
}
