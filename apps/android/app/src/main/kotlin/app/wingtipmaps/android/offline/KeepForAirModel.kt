package app.wingtipmaps.android.offline

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.engine.CyclePacks
import app.wingtipmaps.android.map.WeatherLoop
import app.wingtipmaps.android.ready.ReadyFacts
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import javax.inject.Inject

/**
 * Keep for the Air in one tap, the flight plan's row and Ready to fly's
 * fix alike (the iOS app's Plan.keepForTheAir): the route's answers
 * (KeepForAir: cards, diagrams, NOTAMs, Go / No-Go, weather loop), the
 * plan and its nav log as they are (KeptPlan), the cycle packs of the
 * regions it crosses, and -- from the flight plan -- the route's charts
 * as Setup → Downloads keeps a box (DownloadsModel). Then what the
 * answers take on the phone, said as "Kept for the Air: N MB".
 */
@HiltViewModel
class KeepForAirModel @Inject constructor(app: Application) : AndroidViewModel(app) {
    data class State(
        /** The route kept or being kept (ReadyFacts.flightKey). */
        val route: String? = null,
        val keeping: Boolean = false,
        /** What the route's answers take on the phone once kept, MB. */
        val keptMb: Double? = null,
    )

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()

    private val store = KeptForAir.of(app)

    /** Everything kept for the plan on the page; `downloads` keeps the
     *  route's charts too where given. Done when the job is. */
    fun keep(plan: Plan, downloads: DownloadsModel? = null): Job {
        val s = plan.state.value
        val route = ReadyFacts.flightKey(s)
        _state.value = State(route = route, keeping = true)
        return viewModelScope.launch {
            val app = getApplication<Application>()
            val line = s.course?.courseLine.orEmpty().filter { it.size == 2 }
            withContext(Dispatchers.IO) {
                KeepForAir.keep(store, s, ReadyFacts.cruise(s.legs.map { it.altitudeFt }), WeatherLoop.of(app).state.value.kind)
            }
            plan.save()
            if (line.isNotEmpty()) {
                downloads?.let { charts ->
                    charts.load().join()
                    charts.downloadBox(line.minOf { it[1] } - PAD_DEG, line.minOf { it[0] } - PAD_DEG, line.maxOf { it[1] } + PAD_DEG, line.maxOf { it[0] } + PAD_DEG).join()
                }
                val regions = withContext(Dispatchers.Default) { runCatching { CyclePacks.regions(line) }.getOrDefault(emptySet()) }
                if (regions.isNotEmpty()) CyclePacks.of(app).keep(regions)
            }
            val bytes = withContext(Dispatchers.IO) { KeepForAir.bytes(store, s) }
            _state.value = State(route = route, keeping = false, keptMb = bytes / 1e6)
        }
    }

    private companion object {
        /** The box round the route a tenth of a degree (6 nm) out, as the
         *  cycle packs and Ready to fly's charts are kept. */
        const val PAD_DEG = 0.1
    }
}
