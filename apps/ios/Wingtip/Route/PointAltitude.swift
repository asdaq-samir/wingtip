import Foundation

/// A point's own altitude and a fix off it, as typed.
enum PointAltitude {
    /// Feet from what is typed: a waypoint's three figures in hundreds of
    /// feet (045 for 4,500), an airport's in feet. A VFR altitude, under
    /// Class A's floor at 18,000 ft MSL (14 CFR 71.33, 91.135), as the
    /// planner takes one (PlanQuery.own_altitudes).
    /// Nil for what is not an altitude; thrown where the engine refuses.
    static func feet(_ typed: String, waypoint: Bool) throws -> Int? {
        let digits = typed.filter(\.isNumber)
        guard !digits.isEmpty, digits.count <= (waypoint ? 3 : 5), let figure = Int(digits) else { return nil }
        let feet = waypoint ? figure * 100 : figure
        return try Altitudes.allowed(Double(feet)) ? feet : nil
    }

    /// A course of 000 to 360, out to 999 nm, as the planner takes a
    /// fix/radial/distance (wingtip.fixes.parse_frd): what is typed read as
    /// the engine's `frd_read` reads one, and written again as its
    /// `frd_write` writes it. Nil for what is not one; thrown where the
    /// engine refuses.
    static func frd(from: String, course: String, distance: String) throws -> String? {
        let typed = "\(from)/\(course.filter(\.isNumber))/\(distance.trimmingCharacters(in: .whitespaces))"
        guard let read = try Engine.frdRead(text: typed) else { return nil }
        return try RouteExtras.frd(read.base, courseDeg: Int(read.course), nm: read.distanceNm)
    }
}
