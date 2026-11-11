package app.wingtipmaps.android.altitude

import app.wingtipmaps.android.api.generated.AircraftProfile
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
 * (`profile_clearance`: red under 500 ft, 14 CFR 91.119(c)'s least
 * height, yellow within 1,000 ft, 91.119(b)'s), the Altitude Advisor's
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
     *  Start At or Cross At: where it begins and ends, and with the picked
     *  airplane (the planner's altitude line's `aircraft`, as the iPhone's
     *  ProfileRules.change and the web's LegAltitude take it) the climb's
     *  time and fuel from its figures and the descent's at the leg's ground
     *  speed and burn. With no airplane the geometry alone: nothing is
     *  assumed (decision 0011). An airplane the engine cannot fly a climb
     *  for is asked again with none, as the web does, so the pilot still
     *  sees where the change is flown. */
    fun change(waypoint: ProfileModel.Waypoint, toFt: Double, how: PlanAltitudes.How, airplane: AircraftProfile?): Result<Change> {
        val ask = { profile: EngineContract.NavLogProfile? ->
            val leg = waypoint.leg
            Engine.altitudeChange(
                profile = profile,
                alongNm = waypoint.alongNm,
                fromFt = waypoint.legFt,
                toFt = toFt,
                mode = if (how == PlanAltitudes.How.START_AT) "start_at" else "cross_at",
                groundspeedKt = leg?.groundspeedKt,
                tasKt = leg?.tasKt,
                fuelBurnGph = burn(leg?.fuelBurnGph, airplane),
                oatC = leg?.oatC,
            )
        }
        val profile = airplane?.let(::profileOf) ?: return ask(null)
        return ask(profile).recoverCatching { ask(null).getOrThrow() }
    }

    /** The airplane's figures as the engine's nav log reads them
     *  (`NavLogProfile`), each as the planner sent it. */
    fun profileOf(airplane: AircraftProfile): EngineContract.NavLogProfile =
        EngineContract.NavLogProfile(
            cruiseTasKt = airplane.cruiseTasKt,
            fuelBurnGph = airplane.fuelBurnGph,
            serviceCeilingFt = airplane.serviceCeilingFt,
            cruisePowerPct = airplane.cruisePowerPct,
            climbTasKt = airplane.climbTasKt,
            climbFuelBurnGph = airplane.climbFuelBurnGph,
            climbRateFpmSeaLevel = airplane.climbRateFpmSeaLevel,
            taxiFuelGal = airplane.taxiFuelGal,
            usableFuelGal = airplane.usableFuelGal,
            supplementalOxygen = airplane.supplementalOxygen,
            pressurized = airplane.pressurized,
        )

    /** The burn a descent is costed at: the leg's, else the airplane's
     *  cruise burn; none with no airplane, so no fuel is shown. */
    fun burn(legGph: Double?, airplane: AircraftProfile?): Double? =
        if (airplane == null) null else legGph ?: airplane.fuelBurnGph
}
