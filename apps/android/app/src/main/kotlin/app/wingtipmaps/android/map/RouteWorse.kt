package app.wingtipmaps.android.map

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.wingtipmaps.android.AppClock
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.alternate.PlanAlternate
import app.wingtipmaps.android.api.Planner
import app.wingtipmaps.android.api.generated.AlternateLeg
import app.wingtipmaps.android.api.generated.Briefing
import app.wingtipmaps.android.api.routeBriefing
import app.wingtipmaps.android.engine.generated.EngineContract
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import javax.inject.Inject

/**
 * The plan's fields whose weather gets worse by the pilot's time there
 * (the owner's pick, 2026-11-10, the ↓ badge): each field the plan uses --
 * the departure, the stops and the destination -- its METAR now against
 * its TAF's worst within an hour of its ETA, the ETA the planner's from
 * the plan's departure time and time en route (/api/briefing's forecast
 * stations), and the engine's `weather_worse` the judge (AIM 7-1-7: a
 * worse category, and worse than VFR). Under IFR the alternate the nav
 * log flies on to as well (PlanAlternate): its METAR now against its TAF
 * by its own ETA, the destination's ETA and the leg on to it, from the
 * same briefing asked of that leg. Off the route, no badge. Asked again
 * as the route or its time changes, and every ten minutes.
 */
@HiltViewModel
class RouteWorse @Inject constructor() : ViewModel() {
    private val _idents = MutableStateFlow<Set<String>>(emptySet())
    val idents: StateFlow<Set<String>> = _idents.asStateFlow()

    private var asked: Key? = null
    private var askedAtMs = 0L
    private var asking: Job? = null

    private data class Key(val dep: String, val stops: List<String>, val dest: String, val depart: String?, val eteMin: Double?, val alternate: AlternateLeg?)

    /** The plan as it is now; nothing asked without a route. */
    fun plan(state: Plan.State, rules: StationMarks.Rules = StationMarks.EngineRules) {
        if (!state.routed) {
            asking?.cancel()
            asked = null
            _idents.value = emptySet()
            return
        }
        val key = Key(state.dep, state.stops, state.dest, state.depart, state.totals?.eteMin, state.totals?.alternate)
        val now = AppClock.nowMs()
        if (key == asked && now - askedAtMs < MapWeather.EVERY_MS) return
        asked = key
        askedAtMs = now
        asking?.cancel()
        asking = viewModelScope.launch {
            try {
                val briefing = Planner.routeBriefing(key.dep, key.dest, key.stops, key.depart, key.eteMin)
                val (then, atEta) = readings(listOf(key.dep) + key.stops + listOf(key.dest), briefing)
                val (altThen, altAtEta) = alternateReadings(key)
                _idents.value = withContext(Dispatchers.Default) { rules.worse(then + altThen, atEta + altAtEta) }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                // No signal or the planner down: the badges stand, and the
                // next change asks again.
                askedAtMs = 0L
            }
        }
    }

    /** The alternate's readings: the leg on to it briefed as a flight of
     *  its own, leaving the destination at its ETA; none without an
     *  alternate or without a time en route to reach it by (no airplane),
     *  and none where that briefing cannot be had, the route's badges
     *  standing on their own. */
    private suspend fun alternateReadings(key: Key): Pair<List<EngineContract.WorseField>, List<EngineContract.WorseField>> {
        val leg = key.alternate ?: return NONE
        val landsAt = PlanAlternate.landsAt(key.depart, key.eteMin, AppClock.nowMs()) ?: return NONE
        val briefing = try {
            Planner.routeBriefing(key.dest, leg.ident, emptyList(), landsAt, leg.eteMin)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            return NONE
        }
        return readings(listOf(leg.ident), briefing)
    }

    companion object {
        private val NONE = emptyList<EngineContract.WorseField>() to emptyList<EngineContract.WorseField>()

        /** Each field's METAR now, and its own TAF's worst by its ETA (the
         *  station whose ICAO id is the field's, or K and its three
         *  letters), for the fields that have both. */
        fun readings(fields: List<String>, briefing: Briefing): Pair<List<EngineContract.WorseField>, List<EngineContract.WorseField>> {
            val then = mutableListOf<EngineContract.WorseField>()
            val atEta = mutableListOf<EngineContract.WorseField>()
            for (ident in fields.distinct()) {
                val metar = briefing.metars[ident] ?: continue
                val taf = briefing.forecast.stations.firstOrNull { (it.icaoId == ident || it.icaoId == "K$ident") && it.eta != null } ?: continue
                then += EngineContract.WorseField(ident, metar.ceilingFt, metar.visibilitySm, metar.ceilingUnknown)
                atEta += EngineContract.WorseField(ident, taf.etaCeilingFt, taf.etaVisibilitySm, taf.etaCeilingUnknown)
            }
            return then to atEta
        }
    }
}
