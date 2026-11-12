package app.wingtipmaps.android.brief

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.wingtipmaps.android.api.Leg
import app.wingtipmaps.android.api.Planner
import app.wingtipmaps.android.api.generated.IcingForecast
import app.wingtipmaps.android.api.icingRoute
import app.wingtipmaps.android.format.Format
import app.wingtipmaps.android.route.RoutePoint
import app.wingtipmaps.android.route.RoutePoints
import app.wingtipmaps.android.strip.Finding
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.time.Instant
import java.util.Locale
import kotlin.math.roundToInt

/**
 * The Brief's forecast icing, a row a leg (the web's ForecastIcingRows and
 * useIcingForecast): the AWC's CIP and FIP on each leg at the altitude it
 * is flown, read for the hour of the leg's middle (/api/icing/route; what
 * it says is the engine's icing_forecast_route) -- the severity there, the
 * share of the leg in it, and the levels icing is forecast between over
 * the leg, for a way out above or below (AIM 7-1-19). Asked once the nav
 * log is whole with each leg's time, so with an airplane chosen; a
 * forecast that cannot be had is said, never shown as no icing.
 */
class IcingModel(private val ask: suspend (fixes: String, altFt: String, legMin: String, groundMin: String) -> IcingForecast = { f, a, l, g -> Planner.icingRoute(f, a, l, g) }) : ViewModel() {
    // TODO(claude/android-data-stock): @HiltViewModel with an @Inject
    // constructor once the sources and seams it is given are injectable
    // (Hilt, 2026-11-12); until then Hilt's factory hands it to the default one.
    data class Row(val title: String, val value: String, val layer: String?, val finding: Finding)

    data class State(
        val route: String? = null,
        val rows: List<Row> = emptyList(),
        /** "AWC CIP and FIP, issued 14:10": the source and its issue. */
        val credit: String? = null,
        val loading: Boolean = false,
        /** The forecast could not be had: said, so a row left out is
         *  never taken for no icing. */
        val unchecked: Boolean = false,
    )

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state.asStateFlow()
    private var asking: Job? = null

    /** The route's legs, asked when each has its time and lines up with
     *  the route's points; nothing again for the same legs. */
    fun brief(points: List<RoutePoint>, legs: List<Leg>) {
        val fixes = RoutePoints.fixes(points, legs)
        if (fixes == null || legs.any { it.eteMin == null }) {
            asking?.cancel()
            _state.value = State()
            return
        }
        val q = Query(
            fixes = RoutePoints.fixesParam(fixes),
            altFt = legs.joinToString(",") { it.altitudeFt.roundToInt().toString() },
            legMin = legs.joinToString(",") { String.format(Locale.US, "%.1f", it.eteMin ?: 0.0) },
            groundMin = legs.joinToString(",") { (it.groundMin ?: 0.0).roundToInt().toString() },
        )
        val key = q.toString()
        if (key == _state.value.route) return
        asking?.cancel()
        _state.value = State(route = key, loading = true)
        asking = viewModelScope.launch {
            _state.value = try {
                val found = ask(q.fixes, q.altFt, q.legMin, q.groundMin)
                State(route = key, rows = rows(found, legs), credit = credit(found.issued))
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                State(route = key, unchecked = true)
            }
        }
    }

    private data class Query(val fixes: String, val altFt: String, val legMin: String, val groundMin: String)

    companion object {
        /** A severity as a row says it: "Light", "None"; "No forecast"
         *  for a leg the AWC had none for. */
        fun severityWord(severity: String?): String = severity?.replaceFirstChar { it.uppercase() } ?: "No forecast"

        fun rows(found: IcingForecast, legs: List<Leg>): List<Row> = found.legs.map { leg ->
            val on = legs.getOrNull(leg.index)
            val iced = leg.severity != null && leg.severity != "none"
            val share = leg.share
            val part = if (iced && share != null && share < 1) ", ${(share * 100).roundToInt()}% of it" else ""
            Row(
                title = on?.let { "${it.from} → ${it.to}" } ?: "Leg ${leg.index + 1}",
                value = "${severityWord(leg.severity)} at ${Format.altitude(leg.altitudeFt)}$part",
                layer = leg.layer?.let { "Icing forecast ${Format.altitudeRange(it.bottomFt, it.topFt)}" }
                    ?: if (leg.severity == null) null else "No icing forecast over the leg",
                finding = when {
                    leg.severity == null -> Finding.UNKNOWN
                    iced -> Finding.CAUTION
                    else -> Finding.OK
                },
            )
        }

        fun credit(issued: String): String =
            "AWC CIP and FIP, issued " + (runCatching { Format.clock(Instant.parse(issued).toEpochMilli()) }.getOrDefault(issued))
    }
}
