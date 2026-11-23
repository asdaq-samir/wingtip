package app.wingtipmaps.android.receiver

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import app.wingtipmaps.android.AppClock
import app.wingtipmaps.android.BuildConfig
import app.wingtipmaps.android.Extra
import app.wingtipmaps.android.Extras
import app.wingtipmaps.android.api.TrafficAircraft
import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.flight.OwnShipService
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
import kotlinx.coroutines.withContext
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString

/** The setting: listen for a receiver on the Wi-Fi, or not. */
enum class ReceiverMode { AUTO, OFF }

/**
 * A portable ADS-B receiver in the cockpit that sends GDL 90 over its
 * Wi-Fi (Stratux, Sentry, uAvionix's SkyEcho, a Stratus in its open mode;
 * docs/receivers.md): its GPS as own ship (OwnShipSource), its traffic and
 * the FIS-B weather it is sent, with no internet; the twin of the iOS app's Receiver. The socket gathers
 * its GDL 90; once a second the engine reads the bytes into the picture
 * it holds (HeldPicture, `receiver_delta`), off the main thread and once a
 * minute where it has gone quiet (`due`), and answers only what this model
 * keeps: the receiver, own ship, its traffic and a revision of the rest.
 * The map's traffic, the airport card's reports and the NEXRAD are the
 * engine's views of the held picture. While a receiver is heard, a foreground service keeps the
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

    private val _picture = MutableStateFlow<EngineContract.ReceiverDeltaAnswer?>(null)
    /** What the receiver has said so far, as the engine's last read
     *  answered it: the receiver, own ship and traffic whole, the FIS-B
     *  only counted, with revisions. */
    val picture: StateFlow<EngineContract.ReceiverDeltaAnswer?> = _picture.asStateFlow()

    /** The picture itself, held by the engine; a new one each time the
     *  receiver is turned off, so what it said is let go. */
    private var held = HeldPicture()

    private val _nexrad = MutableStateFlow<EngineContract.ReceiverNexradAnswer?>(null)
    /** The NEXRAD to draw, worked out again as blocks come and go. */
    val nexrad: StateFlow<EngineContract.ReceiverNexradAnswer?> = _nexrad.asStateFlow()

    private val _problem = MutableStateFlow<String?>(null)
    val problem: StateFlow<String?> = _problem.asStateFlow()

    /** Told after each read, for Traffic to merge the receiver's own. */
    var onRead: (() -> Unit)? = null
    /** Told after each read with the picture's own ship and receiver, for
     *  OwnShip to weigh its GPS against the device's; nulls when the
     *  receiver is turned off. */
    var onOwnship: ((EngineContract.ReceiverOwnship?, EngineContract.ReceiverState?) -> Unit)? = null

    private val loaded = scope.launch {
        context.settings.data.first()[KEY]?.let { kept -> ReceiverMode.entries.firstOrNull { it.name == kept }?.let { _mode.value = it } }
    }

    fun setMode(mode: ReceiverMode) {
        loaded.cancel()
        _mode.value = mode
        scope.launch { context.settings.edit { it[KEY] = mode.name } }
        if (mode == ReceiverMode.OFF) quiet()
    }

    /** Nothing listened to and nothing kept: the socket closed, the
     *  picture (the engine's too) and its NEXRAD let go, the foreground
     *  service stopped. */
    private fun quiet() {
        socket.stop()
        held.close()
        held = HeldPicture()
        _picture.value = null
        _nexrad.value = null
        serve(false)
        onOwnship?.invoke(null, null)
    }

    /** Listen and read once a second from now on (Ticker's clock). */
    fun start() {
        if (!ENABLED) return
        if (every == null) every = ticker.every(EVERY_MS) { read() }
    }

    /** When the picture was last read, for its slow ageing (`due`). */
    private var readAtMs = Long.MIN_VALUE / 2

    /** The bytes read into the held picture by the engine, off the main
     *  thread, the NEXRAD worked out again only where its revision moved.
     *  Traffic is told only where the engine's traffic revision moved (the
     *  airplanes, or whether a receiver was heard at all). */
    suspend fun read(nowMs: Long = AppClock.nowMs()) {
        if (_mode.value != ReceiverMode.AUTO) return
        // Put away with no receiver heard and no flight under way, nothing
        // listens: Android keeps the process. One heard, or own ship's
        // service up, it goes on with the screen off.
        if (ticker.background && !serving && !OwnShipService.running) return
        // Parked in Settings' Extras (ADS-B Receiver, off to start): its
        // Auto acts as off, nothing opened and nothing drawn from it; a
        // switch turned off while one was heard lets it go here.
        if (!Extras.of(context).isOn(Extra.ADSB_RECEIVER)) {
            quiet()
            return
        }
        socket.start()
        _problem.value = socket.problem
        val bytes = socket.drain()
        val before = _picture.value
        if (!due(before, heard = bytes.isNotEmpty(), sinceMs = nowMs - readAtMs)) return
        val held = held
        val read = withContext(Dispatchers.Default) {
            held.read(bytes, nowMs / 1000.0).mapCatching { delta ->
                val moved = delta.nexradRevision != before?.nexradRevision
                delta to if (moved) held.nexrad().getOrThrow() else null
            }
        }
        // Turned off while the engine read: that picture is let go.
        if (_mode.value != ReceiverMode.AUTO || held !== this.held) return
        readAtMs = nowMs
        read
            .onSuccess { (picture, nexrad) ->
                _picture.value = picture
                if (nexrad != null) _nexrad.value = nexrad
                serve(picture.receiver.live)
                if (picture.trafficRevision != before?.trafficRevision) onRead?.invoke()
                if (picture.receiver.heartbeatAt != null) onOwnship?.invoke(picture.ownship, picture.receiver)
            }
            .onFailure { _problem.value = it.message }
    }

    /** The traffic to draw: the receiver's own airplanes first, then the
     *  internet's it does not hear, never own ship (`receiver_traffic`);
     *  the internet's alone where no receiver has been heard. */
    fun traffic(internet: List<TrafficAircraft>, ownFt: Double?, nowMs: Long = AppClock.nowMs()): List<TrafficAircraft> {
        val picture = _picture.value ?: return internet
        if (picture.receiver.heartbeatAt == null) return internet
        val heard = internet.map { Engine.json.decodeFromString<EngineContract.HeardPlane>(Engine.json.encodeToString(it)) }
        return held.traffic(heard, ownFt, nowMs / 1000.0)
            .map { merged -> merged.map { Engine.json.decodeFromString<TrafficAircraft>(Engine.json.encodeToString(it)) } }
            .getOrElse { internet }
    }

    /** A field's METAR and TAF as FIS-B sent them, where it did. */
    fun reports(ident: String): EngineContract.ReceiverReportsAnswer? {
        val picture = _picture.value ?: return null
        if (picture.texts == 0) return null
        return held.reports(ident).getOrNull()
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
        /** The switch the receiver is parked behind, the iOS app's
         *  WingtipReceiver: on here, as Android needs no entitlement to
         *  hear a receiver's broadcast (the Wi-Fi's multicast lock,
         *  ReceiverSocket); off, nothing listens and no setting or chip
         *  shows it. build.gradle.kts's RECEIVER_ENABLED. */
        val ENABLED: Boolean = BuildConfig.RECEIVER_ENABLED
        const val EVERY_MS = 1_000L
        /** Quiet, with nothing left that ages by the second, the picture
         *  is aged once a minute: the FIS-B products it keeps are held
         *  minutes to hours (the engine's REGIONAL_HOLD_S, text_hold_s). */
        const val QUIET_EVERY_MS = 60_000L

        /** Whether to read now: bytes heard; or, with none, while the
         *  receiver was heard or still holds airplanes, whose 5 s and 20 s
         *  (the engine's LIVE_S, TARGET_HOLD_S) want ageing each second;
         *  else once each QUIET_EVERY_MS. Never heard: nothing to age. */
        fun due(picture: EngineContract.ReceiverDeltaAnswer?, heard: Boolean, sinceMs: Long): Boolean {
            if (heard) return true
            if (picture == null) return false
            return picture.receiver.live || picture.targets.isNotEmpty() || sinceMs >= QUIET_EVERY_MS
        }

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
