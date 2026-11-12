package app.wingtipmaps.android.live

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.wingtipmaps.android.api.generated.SpecialUse
import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.MapRules
import app.wingtipmaps.android.engine.generated.suaAltitudes
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** The engine's words for a special-use area (faa_words, sua_altitudes):
 *  a fake in the tests. */
interface AreaWords {
    fun name(text: String): String
    fun altitudes(area: SpecialUse): String?
}

object EngineAreaWords : AreaWords {
    override fun name(text: String) = MapRules.faaWords(text)
    override fun altitudes(area: SpecialUse): String? =
        Engine.suaAltitudes(area.floorFt, area.floorRef, area.ceilingFt, area.ceilingRef).getOrNull()
}

/**
 * The special-use areas over a point tapped on the map, for the airspace
 * card (the web's AirspaceCard "Special use" group): each area the
 * planner finds there (/api/airspace/at), its altitudes and times of use,
 * and SFDPS's word on it now where it has one (/api/live/saa), which is
 * the FAA's own and newer than the chart's schedule.
 */
class SpecialUseModel(
    private val source: LiveSource = PlannerLive,
    private val words: AreaWords = EngineAreaWords,
) : ViewModel() {
    // TODO(claude/android-data-stock): @HiltViewModel with an @Inject
    // constructor once the sources and seams it is given are injectable
    // (Hilt, 2026-11-12); until then Hilt's factory hands it to the default one.
    data class Area(val name: String, val kind: String, val line: String, val status: String?, val active: Boolean)

    data class State(
        val at: Pair<Double, Double>? = null,
        val areas: List<Area>? = null,
        /** The FAA's special-use airspace did not answer: said, not
         *  shown as none. */
        val unavailable: Boolean = false,
        val loading: Boolean = false,
    )

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()
    private var asking: Job? = null

    fun at(lat: Double, lon: Double) {
        if (_state.value.at == lat to lon) return
        asking?.cancel()
        _state.value = State(at = lat to lon, loading = true)
        asking = viewModelScope.launch {
            try {
                val here = source.airspaceAt(lat, lon)
                val areas = here.specialUse.orEmpty()
                val statuses = if (areas.isEmpty()) emptyMap() else try {
                    source.saa(areas.map { it.name }).areas
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    // No word from SFDPS: the chart's times of use stand.
                    emptyMap()
                }
                _state.value = State(
                    at = lat to lon,
                    areas = areas.map { a ->
                        val status = statuses[a.name]
                        Area(
                            name = words.name(a.name), kind = a.kind,
                            line = listOfNotNull(words.altitudes(a), a.timesOfUse, a.controllingAgency).joinToString(" · "),
                            status = LiveWords.saaWords(status), active = status?.active == true,
                        )
                    },
                    unavailable = here.specialUseUnavailable == true,
                )
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _state.value = State(at = lat to lon, unavailable = true)
            }
        }
    }
}
