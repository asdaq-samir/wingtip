package app.wingtipmaps.android.map

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.api.Planner
import app.wingtipmaps.android.api.generated.Briefing
import app.wingtipmaps.android.api.routeBriefing
import app.wingtipmaps.android.engine.generated.EngineContract
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * The plan's fields whose weather gets worse by the pilot's time there
 * (the owner's pick, 2026-11-10, the ↓ badge): each field the plan uses --
 * the departure, the stops and the destination -- its METAR now against
 * its TAF's worst within an hour of its ETA, the ETA the planner's from
 * the plan's departure time and time en route (/api/briefing's forecast
 * stations), and the engine's `weather_worse` the judge (AIM 7-1-7: a
 * worse category, and worse than VFR). Off the route, no badge. Asked
 * again as the route or its time changes, and every ten minutes.
 */
class RouteWorse : ViewModel() {
    private val _idents = MutableStateFlow<Set<String>>(emptySet())
    val idents: StateFlow<Set<String>> = _idents.asStateFlow()

    private var asked: Key? = null
    private var askedAtMs = 0L
    private var asking: Job? = null

    private data class Key(val dep: String, val stops: List<String>, val dest: String, val depart: String?, val eteMin: Double?)

    /** The plan as it is now; nothing asked without a route. */
    fun plan(state: Plan.State, rules: StationMarks.Rules = StationMarks.EngineRules) {
        if (!state.routed) {
            asking?.cancel()
            asked = null
            _idents.value = emptySet()
            return
        }
        val key = Key(state.dep, state.stops, state.dest, state.depart, state.totals?.eteMin)
        val now = System.currentTimeMillis()
        if (key == asked && now - askedAtMs < MapWeather.EVERY_MS) return
        asked = key
        askedAtMs = now
        asking?.cancel()
        asking = viewModelScope.launch {
            try {
                val briefing = Planner.routeBriefing(key.dep, key.dest, key.stops, key.depart, key.eteMin)
                val (then, atEta) = readings(listOf(key.dep) + key.stops + listOf(key.dest), briefing)
                _idents.value = withContext(Dispatchers.Default) { rules.worse(then, atEta) }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                // No signal or the planner down: the badges stand, and the
                // next change asks again.
                askedAtMs = 0L
            }
        }
    }

    companion object {
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
