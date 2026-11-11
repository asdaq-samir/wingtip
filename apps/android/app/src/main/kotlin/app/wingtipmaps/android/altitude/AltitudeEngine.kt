package app.wingtipmaps.android.altitude

import app.wingtipmaps.android.api.generated.NavLogAltitude
import app.wingtipmaps.android.api.generated.RouteProfile
import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.engine.generated.altitudeAdvisor
import app.wingtipmaps.android.engine.generated.altitudeChange
import app.wingtipmaps.android.engine.generated.profileClearance

/**
 * The engine's answers the altitude screens draw, asked by name: the
 * clearance at an altitude previewed on the profile's slider
 * (`profile_clearance`: red within 100 ft, yellow within 1,000 ft,
 * ForeFlight's display defaults, no regulation's), the Altitude Advisor's
 * rows (`altitude_advisor`) and a waypoint's Start At or Cross At change
 * (`altitude_change`). The Kotlin only hands the planner's data over.
 */
object AltitudeEngine {
    typealias Clearance = EngineContract.ProfileClearanceAnswer
    typealias Row = EngineContract.AltitudeAdvisorAnswerItem
    typealias Change = EngineContract.AltitudeChangeAnswer

    /** The clearance at `ft` over the side view's ground and obstacles,
     *  with the waypoints to say where. */
    fun clearance(profile: RouteProfile, ft: Double, waypoints: List<ProfileModel.Waypoint>): Result<Clearance> =
        Engine.profileClearance(
            altitudeFt = ft,
            alongNm = profile.terrain.map { it.alongNm },
            groundFt = profile.terrain.map { it.groundFt },
            // The planner's side view has no obstacles yet; the engine takes them when it does.
            obstacles = null,
            points = waypoints.map { EngineContract.ProfileClearanceInputPointsItem(ident = it.ident, alongNm = it.alongNm) },
        )

    /** The Advisor's rows from the planner's altitude line: each legal
     *  altitude's figures, its plans by name and the altitude flown. */
    fun advisor(line: NavLogAltitude?, flownFt: Double?): Result<List<Row>> =
        Engine.altitudeAdvisor(
            figures = line?.altitudeFigures.orEmpty().map {
                EngineContract.AltitudeAdvisorInputFiguresItem(altitudeFt = it.altitudeFt, eteMin = it.eteMin, fuelGal = it.fuelGal, tailwindKt = it.tailwindKt, everywhere = it.everywhere)
            },
            flownFt = flownFt,
            // Each plan cruises at the highest of its steps.
            plans = line?.options.orEmpty().mapNotNull { o -> o.steps.maxOfOrNull { it.altitudeFt }?.let { EngineContract.AltitudeAdvisorInputPlansItem(kind = o.kind, altitudeFt = it) } },
        )

    /** A waypoint's change from the altitude flown into it to `toFt`,
     *  Start At or Cross At: where it begins and ends; no airplane's
     *  figures are handed over, so the engine gives its geometry alone. */
    fun change(waypoint: ProfileModel.Waypoint, toFt: Double, how: PlanAltitudes.How): Result<Change> =
        Engine.altitudeChange(
            alongNm = waypoint.alongNm,
            fromFt = waypoint.legFt,
            toFt = toFt,
            mode = if (how == PlanAltitudes.How.START_AT) "start_at" else "cross_at",
        )
}
