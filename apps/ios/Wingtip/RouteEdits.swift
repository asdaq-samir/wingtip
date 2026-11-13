import CoreLocation
import Foundation

/// A hold the pilot put on a point of the route, as Garmin's and
/// ForeFlight's pilot-defined holds are, written as the planner reads it
/// (wingtip.holds, the web app's lib/routeHolds): the point, its inbound course
/// (magnetic), R or L, its legs by minutes ("1M") or nm ("4N"), and how
/// long, turns ("2T") or minutes ("10M"): "VPBNG/090/30:270:R:1M:2T". The
/// engine reads and writes it (crate::route::holds); the planner works
/// out the entry and adds its time and fuel.
struct Hold: Codable, Hashable, Sendable, Identifiable {
    var fix: String
    /// The inbound course to the fix, magnetic degrees, 0 to 359.
    var inbound: Int
    var right: Bool
    /// Its legs: timed, or by distance; one of the two.
    var legMin: Double?
    var legNm: Double?
    /// How long it is held: turns round it, or minutes; one of the two.
    var turns: Int?
    var minutes: Int?

    var id: String { fix }

    /// The legs' minutes where none is picked: a minute at or below
    /// 14,000 ft MSL, a minute and a half above (AIM 5-3-8 j.4(a)), the
    /// engine's `holding_leg_minutes`; thrown where it cannot answer.
    static func legMinutes(altitudeFt: Double) throws -> Double {
        try Engine.holdingLegMinutes(altitudeFt: altitudeFt)
    }

    private static func figure(_ value: Double) -> String { String(format: "%g", value) }

    /// As the planner reads it, the course in three figures, 000 for north
    /// (the engine's `hold_write`): legs of 4 nm and 10 minutes held where
    /// neither is set, as the pages open on. Thrown where the engine
    /// cannot write it, so no route is planned with the hold left out.
    func text() throws -> String {
        let legMin = self.legMin
        let legNm = legMin != nil ? nil : (self.legNm ?? 4)
        let minutes = turns != nil ? nil : (self.minutes ?? 10)
        return try Engine.holdWrite(hold: .init(fix: fix, inbound: Double(((inbound % 360) + 360) % 360), right: right, legMin: legMin,
                                                legNm: legNm, turns: turns.map(Double.init), minutes: minutes.map(Double.init)))
    }

    /// "Right turns · 270° inbound · 1 min legs · 2 turns", north as 360°.
    var words: String {
        let course = inbound % 360 == 0 ? 360 : inbound % 360
        let leg = legMin.map { "\(Self.figure($0)) min legs" } ?? "\(Self.figure(legNm ?? 4)) nm legs"
        let length = turns.map { "\($0) \($0 == 1 ? "turn" : "turns")" } ?? "\(minutes ?? 10) min"
        return "\(right ? "Right" : "Left") turns · \(Format.heading(Double(course))) inbound · \(leg) · \(length)"
    }

    /// One read back from its text, or nil for one that is not, as the
    /// planner reads it (the engine's `hold_read`; wingtip.holds, the web
    /// app's lib/routeHolds, apps/web/src/lib/fixtures/holds.json); thrown
    /// where the engine cannot answer.
    static func parse(_ text: String) throws -> Hold? {
        try Engine.holdRead(text: text).map(Hold.init)
    }

    init(fix: String, inbound: Int, right: Bool, legMin: Double?, legNm: Double?, turns: Int?, minutes: Int?) {
        self.fix = fix; self.inbound = inbound; self.right = right
        self.legMin = legMin; self.legNm = legNm; self.turns = turns; self.minutes = minutes
    }

    /// The engine's reading of one (EngineContract.RouteHold), as the app keeps it.
    init(_ read: EngineContract.RouteHold) {
        self.init(fix: read.fix, inbound: read.inbound, right: read.right, legMin: read.legMin, legNm: read.legNm,
                  turns: read.turns, minutes: read.minutes)
    }
}

/// The route before a Direct to, for its Cancel.
struct RouteWas: Codable, Equatable, Sendable {
    var dep: String
    var stops: [String]
    var dest: String
}

/// What the pilot set on the route beyond its points, as the web app keeps
/// it in its address (PlanWorkspace) and the planner reads it (PlanQuery):
/// points' own altitudes, holds, the altitudes to cross procedures' fixes
/// at, a fix of a procedure flown direct, and a Direct to with the route
/// as it was.
struct RouteExtras: Equatable, Sendable {
    /// Feet MSL by point: a waypoint's is flown to it, an airport's is
    /// what a flight landing there comes down to.
    var altitudes: [String: Int] = [:]
    /// The points whose altitude change begins there (Start At); the rest
    /// are done by the point (Cross At), as a waypoint's altitude always was.
    var starts: Set<String> = []
    var holds: [Hold] = []
    /// Feet MSL ATC gave to cross a procedure's fix at.
    var crossings: [String: Int] = [:]
    /// A procedure's fix flown direct to, by "FIELD:PROCEDURE".
    var procedureDirect: [String: String] = [:]
    /// The point flown direct to now, and the route before it.
    var direct: String?
    var was: RouteWas?
    /// The IFR alternate filed (14 CFR 91.169), its ident: sent under IFR,
    /// where the planner adds the leg on to it and its fuel (91.167(a)(2),
    /// the engine's navlog_alternate_leg) to the totals, as the web's
    /// `alternate` does.
    var alternate: String?

    /// The alternate as the planner takes it: only under IFR, VFR having
    /// none to file.
    func filedAlternate(rules: FlightRules) -> String? {
        guard rules == .ifr, let alternate = self.alternate, !alternate.isEmpty else { return nil }
        return alternate
    }

    /// "IDENT:FEET" pairs, as the planner reads `altitudes` and `crossings`.
    static func pairs(_ feet: [String: Int]) -> String? {
        feet.isEmpty ? nil : feet.sorted { $0.key < $1.key }.map { "\($0.key):\($0.value)" }.joined(separator: ",")
    }

    /// The nav log's query for them, only the ones set: the procedures
    /// written again only where one is flown direct, "KELD:I22::BXCMB"
    /// (PlanQuery.procedures: the fix after a fourth colon). Thrown where
    /// the engine cannot write a hold or a procedure.
    func apply(to query: inout NavLogQuery, procedures: [ProcedurePick], rules: FlightRules = .saved()) throws {
        if let altitudes = Self.pairs(altitudes) { query.altitudes = altitudes }
        if let crossings = Self.pairs(crossings) { query.crossings = crossings }
        let started = starts.filter { altitudes[$0] != nil }.sorted()
        if !started.isEmpty { query.altitudeStarts = started.joined(separator: ",") }
        if !holds.isEmpty { query.holds = try holds.map { try $0.text() }.joined(separator: ",") }
        if !procedureDirect.isEmpty, !procedures.isEmpty {
            query.procedures = try ProcedurePick.text(procedures, direct: procedureDirect)
        }
        if let alternate = filedAlternate(rules: rules) { query.alternate = alternate }
    }

    /// Where the airplane is, as a route's point (the web app's
    /// positionIdent): "@42.3246,-88.0741", with its altitude to the
    /// hundred feet where it has one, "@42.3246,-88.0741,4500".
    static func position(_ fix: OwnShip.Fix) -> String {
        let at = String(format: "@%.4f,%.4f", fix.coordinate.latitude, fix.coordinate.longitude)
        guard let feet = fix.altitudeFt, feet >= 0 else { return at }
        return "\(at),\(Int((feet / 100).rounded()) * 100)"
    }

    /// A point off a fix, as a flight plan writes a fix/radial/distance
    /// (FAA Form 7233-4, item 10; AIM 5-1-8) and the planner reads it
    /// (wingtip.fixes.frd_ident): "VPBNG/090/30", the engine's `frd_write` --
    /// the course to the degree, 000 for north, the distance to a tenth of
    /// a mile.
    static func frd(_ base: String, courseDeg: Int, nm: Double) throws -> String {
        try Engine.frdWrite(base: base, course: Double(courseDeg), distanceNm: nm)
    }

    /// Where a point goes into the route so it bends it least: after the
    /// point whose leg it adds the fewest miles to (the web app's
    /// bestStopIndex), as an index into the stops. The miles are the
    /// engine's (`distance_nm`); thrown where it cannot say them.
    static func bestStopIndex(_ points: [CLLocationCoordinate2D], at: CLLocationCoordinate2D) throws -> Int {
        func nm(_ a: CLLocationCoordinate2D, _ b: CLLocationCoordinate2D) throws -> Double {
            try Engine.distanceNm(lat1: a.latitude, lon1: a.longitude, lat2: b.latitude, lon2: b.longitude)
        }
        var best = 0, added = Double.infinity
        for i in 0..<max(0, points.count - 1) {
            let more = try nm(points[i], at) + nm(at, points[i + 1]) - nm(points[i], points[i + 1])
            if more < added { best = i; added = more }
        }
        return best
    }

    /// The route flown direct to a point of it, as ATC sends an airplane:
    /// from where the airplane is, else from the departure, on from the
    /// point as planned; nil for a point not on the route after the start.
    static func directed(_ was: RouteWas, to ident: String, from position: String?) -> RouteWas? {
        let at = was.stops.firstIndex { $0.uppercased() == ident.uppercased() }
        guard at != nil || was.dest.uppercased() == ident.uppercased() else { return nil }
        return RouteWas(dep: position ?? was.dep, stops: at.map { Array(was.stops[$0...]) } ?? [], dest: was.dest)
    }
}

extension Plan {
    private var current: RouteWas { RouteWas(dep: dep, stops: stops, dest: dest) }

    /// The route flown direct to one of its points from where the airplane
    /// is (the dry run's airplane while it flies); one at a time, a
    /// procedure's own direct given back. The route as it was kept for
    /// Cancel.
    func directTo(_ ident: String, from fix: OwnShip.Fix?) {
        let was = extras.was ?? current
        guard let route = RouteExtras.directed(was, to: ident, from: fix.map(RouteExtras.position)) else { return }
        let before = routeState
        dep = route.dep; stops = route.stops; dest = route.dest
        extras.was = was
        extras.direct = ident
        extras.procedureDirect = [:]
        Feel.tap(.directTo)
        planDirect(before)
    }

    /// A Direct to planned, the route before it held until the nav log is
    /// whole: with no connection it is put back and said so (Plan's
    /// undoDirect), as the phone can't give the new route's legs alone.
    private func planDirect(_ before: RouteState) {
        plan()
        directFrom = before
    }

    /// The Direct to taken back: the route as it was.
    func cancelDirect() {
        guard let was = extras.was else { return }
        dep = was.dep; stops = was.stops; dest = was.dest
        extras.was = nil
        extras.direct = nil
        plan()
    }

    /// A diversion to a field from where the airplane is, planned by the
    /// planner as any route is (its heading, time and fuel), the route as
    /// it was kept for Cancel.
    func divert(to ident: String, from fix: OwnShip.Fix) {
        let was = extras.was ?? current
        let before = routeState
        dep = RouteExtras.position(fix); stops = []; dest = ident
        extras.was = was
        extras.direct = ident
        extras.procedureDirect = [:]
        Feel.tap(.directTo)
        planDirect(before)
    }

    /// A hold set at a point, changed, or (nil) taken off: one a point.
    func setHold(at fix: String, _ hold: Hold?) {
        extras.holds.removeAll { $0.fix.uppercased() == fix.uppercased() }
        if let hold { extras.holds.append(hold) }
        plan()
    }

    func hold(at fix: String) -> Hold? { extras.holds.first { $0.fix.uppercased() == fix.uppercased() } }

    /// A point's own altitude, or (nil) the plan's again, its climb or
    /// descent begun at the point (Start At) or done by it (Cross At).
    func setAltitude(at ident: String, feet: Int?, mode: LegAltitudeMode = .crossAt) {
        let key = ident.uppercased()
        extras.altitudes[key] = feet
        if feet != nil, mode == .startAt { extras.starts.insert(key) } else { extras.starts.remove(key) }
        plan()
    }

    /// The IFR alternate filed, or (nil) taken off: planned again, so the
    /// nav log's totals carry the fuel on to it. Undo puts it back.
    func setAlternate(_ ident: String?) {
        extras.alternate = ident?.uppercased()
        plan()
    }

    /// The altitude to cross a procedure's fix at, or (nil) the chart's.
    func setCrossing(at fix: String, feet: Int?) {
        extras.crossings[fix.uppercased()] = feet
        plan()
    }

    /// A procedure's fix flown direct to, or (nil) the procedure as charted.
    func setProcedureDirect(_ pick: ProcedurePick, fix: String?) {
        if fix != nil {
            // One direct at a time: a Direct to a point of the route given back.
            if let was = extras.was { dep = was.dep; stops = was.stops; dest = was.dest }
            extras.was = nil
            extras.direct = nil
            extras.procedureDirect = [:]
        }
        extras.procedureDirect["\(pick.ident):\(pick.id)"] = fix
        plan()
    }

    /// The pilot's own point off one of the route's, flown over next: after
    /// a stop, first after the departure, last before the destination.
    func insertFix(_ ident: String, after point: String) {
        if let at = stops.firstIndex(where: { $0.uppercased() == point.uppercased() }) {
            stops.insert(ident, at: at + 1)
        } else if point.uppercased() == dep.uppercased() {
            stops.insert(ident, at: 0)
        } else {
            stops.append(ident)
        }
        plan()
    }

    /// What is done with a point dropped on the map.
    enum Drop { case add, direct, hold }

    /// A point dropped on the map into the route where it bends it least,
    /// and flown to direct, or held at (the web app's dropIntoRoute).
    func drop(_ ident: String, at point: CLLocationCoordinate2D, then: Drop, from fix: OwnShip.Fix?) {
        guard let course else { return }
        let ends = [course.departure] + (course.stops ?? []) + [course.destination]
        // Where the engine cannot say the miles, the point goes in last,
        // before the destination, still in the route for the pilot to move.
        let best: Int
        do {
            best = try RouteExtras.bestStopIndex(ends.map { CLLocationCoordinate2D(latitude: $0.lat, longitude: $0.lon) }, at: point)
        } catch {
            Log.engine.error("distance_nm: \(error.localizedDescription, privacy: .public)")
            best = stops.count
        }
        let index = min(stops.count, best)
        let before = routeState
        if then == .direct {
            let was = extras.was ?? current
            if let fix { dep = RouteExtras.position(fix) }
            stops = [ident] + stops[index...]
            extras.was = was
            extras.direct = ident
            extras.procedureDirect = [:]
            Feel.tap(.directTo)
            planDirect(before)
        } else {
            stops.insert(ident, at: index)
            plan()
        }
    }
}
