package app.wingtipmaps.android.atc

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import androidx.core.content.ContextCompat
import app.wingtipmaps.android.AppClock
import app.wingtipmaps.android.voice.RecognizerErrors
import app.wingtipmaps.android.voice.VoiceInput
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

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
 * Its work runs in coroutines on the main thread, as the recognizer
 * wants: each utterance a callbackFlow of the recognizer's callbacks.
 */
class RadioListener private constructor(private val context: Context) : AtcListener {
    private val _heard = MutableStateFlow<List<Heard>>(emptyList())
    override val heard: StateFlow<List<Heard>> = _heard.asStateFlow()
    private val _listening = MutableStateFlow(false)
    override val listening: StateFlow<Boolean> = _listening.asStateFlow()
    private val _error = MutableStateFlow<String?>(null)
    override val error: StateFlow<String?> = _error.asStateFlow()

    /** The recognizer's thread, the main one, for every call made of it. */
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var recognizer: SpeechRecognizer? = null
    private var nextId = 1
    /** Listening on and on: one utterance after another until stopped. */
    private var onAndOn: Job? = null
    /** One transmission asked for (`once`) is being heard. */
    private var asked = false
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
        onAndOn = scope.launch {
            while (_listening.value) {
                if (!carryOn(hear())) break
                // A beat later, so the recognizer has let go.
                delay(AGAIN_MS)
            }
        }
    }

    override fun stop() {
        _listening.value = false
        AtcListenService.keep(context, false)
        if (!asked) {
            onAndOn?.cancel()
            release()
        }
    }

    override suspend fun once(): String? = withContext(Dispatchers.Main.immediate) {
        if (_listening.value || VoiceInput.of(context).listening.value || !ready()) return@withContext null
        asked = true
        try {
            val end = hear()
            carryOn(end)
            (end as? Event.Settled)?.words
        } finally {
            asked = false
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

    /** What the recognizer says of one utterance. */
    private sealed interface Event {
        data class Partial(val words: String) : Event
        data class Settled(val words: String?) : Event
        data class Failed(val error: Int) : Event
    }

    /** One utterance as the recognizer hears it: its partial words, then
     *  its settled words or its error, which ends the flow. Cancelled, the
     *  recognizer stops listening. On the device or not at all: below
     *  Android 12 there is no on-device recognizer to ask for (ready()
     *  has said so already). */
    private fun utterance(): Flow<Event> = callbackFlow {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            close()
            return@callbackFlow
        }
        val r = recognizer ?: SpeechRecognizer.createOnDeviceSpeechRecognizer(context).also { recognizer = it }
        var ended = false
        r.setRecognitionListener(object : RecognitionListener {
            override fun onPartialResults(partial: Bundle?) {
                words(partial)?.let { trySend(Event.Partial(it)) }
            }

            override fun onResults(results: Bundle?) {
                ended = true
                trySend(Event.Settled(words(results)))
                close()
            }

            override fun onError(error: Int) {
                ended = true
                trySend(Event.Failed(error))
                close()
            }

            override fun onReadyForSpeech(params: Bundle?) {}
            override fun onBeginningOfSpeech() {}
            override fun onRmsChanged(rmsdB: Float) {}
            override fun onBufferReceived(buffer: ByteArray?) {}
            override fun onEndOfSpeech() {}
            override fun onEvent(eventType: Int, params: Bundle?) {}
        })
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            // US ATC's phraseology, in American English, as the engine reads it.
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE, "en-US")
            .putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            // The on-device recognizer is offline already; said again for
            // any service that reads only the extra.
            .putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
        r.startListening(intent)
        awaitClose { if (!ended && recognizer === r) r.cancel() }
    }

    /** One utterance heard, its words put in the list as they come and
     *  as they settle; how it ended (null where nothing was heard). */
    private suspend fun hear(): Event? {
        var id: Int? = null
        var end: Event? = null
        utterance().collect { e ->
            when (e) {
                is Event.Partial -> put(Heard(id ?: nextId++.also { id = it }, e.words, AppClock.nowMs(), final = false))
                is Event.Settled -> {
                    val settled = id ?: nextId++
                    if (e.words != null) put(Heard(settled, e.words, AppClock.nowMs(), final = true))
                }
                is Event.Failed -> {}
            }
            end = e
        }
        return end
    }

    /** After an utterance settles or misses: whether to listen again. A
     *  silence or a miss is listened to again, nothing said. Any other
     *  error is said (RecognizerErrors); one that passes is tried again,
     *  up to MAX_IN_A_ROW, and the rest stop the listening. */
    private fun carryOn(end: Event?): Boolean {
        if (end !is Event.Failed) {
            // Heard again: a passing error said before is over.
            if (end is Event.Settled) {
                if (failures > 0) _error.value = null
                failures = 0
            }
            return true
        }
        if (end.error == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS) {
            _error.value = "ATC: allow the microphone to listen to the radio"
            stop()
            return false
        }
        val outcome = RecognizerErrors.of(end.error)
        if (outcome.words == null) return true
        failures++
        _error.value = "ATC: ${outcome.words}"
        if (outcome.again && failures < RecognizerErrors.MAX_IN_A_ROW) return true
        stop()
        return false
    }

    private fun release() {
        recognizer?.destroy()
        recognizer = null
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
