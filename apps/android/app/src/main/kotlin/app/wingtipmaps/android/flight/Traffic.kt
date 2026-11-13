package app.wingtipmaps.android.flight

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import app.wingtipmaps.android.AppClock
import app.wingtipmaps.android.api.Planner
import app.wingtipmaps.android.api.TrafficAircraft
import app.wingtipmaps.android.api.name
import app.wingtipmaps.android.api.traffic
import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.engine.generated.ownShipHex
import app.wingtipmaps.android.engine.generated.trafficFresh
import app.wingtipmaps.android.engine.generated.trafficMarks
import app.wingtipmaps.android.notify.Notifications
import app.wingtipmaps.android.receiver.Receiver
import app.wingtipmaps.android.settings
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlin.math.roundToInt

/**
 * The traffic layer's switch, kept in the app's settings file under
 * "traffic" so it holds across launches. On until the pilot turns it
 * off, as the app has always started with traffic on (the iOS app's
 * Traffic.on starts the same way). Its own small piece, apart from
 * Traffic's polling, so its wiring is tested on a plain DataStore.
 */
class TrafficSwitch(private val store: DataStore<Preferences>, private val scope: CoroutineScope) {
    private val _on = MutableStateFlow(true)
    val on: StateFlow<Boolean> = _on.asStateFlow()

    /** The kept value read once; a choice made before it lands wins. */
    val loaded: Job = scope.launch { store.data.first()[KEY]?.let { _on.value = it } }

    /** Turns the layer on or off now and keeps it; the write's job. */
    fun set(on: Boolean): Job {
        loaded.cancel()
        _on.value = on
        return scope.launch { store.edit { it[KEY] = on } }
    }

    companion object {
        val KEY = booleanPreferencesKey("traffic")
    }
}

/** An airplane's mark: the engine's `traffic_marks` answer, one per airplane. */
typealias Mark = EngineContract.TrafficMarksAnswerItem

/**
 * The airplanes ADS-B receivers hear about the map, from the planner
 * (/api/traffic, wingtip.traffic, adsb.lol's open data), as the web app's
 * TrafficLayer and the iOS app's Traffic ask for them: every five
 * seconds, about own ship where there is a fix, else the middle of the
 * map, out to the map's corners (10 to 60 nm). For knowing what is
 * about, never for avoiding it. Each airplane's mark -- its height
 * against own ship's as TCAS writes it, and whether it is near -- is the
 * engine's (`traffic_marks`), in one call for the whole answer.
 */
class Traffic(
    private val context: Context,
    private val ticker: Ticker,
    private val scope: CoroutineScope,
    private val ownShip: OwnShip,
    private val tracking: Tracking,
) {
    private val switch = TrafficSwitch(context.settings, scope)
    /** Whether the layer is on; kept across launches (TrafficSwitch),
     *  turned on and off from Setup's Map section. */
    val on: StateFlow<Boolean> = switch.on

    private val _planes = MutableStateFlow<List<TrafficAircraft>>(emptyList())
    val planes: StateFlow<List<TrafficAircraft>> = _planes.asStateFlow()

    /** Each airplane's mark, in the planes' order. */
    private val _marks = MutableStateFlow<List<Mark>>(emptyList())
    val marks: StateFlow<List<Mark>> = _marks.asStateFlow()

    /** The engine's words where its traffic rules failed for the last
     *  answer (own ship's own transponder, the marks), shown on an
     *  airplane's card; the airplanes are drawn without their marks. */
    private val _problem = MutableStateFlow<String?>(null)
    val problem: StateFlow<String?> = _problem.asStateFlow()

    private val _source = MutableStateFlow<String?>(null)
    val source: StateFlow<String?> = _source.asStateFlow()

    /** When the airplanes last heard were where they are given: the
     *  answer's time less its own age (TrafficAnswer.age_s). */
    private val _heardAtMs = MutableStateFlow<Long?>(null)
    val heardAtMs: StateFlow<Long?> = _heardAtMs.asStateFlow()

    /** The middle of the map and the miles to its corner, as the map last
     *  rested: the screen sets them. */
    var mapCentre: Pair<Double, Double>? = null
    var mapRadiusNm = 30.0

    /** The internet's airplanes at the last answer, none once it fails;
     *  drawn after the cockpit receiver's own (Receiver.traffic). */
    private var internet: List<TrafficAircraft> = emptyList()
    /** Own ship's fix at the last answer, for the receiver's heights. */
    private var lastFix: OwnShip.Fix? = null

    /** The airplanes near own ship at the last answer, each told once. */
    private var nearHexes: Set<String> = emptySet()
    private var every: Ticker.Registration? = null

    fun setOn(on: Boolean) {
        switch.set(on)
        if (!on) {
            _planes.value = emptyList()
            _marks.value = emptyList()
        }
    }

    /** Asked again and again while the map is shown, on the app's one
     *  clock, about own ship where there is a fix (its height tells which
     *  airplanes are near), else about the middle of the map. */
    fun start() {
        // The receiver's airplanes merged as each second's bytes are read.
        Receiver.of(context).onRead = { if (on.value) publish(lastFix, tell = false) }
        if (every == null) every = ticker.every(EVERY_MS) { ask(ownShip.fix.value) }
    }

    fun stop() {
        every?.cancel()
        every = null
    }

    /** One answer now, out of the clock's turn: a pull on a traffic card. */
    suspend fun refresh() = ask(ownShip.fix.value)

    /** One answer about a point, where traffic is on and there is one. */
    private suspend fun ask(fix: OwnShip.Fix?) {
        if (!on.value) return
        lastFix = fix
        val at = fix?.let { it.lat to it.lon } ?: mapCentre ?: return
        val radius = mapRadiusNm.coerceIn(10.0, 60.0)
        val answer = try {
            Planner.traffic(at.first, at.second, radius)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            // No signal: the receiver's airplanes alone.
            internet = emptyList()
            publish(fix, tell = true)
            return
        }
        if (!on.value) return
        val age = answer.ageS ?: 0.0
        // Only the airplanes heard lately enough to be where they are given
        // (the engine's `traffic_fresh`); where it cannot say, none, as an
        // airplane drawn where it no longer is misleads.
        val fresh = Engine.trafficFresh(answer.ageS, answer.aircraft.map { EngineContract.TrafficFreshInputPlanesItem(it.seenS) })
        val heard = fresh.map { kept -> answer.aircraft.filterIndexed { i, _ -> kept.getOrElse(i) { false } } }.getOrDefault(emptyList())
        // Own ship's own transponder, heard by the receivers on the ground,
        // is not traffic to itself (the engine's `own_ship_hex`).
        val own = ownShipHex(heard.map { it.copy(seenS = (it.seenS ?: 0.0) + age) }, fix)
        internet = heard.filter { it.hex != own.getOrNull() }
        _source.value = answer.source
        _heardAtMs.value = AppClock.nowMs() - (age * 1000).toLong()
        publish(fix, tell = true, ownProblem = fresh.exceptionOrNull() ?: own.exceptionOrNull())
    }

    /** The airplanes drawn -- the receiver's first, then the internet's it
     *  does not hear -- with their marks; told to Tracking and, at each
     *  answer, the near ones told. A receiver airplane's `seen_s` is its
     *  age now; the screen dates every airplane from heardAtMs, the
     *  internet answer's time, so it is given against that time instead. */
    private fun publish(fix: OwnShip.Fix?, tell: Boolean, ownProblem: Throwable? = null) {
        val nowMs = AppClock.nowMs()
        if (internet.isEmpty()) _heardAtMs.value = nowMs
        val since = (nowMs - (_heardAtMs.value ?: nowMs)) / 1000.0
        val relayed = internet.toHashSet()
        val planes = Receiver.of(context).traffic(internet, fix?.altitudeFt, nowMs)
            .map { if (it in relayed) it else it.copy(seenS = (it.seenS ?: 0.0) - since) }
        val marks = marks(planes, fix)
        _planes.value = planes
        // A mark the engine could not give is blank, not near: the airplane
        // is still drawn, and the card says why it has no mark.
        _marks.value = marks.getOrElse { planes.map { Mark("", near = false, tell = false) } }
        _problem.value = (ownProblem ?: marks.exceptionOrNull())?.let { "The traffic rules failed: ${it.message}" }
        tracking.heard(planes)
        if (tell) tellNear(fix, planes, _marks.value)
    }

    /** The airplanes near own ship, in height and in miles (the engine's
     *  `traffic_marks` tell: within 1,000 ft of its height and 5 nm of
     *  it), each told once as it comes near, as a heads-up notification
     *  while the app is not in front; on the screen the amber mark says
     *  it, so nothing is sent then. How far off and which way are the
     *  mark's too. Permission is asked the first time traffic is near
     *  with the app in front, the moment the pilot sees what it is for. */
    private fun tellNear(fix: OwnShip.Fix?, planes: List<TrafficAircraft>, marks: List<Mark>) {
        val ownFt = fix?.altitudeFt
        if (fix == null || ownFt == null) {
            nearHexes = emptySet()
            return
        }
        val near = HashSet<String>()
        for ((plane, mark) in planes.zip(marks)) {
            if (!mark.tell) continue
            near += plane.hex
            if (plane.hex in nearHexes) continue
            if (Notifications.inFront) {
                Notifications.allow()
                continue
            }
            // A mark told always has its miles and bearing; without them
            // there is nothing to say where it is.
            val nm = mark.nm ?: continue
            val bearing = mark.bearingDeg ?: continue
            val against = plane.altitudeFt?.let { ", ${against(it - ownFt)}" } ?: ""
            val place = "${nm.roundToInt()} nm ${Geo.compassPoint(bearing)} of you"
            Notifications.tell(context, Notifications.CHANNEL_TRAFFIC, "Traffic near you", "${plane.name}, $place$against", "traffic-${plane.hex}")
        }
        nearHexes = near
    }

    /** What is drawn under an airplane: its height against own ship's in
     *  hundreds of feet, "+05" above and "-12" below, as TCAS writes it,
     *  with an arrow climbing or descending at 500 ft/min or more (the
     *  FAA's Introduction to TCAS II, version 7.1); with own ship's height
     *  not known, its own height in feet; nothing where it sends none.
     *  And whether it is near, within 1,000 ft of own ship's height,
     *  drawn amber: a design choice, the web app's, 1,000 ft being the
     *  spacing VFR cruising altitudes keep between opposite directions
     *  (14 CFR 91.159). All the engine's, its type generated from the
     *  engine's contract (engine/generated/EngineContract.kt); the app draws it. */

    companion object {
        /** The planner asks adsb.lol about a region at most every five
         *  seconds (wingtip.traffic), so no sooner than that; twice that with
         *  the app put away (Ticker). */
        const val EVERY_MS = 5_000L

        /** An airplane heard as the engine's traffic rules read it. */
        private fun TrafficAircraft.asPlane(): EngineContract.TrafficPlane =
            EngineContract.TrafficPlane(hex, lat, lon, altitudeFt, verticalFpm, trackDeg, speedKt, seenS)

        /** Which airplane heard is own ship's own transponder -- the one
         *  nearest the fix, within half a mile and 400 ft, going the same
         *  way at about the same speed (the engine's `own_ship_hex`, the
         *  web's ownShipHex) -- or null; each airplane's `seen_s` with the
         *  answer's age in it. */
        fun ownShipHex(planes: List<TrafficAircraft>, fix: OwnShip.Fix?): Result<String?> {
            if (fix == null || planes.isEmpty()) return Result.success(null)
            return Engine.ownShipHex(
                planes.map { it.asPlane() },
                EngineContract.OwnShipFix(fix.lat, fix.lon, fix.trackDeg, fix.groundspeedKt, fix.altitudeFt),
            )
        }

        /** Each airplane's mark, in one call (the engine's `traffic_marks`,
         *  the web app's trafficLabel): with own ship's fix, its miles and
         *  bearing from it and whether it is told. */
        fun marks(planes: List<TrafficAircraft>, fix: OwnShip.Fix?): Result<List<Mark>> =
            Engine.trafficMarks(
                fix?.altitudeFt,
                planes.map { EngineContract.TrafficMarksInputPlanesItem(it.altitudeFt, it.verticalFpm, it.lat, it.lon, it.pressureAltitude) },
                fix?.let { EngineContract.TrafficMarksInputOwn(it.lat, it.lon) },
            )

        /** A height against own ship's in words for a notification: "500
         *  ft above", "1,200 ft below", "at your height". */
        fun against(deltaFt: Double): String {
            val rounded = (deltaFt / 100).roundToInt() * 100
            return when {
                rounded == 0 -> "at your height"
                rounded > 0 -> "${"%,d".format(rounded)} ft above"
                else -> "${"%,d".format(-rounded)} ft below"
            }
        }

        /** What the Open Database License asks of a map that draws
         *  adsb.lol's data: its source and the licence, named. */
        fun credit(source: String?): String {
            val credits = mapOf("adsb.lol" to "Traffic adsb.lol, ODbL", "ADS-B Exchange" to "ADS-B Exchange", "adsb.fi" to "adsb.fi")
            val named = (source ?: "adsb.lol").split(" and ").mapNotNull { credits[it] }
            val first = named.firstOrNull() ?: return "Traffic adsb.lol, ODbL"
            return if (first == "Traffic adsb.lol, ODbL") named.joinToString(" · ") else "Traffic ${named.joinToString(" · ")}"
        }
    }
}
