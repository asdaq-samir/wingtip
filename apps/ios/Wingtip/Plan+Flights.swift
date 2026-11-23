import Foundation

/// The plan as a saved flight and back, and the detours the planner
/// offers: what changes the route whole from outside the route box.
extension Plan {
    /// A way round what stops the route put in: the points to fly by,
    /// before the stop they are for.
    func goRound(_ detour: Detour) {
        let points = (detour.via?.isEmpty == false) ? detour.via! : [detour.ident]
        stops.insert(contentsOf: points, at: min(detour.stopIndex, stops.count))
        plan()
    }

    /// The plan as the gateway saves a flight: the route, its altitude,
    /// totals and the legs' points as checkpoints, and its fuel stops, fuel
    /// on board and flight rules as its picks (SaveFlightRequest, SavedPicks).
    func saved() -> SaveFlightRequest? {
        guard routed, let course else { return nil }
        var along = 0.0
        let points = legs.enumerated().map { i, leg -> SaveFlightCheckpoint in
            along += leg.distanceNm
            let point = checkpoints.first { ($0.name ?? $0.waypoint ?? "").uppercased() == leg.to.uppercased() }
            return SaveFlightCheckpoint(alongTrackNm: along, altitudeFt: leg.altitudeFt, category: point?.category ?? "point", eteMin: leg.eteMin, fuelGal: leg.fuelGal, groundspeedKt: leg.groundspeedKt, lat: point?.lat ?? course.destination.lat, legDistanceNm: leg.distanceNm, lon: point?.lon ?? course.destination.lon, magneticHeadingDeg: leg.magneticHeadingDeg, name: leg.to, sequenceNo: i + 1, trueCourseDeg: leg.trueCourseDeg)
        }
        return SaveFlightRequest(checkpoints: points, cruiseAltitudeFt: altitudeFt.map { Int($0) }, departureIdent: dep, destinationIdent: dest, picks: SavedPicks.write(fuelStops: extras.fuelStops, stops: stops, tanks: extras.tanks, rules: .saved()), stops: stops, totalDistanceNm: totals?.distanceNm, totalEteMin: totals?.eteMin, totalFuelGal: totals?.fuelGal)
    }

    /// A saved flight back on the page: its route, its fuel stops, the fuel
    /// on board and its flight rules (SavedPicks), planned again. Its rules
    /// become the app's own, as a shared flight's do (SharedFlightModel).
    func open(_ flight: SavedFlight) {
        dep = flight.departureIdent; dest = flight.destinationIdent; stops = flight.stops
        ownAltitudeFt = nil; altitudeChoice = nil
        extras = RouteExtras()
        let picks = SavedPicks.read(flight.picks, stops: flight.stops)
        extras.fuelStops = picks.fuel
        extras.tanks = picks.tanks
        if let rules = picks.rules { UserDefaults.standard.set(rules.rawValue, forKey: FlightRules.key) }
        plan()
    }
}

extension Plan {
    /// What is on the page, kept for the air (Kept): after the nav log
    /// is whole, and as the briefing, checkpoints and side view come. And
    /// the route itself in the plan history the pilot's devices share
    /// (PlannedRoute).
    func keep() {
        guard routed, course != nil, totals != nil else { return }
        Kept(dep: dep, dest: dest, stops: stops, aircraft: aircraft, tail: tail, ownAltitudeFt: ownAltitudeFt, altitudeChoice: altitudeChoice,
             course: course, checkpoints: checkpoints, profile: profile, altitude: altitude, legs: legs, totals: totals,
             briefing: briefing, briefedAt: briefedAt, plannedAt: plannedAt ?? Date(), depart: extras.depart).save()
        PlanHistory.planned(routeState, at: plannedAt ?? Date())
    }

    /// A procedure picked for a field, in place of any of its kind there;
    /// nil takes that kind off the field. Planned again.
    func pick(_ procedure: ProcedurePick?, kind: String, at ident: String) {
        procedures.removeAll { $0.ident == ident && $0.kind == kind }
        if let procedure { procedures.append(procedure) }
        plan()
    }
}
