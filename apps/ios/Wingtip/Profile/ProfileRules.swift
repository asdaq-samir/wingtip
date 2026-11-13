import Foundation

/// The profile's questions of the engine, by name (engine/facade/src/call.rs):
/// how close the ground along the route comes to an altitude
/// (`profile_clearance`, coloured red under 500 ft, 14 CFR 91.119(c)'s
/// least height, and yellow within 1,000 ft, 91.119(b)'s; the legal
/// minimums, 14 CFR 91.119 and 91.177, are kept by the legal altitudes
/// themselves) and the Altitude Advisor's rows (`altitude_advisor`: the
/// wheel's altitudes with the route's time, fuel and wind at each, Fastest
/// and Most economical marked, a row outside the legal ones warned of).
/// Nothing is worked out here: the plan's figures go in, the engine's
/// answer comes out, and each throws where the engine cannot answer.
enum ProfileRules {
    typealias Clearance = EngineContract.ProfileClearanceAnswer
    typealias AdvisorRow = EngineContract.AltitudeAdvisorAnswerItem
    typealias Change = EngineContract.AltitudeChangeAnswer

    /// The waypoints along the profile: the departure at 0 nm, then each
    /// leg's end at the distance flown to it.
    static func waypoints(legs: [Leg]) -> [(ident: String, alongNm: Double)] {
        guard let first = legs.first else { return [] }
        var along = 0.0
        var points = [(ident: first.from, alongNm: 0.0)]
        for leg in legs {
            along += leg.distanceNm
            points.append((ident: leg.to, alongNm: along))
        }
        return points
    }

    /// The clearance at `altitudeFt` over the planner's ground along the
    /// route. The planner's side view carries no obstacles yet, so the
    /// engine is given the ground alone.
    static func clearance(altitudeFt: Double, profile: RouteProfile, legs: [Leg]) throws -> Clearance {
        try Engine.profileClearance(
            altitudeFt: altitudeFt,
            alongNm: profile.terrain.map(\.alongNm),
            groundFt: profile.terrain.map(\.groundFt),
            obstacles: [],
            points: waypoints(legs: legs).map { .init(ident: $0.ident, alongNm: $0.alongNm) })
    }

    /// The advisor's rows, highest first, from the planner's altitude line.
    static func advisor(_ line: NavLogAltitude?, flownFt: Double?) throws -> [AdvisorRow] {
        let figures = (line?.altitudeFigures ?? []).map {
            EngineContract.AltitudeAdvisorInputFiguresItem(altitudeFt: $0.altitudeFt, eteMin: $0.eteMin, fuelGal: $0.fuelGal,
                                                           tailwindKt: $0.tailwindKt, everywhere: $0.everywhere)
        }
        let plans = (line?.options ?? []).compactMap { option in
            option.altitudeFt.map { EngineContract.AltitudeAdvisorInputPlansItem(kind: option.kind, altitudeFt: $0) }
        }
        return try Engine.altitudeAdvisor(figures: figures, flownFt: flownFt, plans: plans)
    }

    /// A waypoint's own change of altitude placed on the route
    /// (`altitude_change`): from the leg's altitude into it to `toFt`,
    /// begun at the waypoint or done by it. The picked airplane's climb
    /// and burn where the planner flew one; with none, the geometry alone
    /// and no time or fuel (no airplane is assumed).
    static func change(at ident: String, toFt: Double, mode: LegAltitudeMode, legs: [Leg], airplane: AircraftProfile?) throws -> Change? {
        let key = ident.uppercased()
        guard let i = waypoints(legs: legs).firstIndex(where: { $0.ident.uppercased() == key }) else { return nil }
        let into = i > 0 ? legs[i - 1] : nil
        let out = i < legs.count ? legs[i] : nil
        guard let fromFt = into?.altitudeFt ?? out?.altitudeFt else { return nil }
        let profile = airplane.map {
            EngineContract.NavLogProfile(cruiseTasKt: $0.cruiseTasKt, fuelBurnGph: $0.fuelBurnGph, serviceCeilingFt: $0.serviceCeilingFt,
                                         cruisePowerPct: $0.cruisePowerPct, climbTasKt: $0.climbTasKt, climbFuelBurnGph: $0.climbFuelBurnGph,
                                         descentIasKt: $0.descentIasKt, descentFuelBurnGph: $0.descentFuelBurnGph,
                                         climbRateFpmSeaLevel: $0.climbRateFpmSeaLevel, taxiFuelGal: $0.taxiFuelGal, usableFuelGal: $0.usableFuelGal,
                                         supplementalOxygen: $0.supplementalOxygen, pressurized: $0.pressurized)
        }
        let leg = out ?? into
        return try Engine.altitudeChange(profile: profile, alongNm: waypoints(legs: legs)[i].alongNm, fromFt: fromFt, toFt: toFt,
                                         mode: mode.rawValue, groundspeedKt: leg?.groundspeedKt, tasKt: leg?.tasKt,
                                         fuelBurnGph: airplane == nil ? nil : leg?.fuelBurnGph ?? airplane?.fuelBurnGph, oatC: leg?.oatC,
                                         // The leg's course and wind, so a climb's ground speed is its own
                                         // wind triangle at the climb speed (FAA-H-8083-25C ch. 16), as
                                         // the web's LegAltitude asks it.
                                         trueCourseDeg: leg?.trueCourseDeg, windDirTrueDeg: leg?.wind?.windDirTrueDeg,
                                         windSpeedKt: leg?.wind?.windSpeedKt)
    }
}
