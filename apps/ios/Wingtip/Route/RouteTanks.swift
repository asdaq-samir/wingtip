import Foundation

/// The fuel in the tanks at a field of the route, as FPL's gauge shows it
/// (the web's routeTanks, the owner's "next to airport say ... fuel in
/// tanks"): what is in them, what they hold, whether it is under the
/// reserve the flight is held to, and the pilot's own figure for them
/// leaving there, where set (nil, full).
struct TankAt: Equatable, Sendable {
    let gal: Double
    let usable: Double
    let low: Bool
    let own: Int?
}

/// Where on the route a gauge stands: the departure, a stop by its place
/// in the stops, or the destination.
enum TankPoint: Hashable, Sendable {
    case departure
    case stop(Int)
    case destination
}

/// The fuel in the tanks along the route, every figure the engine's
/// (`fuel_in_tanks`): at the departure the fuel on board at engine start,
/// full unless the pilot set their own on its gauge; the start, taxi and
/// takeoff allowance and each leg's burn taken from them after; fuelled
/// again at each field landed at (full, or the pilot's own), as the
/// planner checks each flight; negative past empty, the gallons short.
/// The app only says which legs end where.
enum RouteTanks {
    /// One leg of the nav log as the walk needs it: where it ends, and its
    /// burn (nil where the planner could not work it out).
    struct LegBurn: Equatable, Sendable {
        let to: String
        let fuelGal: Double?
    }

    /// The tanks' figures the gauges are read against: the first flight's
    /// usable fuel and allowance (each later flight is fuelled again), and
    /// each flight's own reserve in order as the planner's totals give it,
    /// which the engine holds each point to -- 30 minutes by day, 45 at
    /// night (14 CFR 91.151(a)) or under IFR (91.167(a)(3)) -- with the
    /// fuel on to an IFR alternate the destination is held to as well
    /// (91.167(a)(2)), as the web's tankFigures takes them. None without an
    /// airplane's usable fuel.
    struct Figures: Equatable, Sendable {
        let usableGal: Double
        let taxiGal: Double
        let reservesGal: [Double?]
        let alternateGal: Double?

        init(usableGal: Double, taxiGal: Double, reservesGal: [Double?], alternateGal: Double? = nil) {
            self.usableGal = usableGal
            self.taxiGal = taxiGal
            self.reservesGal = reservesGal
            self.alternateGal = alternateGal
        }

        init?(_ totals: Totals?) {
            guard let totals else { return nil }
            let hops = (totals.hops ?? []).map(\.totals)
            let flights = hops.isEmpty ? [totals] : hops
            guard let usable = flights.first?.usableFuelGal, usable > 0 else { return nil }
            self.init(usableGal: usable, taxiGal: flights.first?.taxiGal ?? 0,
                      reservesGal: flights.map(\.reserveGal), alternateGal: totals.alternate?.fuelGal)
        }
    }

    /// The gauge at each field: `stops` the route's stops in order, with
    /// `refuels` whether each is a field landed at (a fix is flown over,
    /// never fuelled at). Each stop is matched to the first leg after the
    /// last one that ends at it; where a stop matches none, no gauges at
    /// all, since a walk that missed a fuelling would show wrong ones.
    /// Thrown where the engine refuses.
    static func walk(legs: [LegBurn], dep: String, stops: [String], refuels: [Bool], figures: Figures?,
                     own: [String: Int]) throws -> [TankPoint: TankAt] {
        guard let figures, !legs.isEmpty else { return [:] }
        var stopAtLeg: [Int: Int] = [:]
        var next = 0
        for (i, stop) in stops.enumerated() {
            guard let at = legs[next...].firstIndex(where: { $0.to.uppercased() == stop.uppercased() }) else { return [:] }
            stopAtLeg[at] = i
            next = at + 1
        }
        func ownAt(_ ident: String) -> Int? { own[ident.uppercased()] }
        var points = [EngineContract.FuelInTanksInputPointsItem(departure: true, fuelGal: nil, refuel: false,
                                                                fillGal: ownAt(dep).map(Double.init))]
        for (i, leg) in legs.enumerated() {
            let stop = stopAtLeg[i]
            let refuel = stop.map { refuels.indices.contains($0) && refuels[$0] } ?? false
            points.append(.init(departure: false, fuelGal: leg.fuelGal, refuel: refuel,
                                fillGal: refuel ? stop.flatMap { ownAt(stops[$0]) }.map(Double.init) : nil))
        }
        let walked = try Engine.fuelInTanks(points: points, usableGal: figures.usableGal, taxiGal: figures.taxiGal,
                                            reservesGal: figures.reservesGal, alternateGal: figures.alternateGal)
        var tanks: [TankPoint: TankAt] = [:]
        func put(_ point: TankPoint, _ index: Int, own: Int?) {
            guard walked.indices.contains(index), let at = walked[index] else { return }
            tanks[point] = TankAt(gal: at.gal, usable: figures.usableGal, low: at.low, own: own)
        }
        put(.departure, 0, own: ownAt(dep))
        for (leg, stop) in stopAtLeg {
            put(.stop(stop), leg + 1, own: refuels.indices.contains(stop) && refuels[stop] ? ownAt(stops[stop]) : nil)
        }
        put(.destination, walked.count - 1, own: nil)
        return tanks
    }

    /// The route with every flight's suggested fuel stops put in, each
    /// after its own flight's departure, and those that went in (the web's
    /// withFuelStops): every flight's, not the first's alone, a field
    /// already in the route not put in twice, and a break (the planner's
    /// rest on a long flight the tanks hold) left as the pilot's own pick.
    /// Nil where none goes in.
    static func withFuelStops(dep: String, stops: [String], suggested: [FuelStopSuggestion]) -> (stops: [String], added: [String])? {
        var route = stops
        var added: [String] = []
        for flight in suggested where flight.reason != "break" {
            let idents = flight.stops.map(\.ident).filter { ident in !same(ident, dep) && !route.contains { same($0, ident) } }
            guard !idents.isEmpty else { continue }
            // After the flight's departure: the route's start, or the stop
            // it leaves from; a departure not on the route puts them first.
            let at = same(flight.departure, dep) ? 0 : (route.firstIndex { same($0, flight.departure) }.map { $0 + 1 } ?? 0)
            route.insert(contentsOf: idents, at: at)
            added += idents
        }
        return added.isEmpty ? nil : (route, added)
    }

    /// Where a flight is short of fuel and the planner offers no stop on
    /// it, why, for the first such flight, named by its two ends (the web's
    /// NoFuelStopNote; warn, never limit): the fuel on board at the start
    /// already under its start, taxi and reserve (14 CFR 91.151(a),
    /// 91.167(a); the planner's `on_board`), or no field with fuel in the
    /// tanks' reach. Nil where every short flight has a stop.
    static func noFuelStopWords(_ flights: [NoFuelStop]) -> String? {
        guard let flight = flights.first else { return nil }
        let name = "\(flight.departure) → \(flight.destination)"
        return flight.onBoard == true ? "Too little fuel on board for \(name)" : "No fuel stop in reach on \(name)"
    }

    private static func same(_ a: String, _ b: String) -> Bool { a.uppercased() == b.uppercased() }
}

extension Plan {
    /// FPL's gauges for the route as planned now (RouteTanks.walk); none
    /// without an airplane, or before the nav log is in.
    var tanks: [TankPoint: TankAt] {
        guard airplaneChosen else { return [:] }
        let refuels = stops.indices.map { i in course?.stops?[safe: i]?.kind != "fix" }
        return (try? RouteTanks.walk(legs: legs.map { .init(to: $0.to, fuelGal: $0.fuelGal) }, dep: dep, stops: stops,
                                     refuels: refuels, figures: RouteTanks.Figures(totals), own: extras.tanks)) ?? [:]
    }

    /// The pilot's own fuel as the airplane leaves a field, set on its
    /// gauge: gallons, 0 at a stop for none bought, nil back to full. A
    /// step Undo takes back (RouteExtras is the route's), planned again.
    func setTanks(_ ident: String, gallons: Int?) {
        extras.tanks[ident.uppercased()] = gallons
        plan()
    }

    /// The stops "Add Fuel Stops" puts in, every flight's, in one step:
    /// the planner has already planned the route with its suggested stops
    /// in, each flight between two of them on its own altitude, winds and
    /// burn, and put in what those plans asked too, till none is short
    /// (wingtip.fuel_rounds, the totals' fuel_stops), so one tap is the
    /// whole answer, as the web's Add Fuel Stops makes one setStops.
    var fuelStopsToAdd: (stops: [String], added: [String])? {
        RouteTanks.withFuelStops(dep: dep, stops: stops, suggested: totals?.fuelStops ?? [])
    }

    /// Why a flight short of fuel has no stop to add, where one has none.
    var noFuelStop: String? { RouteTanks.noFuelStopWords(totals?.noFuelStop ?? []) }

    /// The fuel stops put in by Add Fuel Stops that are in the route still.
    var fuelStopsIn: [String] { extras.fuelStops.filter { stop in stops.contains { $0.uppercased() == stop } } }

    func addFuelStops() {
        guard let next = fuelStopsToAdd else { return }
        stops = next.stops
        extras.fuelStops += next.added.map { $0.uppercased() }
        plan()
    }

    /// "Remove Fuel Stops": the ones Add Fuel Stops put in taken out.
    func removeFuelStops() {
        let added = Set(extras.fuelStops)
        stops.removeAll { added.contains($0.uppercased()) }
        extras.fuelStops = []
        plan()
    }
}
