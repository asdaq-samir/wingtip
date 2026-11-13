package app.wingtipmaps.android.flight

import androidx.lifecycle.ViewModel
import app.wingtipmaps.android.Plan
import app.wingtipmaps.android.api.AheadAlert
import app.wingtipmaps.android.api.NavLogTotals
import app.wingtipmaps.android.api.NearestAirport
import app.wingtipmaps.android.api.PathPoint
import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.engine.generated.distanceNm
import app.wingtipmaps.android.engine.generated.glideReaches
import app.wingtipmaps.android.engine.generated.stripFuel
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.StateFlow
import javax.inject.Inject

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

    /** The strip's fuel from the planner's totals, as the engine works it for
     *  the three apps (`strip_fuel`); a failure where the engine could not. */
    fun stripFuel(totals: NavLogTotals?, burntGal: Double? = null): Result<EngineContract.StripFuelAnswer> =
        Engine.stripFuel(fuelRequiredGal = totals?.fuelRequiredGal, fuelMarginGal = totals?.fuelMarginGal, burntGal = burntGal)

    /** Whether a field is within a still-air glide at pattern height, by the
     *  engine's glide_reaches over the field's own elevation, at the picked
     *  airplane's own glide ratio (false with none). */
    fun glideReaches(fix: OwnShip.Fix, field: NearestAirport): Result<Boolean> =
        Engine.glideReaches(fix.altitudeFt, fix.groundspeedKt, field.distanceNm, field.elevationFt, session.inFlight.glideRatio)
}
