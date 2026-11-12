package app.wingtipmaps.android.copilot

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.wingtipmaps.android.AppClock
import app.wingtipmaps.android.api.AheadAlert
import app.wingtipmaps.android.api.generated.CopilotAround
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.flight.OwnShip
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlin.math.max

/** One message of the copilot's, the engine's. */
typealias CopilotMessage = EngineContract.CopilotMessage

/**
 * The in-flight copilot (the web's useCopilot): while flying, the one
 * message that matters most now from the engine's copilot_watch, over
 * the planner's reports round the airplane (/api/copilot/around, asked
 * again each minute or as the airplane gets somewhere new), the alerts
 * ahead and the plan's figures -- said aloud once where the pilot asked
 * for it (Copilot: Spoken). Nothing is refused or held back from the
 * pilot: the engine warns, the pilot decides (decision 0008).
 */
class CopilotModel(
    private val source: CopilotSource = PlannerCopilot,
    private val rules: CopilotRules = EngineCopilot,
) : ViewModel() {
    // TODO(claude/android-data-stock): @HiltViewModel with an @Inject
    // constructor once the sources and seams it is given are injectable
    // (Hilt, 2026-11-12); until then Hilt's factory hands it to the default one.
    private val _message = MutableStateFlow<CopilotMessage?>(null)
    val message: StateFlow<CopilotMessage?> = _message.asStateFlow()

    private var around: CopilotAround? = null
    private var askedFor: String? = null
    private var askedAtMs = 0L
    private var asking: Job? = null
    private var lookedAtMs: Long? = null
    private var firstSeen: Map<String, String?> = emptyMap()
    private var startedAtMs: Long? = null
    private val said = mutableSetOf<String>()
    private val dismissed = mutableSetOf<String>()

    /**
     * Each fix while the copilot is wanted: the planner asked where the
     * question has changed or a minute has gone, the engine every few
     * seconds. Off, or not flying, it says nothing, and the next flight
     * starts afresh.
     */
    fun look(
        mode: CopilotMode, flying: Boolean, fix: OwnShip.Fix?, flight: CopilotFlight?, ahead: List<AheadAlert>, voice: CopilotVoice?,
        minimums: EngineContract.CopilotWatchInputMinimums? = null, nowMs: Long = AppClock.nowMs(),
    ) {
        if (mode == CopilotMode.OFF || !flying || fix == null || flight == null) {
            reset()
            return
        }
        if (startedAtMs == null) startedAtMs = fix.atMs
        val along = rules.along(fix.lat, fix.lon, flight.line)
        val question = listOf(Math.round(fix.lat * 10) / 10.0, Math.round(fix.lon * 10) / 10.0, flight.dest, flight.alternate,
            CopilotShapes.restOfRoute(fix.lat, fix.lon, flight.line, along?.leg ?: 0)).joinToString("|")
        if (question != askedFor || nowMs - askedAtMs >= ASK_MS) ask(question, fix, flight, along, nowMs)
        if (lookedAtMs?.let { nowMs - it < LOOK_MS } == true) return
        lookedAtMs = nowMs
        val got = around ?: return
        val answer = rules.watch(input(fix, flight, got, along, ahead, minimums)) ?: return
        val first = answer.messages.firstOrNull { it.id !in dismissed }
        val shown = _message.value
        if (shown?.id != first?.id || shown?.title != first?.title) _message.value = first
        // Said once a message, and only the copilot's own: the alerts
        // ahead speak for themselves.
        if (first != null && !first.elsewhere && said.add(first.id) && mode == CopilotMode.SPOKEN) {
            if (first.level == "warning") voice?.interrupt(first.say) else voice?.say(first.say)
        }
    }

    /** OK: the message put away; a new one comes in its place. */
    fun dismiss() {
        val shown = _message.value ?: return
        dismissed += shown.id
        _message.value = null
        lookedAtMs = null
    }

    private fun ask(question: String, fix: OwnShip.Fix, flight: CopilotFlight, along: Along?, nowMs: Long) {
        askedFor = question
        askedAtMs = nowMs
        asking?.cancel()
        asking = viewModelScope.launch {
            try {
                val got = source.around(fix.lat, fix.lon, flight.dest, flight.alternate, CopilotShapes.restOfRoute(fix.lat, fix.lon, flight.line, along?.leg ?: 0))
                // Each field's category the first time it was seen, so a
                // worse one later is said as a change.
                firstSeen = firstSeen + got.fields.filter { it.ident !in firstSeen }.associate { it.ident to it.metar?.flightCategory }
                around = got
                lookedAtMs = null
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                // A copilot that cannot read says nothing; the alerts
                // banner says when the planner does not answer.
            }
        }
    }

    private fun input(
        fix: OwnShip.Fix, flight: CopilotFlight, got: CopilotAround, along: Along?, ahead: List<AheadAlert>,
        minimums: EngineContract.CopilotWatchInputMinimums?,
    ): EngineContract.CopilotWatchInput {
        val hours = max(0L, fix.atMs - (startedAtMs ?: fix.atMs)) / 3_600_000.0
        val fuel = flight.fuelGal
        val burn = flight.burnGph
        return EngineContract.CopilotWatchInput(
            nowS = fix.atMs / 1000.0,
            own = EngineContract.CopilotWatchInputOwn(fix.lat, fix.lon, fix.trackDeg, fix.groundspeedKt),
            fields = CopilotShapes.fields(got, firstSeen),
            rules = flight.rules,
            // The pilot's own minimums (Setup) and whether anyone is aboard
            // (the Airplane page), as the web's copilotInput passes them.
            minimums = minimums, passengers = flight.passengers,
            fuelGal = if (fuel != null && burn != null) max(0.0, fuel - burn * hours) else null,
            burnGph = burn, tasKt = flight.tasKt, dest = flight.dest, alternate = flight.alternate,
            remainingNm = along?.leftNm, plannedGsKt = flight.plannedGsKt,
            areas = CopilotShapes.areas(got), itws = CopilotShapes.itws(got),
            ahead = ahead.map { EngineContract.CopilotWatchInputAheadItem(it.id, it.kind, it.level, it.name) },
        )
    }

    private fun reset() {
        _message.value = null
        firstSeen = emptyMap()
        startedAtMs = null
        said.clear()
        dismissed.clear()
        around = null
        askedFor = null
    }

    companion object {
        /** How often the copilot looks again: the engine's answer takes
         *  microseconds, but a message that changed a second ago needs no
         *  new look every fix. */
        const val LOOK_MS = 3_000L

        /** How often the planner is asked again: METARs come hourly and a
         *  SPECI at any time; TFRs, SFDPS and ITWS are read live. */
        const val ASK_MS = 60_000L
    }
}
