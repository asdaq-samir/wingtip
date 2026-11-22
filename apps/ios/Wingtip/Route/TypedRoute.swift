import Foundation

/// A route typed or pasted whole, as the web's Type the Route takes it
/// into the route's field (RouteEditor, the owner's 2026-11-21 ask for it
/// at Add a Stop's end): "KPWK DCT OBK V100 KLAS", a clearance's or a filed
/// flight plan's. The engine reads it as item 15 of FAA Form 7233-4 has it
/// (AIM Appendix 4, its `route_read`): DCT taken out, a speed and level
/// group the cruise's, the rest the route's points in order. The first is
/// left from, the last landed at, and those between flown through, each
/// checked by the planner as it plans (a word it knows no place by is said
/// on FPL with its Remove, PlanProblemView).
enum TypedRoute {
    struct Read: Equatable, Sendable {
        var dep: String
        var stops: [String]
        var dest: String
        /// The cruise a level group asked for, feet MSL; nil for none or VFR's.
        var cruiseFt: Double?
    }

    /// The route the words say; nil where they name fewer than two points.
    /// Thrown where the engine cannot read them.
    static func read(_ text: String) throws -> Read? {
        var points: [String] = []
        var cruiseFt: Double?
        // Word by word, as the web's route field reads them (filedWords):
        // a position's "@42.1,-88.2" kept whole, where the reader splits on
        // its comma, and a level group anywhere the cruise asked for.
        for word in text.split(whereSeparator: \.isWhitespace).map(String.init) {
            if word.contains(",") {
                points.append(word.uppercased())
                continue
            }
            let read = try Engine.routeRead(text: word)
            cruiseFt = cruiseFt ?? read.cruiseFt
            points += read.points
        }
        guard let dep = points.first, let dest = points.last, points.count >= 2 else { return nil }
        return Read(dep: dep, stops: Array(points.dropFirst().dropLast()), dest: dest, cruiseFt: cruiseFt)
    }

    /// The route as the field starts with it: its points in order, a space
    /// between, so a pilot edits the route there rather than typing it again.
    static func words(dep: String, stops: [String], dest: String) -> String {
        ([dep] + stops + [dest]).filter { !$0.isEmpty }.joined(separator: " ")
    }
}

extension Plan {
    /// The route typed whole put in place of the one there, at the cruise
    /// it asks for where it asks one (the pilot's own, as a clearance's
    /// "maintain" is), planned again. Undo takes it back ("Route replaced").
    func useTypedRoute(_ read: TypedRoute.Read) {
        dep = read.dep
        stops = read.stops
        dest = read.dest
        if let feet = read.cruiseFt {
            ownAltitudeFt = feet
            ownAltitudeLegal = false
        }
        plan()
    }
}
