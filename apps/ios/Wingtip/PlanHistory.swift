import Foundation

/// The route as the pilot set it, without what the planner said of it:
/// the points, the picks at its fields, its own edits and its altitude.
/// What an Undo puts back, as the web app's lib/planHistory keeps the
/// same keys of its address.
struct RouteState: Equatable, Sendable {
    var dep = ""
    var dest = ""
    var stops: [String] = []
    var procedures: [ProcedurePick] = []
    var extras = RouteExtras()
    var ownAltitudeFt: Double?
    var ownAltitudeLegal = false
    var altitudeChoice: String?

    var hasPoints: Bool { !dep.isEmpty || !dest.isEmpty || !stops.isEmpty }
}

/// Undo and redo for the route: the owner's rule is to make the pilot
/// aware and never stop them, so a Direct to, a route replaced, a stop
/// removed or the route cleared goes through at once and can be taken
/// back, with no question asked first. The steps themselves are the
/// window's UndoManager's (Plan.remember registers each with the route
/// as it was); this keeps their limit and their words, the web app's
/// (lib/planHistory).
enum PlanHistory {
    /// As many steps back as a pilot would take; the oldest go first.
    static let limit = 50

    /// What a change took away, the Undo's name ("Route cleared", "KMSN
    /// removed"); nil for one that only added or changed a figure, which
    /// shake and the Edit menu still undo.
    static func note(from before: RouteState, to after: RouteState) -> String? {
        if before.hasPoints && !after.hasPoints { return "Route cleared" }
        if let direct = after.extras.direct, direct != before.extras.direct { return "Direct to \(direct)" }
        if !before.dep.isEmpty, !before.dest.isEmpty, after.dep != before.dep || after.dest != before.dest { return "Route replaced" }
        let gone = before.stops.filter { !after.stops.contains($0) }
        if gone.count == 1 { return "\(gone[0]) removed" }
        if gone.count > 1 { return "Stops removed" }
        if after.procedures.count < before.procedures.count { return "Procedure removed" }
        if after.extras.holds.count < before.extras.holds.count { return "Hold removed" }
        return nil
    }
}

extension Plan {
    /// The route as the pilot has set it now.
    var routeState: RouteState {
        RouteState(dep: dep, dest: dest, stops: stops, procedures: procedures, extras: extras,
                   ownAltitudeFt: ownAltitudeFt, ownAltitudeLegal: ownAltitudeLegal, altitudeChoice: altitudeChoice)
    }
}
