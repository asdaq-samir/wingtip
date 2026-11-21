import Foundation

/// One point of FPL's timeline as the plan gives it (the web's
/// TimelinePoint): its place among the route's points, what it is, and
/// the minutes from the departure to it as the planner's legs add up.
struct TimelinePoint: Identifiable, Equatable, Sendable {
    enum Role: Equatable, Sendable { case departure, stop, destination }

    /// Its place among the route's points (Plan.idents).
    let index: Int
    let ident: String
    let role: Role
    /// An airport, not a waypoint typed nor the airplane's position.
    let field: Bool
    /// The airplane's position as a point ("@42.3246,-88.0741"), a Direct
    /// To's or a diversion's start.
    let position: Bool
    /// A stop Add Fuel Stops put in.
    let fuelStop: Bool
    /// Minutes from the departure to its arrival, its legs' minutes and
    /// the time on the ground at each stop before it, the planner's (0 at
    /// the departure); nil with no airplane picked or before the nav log.
    let minutes: Double?

    var id: String { "\(index):\(ident)" }

    /// Where its tank gauge is (RouteTanks).
    var tank: TankPoint {
        switch role {
        case .departure: .departure
        case .stop: .stop(index - 1)
        case .destination: .destination
        }
    }

    /// The point as its line names it: the position as My Position.
    var name: String { position ? "My Position" : ident }
}

/// FPL's timeline's points and their edits, apart from the views so each
/// is tested on its own (TimelineTests). Nothing aviation is worked out:
/// the minutes are the planner's legs put in order (StripData.points).
enum Timeline {
    /// The route's points in order: the departure, each stop and the
    /// destination, `stopKinds` the course's kind for each stop ("fix"
    /// for a waypoint), the minutes to each from the legs where they are
    /// in and an airplane is picked (`timed`).
    static func points(dep: String, stops: [String], dest: String, stopKinds: [String?], fuelStops: [String],
                       legs: [Leg], timed: Bool) -> [TimelinePoint] {
        guard !dep.isEmpty, !dest.isEmpty else { return [] }
        let idents = [dep] + stops + [dest]
        let arrivals = timed ? minutes(dep: dep, stops: stops, dest: dest, legs: legs) : Array(repeating: nil, count: idents.count)
        let fuel = Set(fuelStops.map { $0.uppercased() })
        return idents.enumerated().map { i, ident in
            let role: TimelinePoint.Role = i == 0 ? .departure : i == idents.count - 1 ? .destination : .stop
            let position = ident.hasPrefix("@")
            let waypoint = role == .stop && stopKinds[safe: i - 1].flatMap { $0 } == "fix"
            return TimelinePoint(index: i, ident: ident, role: role, field: !position && !waypoint, position: position,
                                 fuelStop: role == .stop && fuel.contains(ident.uppercased()), minutes: arrivals[safe: i].flatMap { $0 })
        }
    }

    /// The minutes to each point from the strip's own walk of the legs
    /// (StripData.points: each leg's minutes, a stop's time on the ground
    /// after it), each stop matched to the first leg's end after the last
    /// one's that is it; nil for a point no leg ends at, and for all of
    /// them before the nav log is in.
    static func minutes(dep: String, stops: [String], dest: String, legs: [Leg]) -> [Double?] {
        var out: [Double?] = Array(repeating: nil, count: stops.count + 2)
        guard !legs.isEmpty else { return out }
        let walked = StripData.points(dep: dep, dest: dest, stops: stops, legs: legs, checkpoints: [], course: nil)
        out[0] = 0
        var next = 1
        for (i, stop) in stops.enumerated() {
            guard let at = walked[next...].firstIndex(where: { $0.kind != .checkpoint && $0.name == stop.uppercased() }) else { continue }
            out[i + 1] = walked[at].minutesFlown
            next = at + 1
        }
        out[out.count - 1] = walked.last?.minutesFlown
        return out
    }

    /// The stops among `offsets`, offsets into the timeline's points: the
    /// ends are never removed or moved from the list (they are changed).
    static func stopOffsets(_ offsets: IndexSet, stops: Int) -> IndexSet {
        IndexSet(offsets.compactMap { $0 >= 1 && $0 <= stops ? $0 - 1 : nil })
    }

    /// Where a stop dropped at the timeline's `to` goes among the stops:
    /// never before the departure nor after the destination.
    static func stopDestination(_ to: Int, stops: Int) -> Int { min(max(to - 1, 0), stops) }
}

extension Plan {
    /// FPL's timeline's points for the route as it is now.
    var timelinePoints: [TimelinePoint] {
        let kinds = stops.indices.map { course?.stops?[safe: $0]?.kind }
        return Timeline.points(dep: dep, stops: stops, dest: dest, stopKinds: kinds, fuelStops: extras.fuelStops,
                               legs: legs, timed: airplaneChosen)
    }

    /// Whether the course on the page is this route's: its ends the
    /// route's, so the route is read on its timeline, not its fields.
    var courseIsRoute: Bool {
        guard let course else { return false }
        return course.departure.ident.uppercased() == dep.uppercased() && course.destination.ident.uppercased() == dest.uppercased()
    }

    /// The fields whose cards the timeline asks for: airports alone, once
    /// the course says which stops are waypoints.
    var timelineFields: [String] {
        guard courseIsRoute else { return [] }
        return timelinePoints.filter(\.field).map(\.ident)
    }

    /// Stops swiped off the timeline: taken out, planned again.
    func removeTimeline(at offsets: IndexSet) {
        let gone = Timeline.stopOffsets(offsets, stops: stops.count)
        guard !gone.isEmpty else { return }
        stops.remove(atOffsets: gone)
        plan()
    }

    /// Stops dragged into another order on the timeline: planned again.
    func moveTimeline(from offsets: IndexSet, to: Int) {
        let source = Timeline.stopOffsets(offsets, stops: stops.count)
        guard !source.isEmpty else { return }
        stops.move(fromOffsets: source, toOffset: Timeline.stopDestination(to, stops: stops.count))
        plan()
    }
}

/// A field's runways as FPL's line offers them to leave from and land on.
enum TimelineRunways {
    /// The ends of the field's open runways, by their numbers as the
    /// sectional prints them ("24"), in the card's order.
    static func ends(_ place: AirportPlace?) -> [String] {
        (place?.runways ?? []).filter { !$0.closed }.flatMap { $0.runwayEnds ?? [] }.map { AirportWords.runwayNumber($0.ident) }
    }

    /// The procedure kinds landed by and left by, in the order flown.
    static let arriving = ["arrival", "approach"]
    static let leaving = ["departure"]
}

extension Plan {
    /// A runway picked to leave a field from or land on, or (nil) the one
    /// into the wind again: planned again, Undo taking it back.
    func setRunway(_ end: String?, at ident: String, takeoff: Bool) {
        let key = ident.uppercased()
        if takeoff { extras.takeoffs[key] = end } else { extras.landings[key] = end }
        plan()
    }

    /// The procedures picked at a field of `kinds`, in the kinds' order.
    func picks(at ident: String, kinds: [String]) -> [ProcedurePick] {
        kinds.flatMap { kind in procedures.filter { $0.ident.uppercased() == ident.uppercased() && $0.kind == kind } }
    }
}
