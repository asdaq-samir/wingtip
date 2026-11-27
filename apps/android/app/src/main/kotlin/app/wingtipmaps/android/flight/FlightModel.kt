package app.wingtipmaps.android.flight

import androidx.lifecycle.ViewModel
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.api.AheadAlert
import app.wingtipmaps.android.api.NavLogTotals
import app.wingtipmaps.android.api.NearestAirport
import app.wingtipmaps.android.api.PathPoint
import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.engine.generated.airportUseWords
import app.wingtipmaps.android.engine.generated.distanceNm
import app.wingtipmaps.android.engine.generated.glideReaches
import app.wingtipmaps.android.engine.generated.stripFuel
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext
import javax.inject.Inject
import kotlin.math.floor

/**
 * The flight as the map screen reads it (RootScreen, MapPane, the figures
 * strip, the instruments, the Nearest rows): the one FlightSession's
 * figures and lists, what the map tells it, and the engine's answers the
 * screens show from it, asked here rather than in the views (MVVM).
 */
@HiltViewModel
class FlightModel @Inject constructor(private val session: FlightSession) : ViewModel() {
    /** The instruments, the glide ring and the route's progress at the last fix. */
    val state: StateFlow<InFlight.State> get() = session.inFlight.state

    /** Whether the airplane is at flying speed, told only as that changes. */
    val underway: StateFlow<Boolean> get() = session.inFlight.underway
    val traffic: Traffic get() = session.traffic

    /** Own ship: its fix, the permission and the reading. */
    val ownShip: OwnShip get() = session.ownShip

    /** The airplane tracked (Track on a traffic card). */
    val tracking: Tracking get() = session.tracking

    /** The alerts ahead said aloud, turned on and off from Settings. */
    val spoken: SpokenAlerts get() = session.spoken

    /** The airplane tracked, by its hex. */
    val tracked: StateFlow<String?> get() = session.tracking.hex

    /** The path this phone flew. */
    val trail: StateFlow<List<PathPoint>> get() = session.trail.points

    /** Settings' Clear Your Path: the path put away; the next flight's starts empty. */
    fun clearTrail() = session.trail.clear()

    /** The map moved: the traffic is asked about its middle, out to the
     *  miles to its corner, the engine's `distance_nm`; where it cannot say
     *  (Engine.rule has logged why), the last kept. */
    fun mapView(south: Double, west: Double, north: Double, east: Double) {
        val lat = (south + north) / 2
        val lon = (west + east) / 2
        session.traffic.mapCentre = lat to lon
        Engine.distanceNm(lat, lon, north, east).onSuccess { session.traffic.mapRadiusNm = it }
    }

    /** A fix taken for the instruments and the Live Update (FlightSession.took). */
    fun took(fix: OwnShip.Fix?, plan: Plan.State) = session.took(fix, plan)

    /** The ground under the airplane from the packs, the glide ring's first ground. */
    fun ground(ft: Double?) {
        session.inFlight.terrainFt = ft
    }

    /** The picked airplane's own glide ratio, the ring's; none, no ring. */
    fun glideRatio(ratio: Double?) {
        session.inFlight.glideRatio = ratio
    }

    /** Whether the map shows the glide ring, so the engine is asked for it only then. */
    fun ringShown(shown: Boolean) {
        session.inFlight.ringShown = shown
    }

    /** What is ahead, said aloud where the pilot asked (SpokenAlerts). */
    fun hear(ahead: List<AheadAlert>) = session.spoken.hear(ahead)

    companion object {
        /** The height step a glide is asked again at, ft (reaches). */
        private const val REACH_STEP_FT = 100.0

        /** The fuel from the planner's totals, as the engine works it for
         *  the three apps (`strip_fuel`): with stops, each flight's own
         *  figures (`hops`, the tanks filled at each) and the one being
         *  flown (`hop`), as the web's figures.ts sends them (the aviation
         *  audit's AV-3); a failure where the engine could not. The nav
         *  log's totals ask whether any flight is short with it. */
        fun stripFuelOf(totals: NavLogTotals?, hop: Int = 0, burntGal: Double? = null): Result<EngineContract.StripFuelAnswer> = Engine.stripFuel(
            fuelRequiredGal = totals?.fuelRequiredGal,
            fuelMarginGal = totals?.fuelMarginGal,
            hops = totals?.hops?.map { EngineContract.StripFuelInputHopsItem(it.departure, it.destination, it.totals.fuelRequiredGal, it.totals.fuelMarginGal) },
            hop = hop,
            burntGal = burntGal,
        )
    }

    /** What a glide is asked from: the height floored to REACH_STEP_FT, so
     *  it never claims more than the airplane has, the speed in tens of
     *  knots for the key alone, and the glide ratio. */
    private data class GlideAsk(val altitudeFt: Double?, val speedStep: Int?, val ratio: Double?)

    /**
     * Whether each field, by ident, is within a still-air glide at pattern
     * height, by the engine's glide_reaches over the field's own elevation
     * at the picked airplane's own glide ratio (false with none); worked out off the
     * main thread, and again only as the height crosses a 100 ft step, the
     * speed a 10 kt one or the glide ratio changes, not with every fix:
     * the Nearest rows then draw once a step, not each second.
     */
    fun reaches(fields: List<NearestAirport>): Flow<Map<String, Result<Boolean>>> =
        session.ownShip.fix
            .map { fix -> fix?.let { it to GlideAsk(it.altitudeFt?.let { ft -> floor(ft / REACH_STEP_FT) * REACH_STEP_FT }, it.groundspeedKt?.let { kt -> (kt / 10).toInt() }, session.inFlight.glideRatio) } }
            .distinctUntilChanged { a, b -> a?.second == b?.second }
            .map { asked ->
                val (fix, ask) = asked ?: return@map emptyMap()
                withContext(Dispatchers.Default) {
                    fields.associate { it.ident to Engine.glideReaches(ask.altitudeFt, fix.groundspeedKt, it.distanceNm, it.elevationFt, ask.ratio) }
                }
            }

    /** The engine's airport_use_words key for a field (private, military or
     *  joint use), or null for a public one or when the engine cannot say. */
    fun useWords(field: NearestAirport): String? =
        Engine.airportUseWords(field.isPrivate, field.military).getOrNull()?.use
}
