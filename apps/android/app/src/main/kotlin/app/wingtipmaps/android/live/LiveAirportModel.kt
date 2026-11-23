package app.wingtipmaps.android.live

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.wingtipmaps.android.AppClock
import app.wingtipmaps.android.api.generated.AirportRvr
import app.wingtipmaps.android.api.generated.DigitalAtis
import app.wingtipmaps.android.engine.generated.EngineContract
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * The airport card's live reports (the web's LiveAirportRows and
 * lib/liveReports), its one model: the field's D-ATIS read into its
 * figures (read_datis, through the planner), its runway visual range
 * against the pilot's minimum (rvr_check), and the Command Center's
 * programs there, asked again each minute while the card is open and
 * the app in front (LiveAirportRows), as RVR is made each minute (AIM
 * 7-1-13); the programs each five minutes, as the iPhone asks them. A report that fails says
 * nothing: the field may have none, and the card's METAR stands.
 */
@HiltViewModel
class LiveAirportModel @Inject constructor(
    private val source: LiveSource,
    private val rules: LiveRules,
) : ViewModel() {
    /** One broadcast as its group shows it. */
    data class Broadcast(val title: String, val glance: String?, val rows: List<LiveRow>, val text: String)

    data class State(
        val ident: String = "",
        val atis: List<Broadcast> = emptyList(),
        val rvr: List<LiveWords.RvrRow> = emptyList(),
        val programs: List<String> = emptyList(),
    )

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()
    private var watching: Job? = null

    /** The pilot's own visibility minimum, statute miles, where one is
     *  set (Setup's personal minimums); none, RVR is shown, not judged. */
    var minimumSm: Double? = null
        private set
    private var lastRvr: AirportRvr? = null
    /** The field and the time the programs were last heard for. */
    private var flowHeard: Pair<String, Long>? = null

    /** A minimum picked or put off: the rows judged again from the
     *  readings already in, with no new ask. */
    fun judgeAgainst(sm: Double?) {
        if (sm == minimumSm) return
        minimumSm = sm
        val rvr = lastRvr ?: return
        _state.update { it.copy(rvr = rvrRows(rvr)) }
    }

    /** The field's reports, asked now and each minute while it is shown;
     *  another field's replace them. */
    fun watch(ident: String) {
        val field = ident.trim().uppercase()
        if (field == _state.value.ident && watching?.isActive == true) return
        watching?.cancel()
        // The same field again (the app back in front): what was heard stands until the new answer.
        if (field != _state.value.ident) _state.value = State(ident = field)
        if (field.length < 3) return
        watching = viewModelScope.launch {
            while (true) {
                refresh(field)
                delay(LIVE_MS)
            }
        }
    }

    fun stop() {
        watching?.cancel()
        watching = null
    }

    private suspend fun refresh(field: String) {
        val atis = quietly { source.atis(field) }?.broadcasts?.map(::broadcast)
        val rvr = quietly { source.rvr(field) }?.also { lastRvr = it }?.let(::rvrRows)
        val now = AppClock.nowMs()
        val flowDue = flowHeard.let { it == null || it.first != field || now - it.second >= FLOW_MS }
        val programs = if (!flowDue) null else quietly { source.flow(listOf(field)) }?.also { flowHeard = field to now }?.programs?.mapNotNull(LiveWords::programLine)
        _state.update {
            if (it.ident != field) it
            else it.copy(atis = atis ?: it.atis, rvr = rvr ?: it.rvr, programs = programs ?: it.programs)
        }
    }

    private fun broadcast(b: DigitalAtis): Broadcast {
        val reading = readingOf(b.reading)?.takeIf(LiveWords::heardAny)
        return Broadcast(
            title = LiveWords.atisTitle(b.which, b.letter),
            glance = reading?.let(LiveWords::glanceWords),
            rows = reading?.let { r ->
                val ceiling = if (r.sky.isEmpty()) null else rules.ceilingFt(r.sky.map { EngineContract.CeilingVisibilityInputLayersItem(LiveWords.metarCover(it.cover), it.baseFt?.toDouble()) })
                LiveWords.atisRows(r, r.wind?.let { rules.calm(it.kt) } ?: false, ceiling)
            }.orEmpty(),
            text = b.text,
        )
    }

    private fun rvrRows(answer: AirportRvr): List<LiveWords.RvrRow> {
        if (answer.runways.isEmpty()) return emptyList()
        val asked = answer.runways.map {
            EngineContract.RvrCheckInputRunwaysItem(it.runway, it.touchdownFt?.toDouble(), it.midpointFt?.toDouble(), it.rolloutFt?.toDouble())
        }
        return LiveWords.rvrRows(answer.runways, rules.rvrUnder(asked, minimumSm), minimumSm)
    }

    private suspend fun <T> quietly(ask: suspend () -> T): T? =
        try {
            ask()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            null
        }

    companion object {
        /** How long a report is fresh: RVR is made each minute (AIM 7-1-13),
         *  ITWS's products expire in three. */
        const val LIVE_MS = 60_000L
        /** The Command Center's programs change by the quarter hour, not
         *  the minute: asked each five minutes (iOS's AirportLive.flowEveryS). */
        const val FLOW_MS = 5 * 60_000L
    }
}
