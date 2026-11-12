package app.wingtipmaps.android.receiver

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.util.Base64
import androidx.core.content.ContextCompat
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import app.wingtipmaps.android.AppClock
import app.wingtipmaps.android.api.TrafficAircraft
import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.engine.generated.receiverNexrad
import app.wingtipmaps.android.engine.generated.receiverRead
import app.wingtipmaps.android.engine.generated.receiverReports
import app.wingtipmaps.android.engine.generated.receiverTraffic
import app.wingtipmaps.android.flight.Ticker
import app.wingtipmaps.android.settings
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString

/** The setting: listen for a receiver on the Wi-Fi, or not. */
enum class ReceiverMode { AUTO, OFF }

/**
 * A portable ADS-B receiver in the cockpit (Stratux, Sentry, Garmin's GDL
 * 39 and 52, uAvionix's): its traffic and the FIS-B weather it is sent,
 * with no internet; the twin of the iOS app's Receiver. The socket gathers
 * its GDL 90; once a second the engine reads the bytes into the picture
 * (`receiver_read`), which this model keeps and hands back; the map's
 * traffic, the airport card's reports and the NEXRAD are the engine's
 * views of it. While a receiver is heard, a foreground service keeps the
 * listening going with the screen off (ReceiverService). Traffic helps see
 * other airplanes, never avoid them (AIM 4-5-7); FIS-B is not the only
 * source of weather (AIM 4-5-9).
 */
class Receiver private constructor(private val context: Context, private val ticker: Ticker, private val scope: CoroutineScope) {
    private val socket = ReceiverSocket(context)
    private var every: Ticker.Registration? = null
    private var serving = false

    private val _mode = MutableStateFlow(ReceiverMode.AUTO)
    val mode: StateFlow<ReceiverMode> = _mode.asStateFlow()

    private val _picture = MutableStateFlow<EngineContract.ReceiverPicture?>(null)
    /** What the receiver has said so far, the engine's own answer. */
    val picture: StateFlow<EngineContract.ReceiverPicture?> = _picture.asStateFlow()

    private val _nexrad = MutableStateFlow<EngineContract.ReceiverNexradAnswer?>(null)
    /** The NEXRAD to draw, worked out again as blocks come and go. */
    val nexrad: StateFlow<EngineContract.ReceiverNexradAnswer?> = _nexrad.asStateFlow()

    private val _problem = MutableStateFlow<String?>(null)
    val problem: StateFlow<String?> = _problem.asStateFlow()

    /** Told after each read, for Traffic to merge the receiver's own. */
    var onRead: (() -> Unit)? = null

    private val loaded = scope.launch {
        context.settings.data.first()[KEY]?.let { kept -> ReceiverMode.entries.firstOrNull { it.name == kept }?.let { _mode.value = it } }
    }

    fun setMode(mode: ReceiverMode) {
        loaded.cancel()
        _mode.value = mode
        scope.launch { context.settings.edit { it[KEY] = mode.name } }
        if (mode == ReceiverMode.OFF) {
            socket.stop()
            _picture.value = null
            _nexrad.value = null
            serve(false)
        }
    }

    /** Listen and read once a second from now on (Ticker's clock). */
    fun start() {
        if (every == null) every = ticker.every(EVERY_MS) { read() }
    }

    fun read(nowMs: Long = AppClock.nowMs()) {
        if (_mode.value != ReceiverMode.AUTO) return
        socket.start()
        _problem.value = socket.problem
        val bytes = socket.drain()
        val before = _picture.value
        if (bytes.isEmpty() && before == null) return
        Engine.receiverRead(Base64.encodeToString(bytes, Base64.NO_WRAP), nowMs / 1000.0, before)
            .onSuccess { picture ->
                _picture.value = picture
                if (picture.nexrad != before?.nexrad) _nexrad.value = Engine.receiverNexrad(picture).getOrNull()
                serve(picture.receiver.live)
            }
            .onFailure { _problem.value = it.message }
        onRead?.invoke()
    }

    /** The traffic to draw: the receiver's own airplanes first, then the
     *  internet's it does not hear, never own ship (`receiver_traffic`);
     *  the internet's alone where no receiver has been heard. */
    fun traffic(internet: List<TrafficAircraft>, ownFt: Double?, nowMs: Long = AppClock.nowMs()): List<TrafficAircraft> {
        val picture = _picture.value ?: return internet
        if (picture.receiver.heartbeatAt == null) return internet
        val heard = internet.map { Engine.json.decodeFromString<EngineContract.HeardPlane>(Engine.json.encodeToString(it)) }
        return Engine.receiverTraffic(picture, heard, ownFt, nowMs / 1000.0)
            .map { merged -> merged.map { Engine.json.decodeFromString<TrafficAircraft>(Engine.json.encodeToString(it)) } }
            .getOrElse { internet }
    }

    /** A field's METAR and TAF as FIS-B sent them, where it did. */
    fun reports(ident: String): EngineContract.ReceiverReportsAnswer? {
        val picture = _picture.value ?: return null
        if (picture.texts.isEmpty()) return null
        return Engine.receiverReports(picture, ident).getOrNull()
    }

    /** The foreground service on while a receiver is heard. Android 12
     *  and later may refuse a start from the background; it is tried
     *  again at the next read. */
    private fun serve(heard: Boolean) {
        if (heard == serving) return
        val intent = Intent(context, ReceiverService::class.java)
        if (heard) {
            serving = try {
                ContextCompat.startForegroundService(context, intent)
                true
            } catch (e: IllegalStateException) {
                false
            }
        } else {
            context.stopService(intent)
            serving = false
        }
    }

    companion object {
        const val EVERY_MS = 1_000L
        private val KEY = stringPreferencesKey("receiver_mode")

        // The application's context, which lives as long as the process.
        @SuppressLint("StaticFieldLeak")
        @Volatile
        private var shared: Receiver? = null

        fun of(context: Context): Receiver =
            shared ?: synchronized(this) {
                shared ?: Receiver(context.applicationContext, Ticker.shared, CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate))
                    .also { shared = it }
            }
    }
}
