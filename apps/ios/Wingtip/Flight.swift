import CoreLocation
import Foundation

/// The small figures of a flight the screens share: whether the airplane
/// is at flying speed (the engine's), which side of north the compass
/// points, and the miles and bearing between two points for a list's
/// sorting. Own ship's place on its route for the instruments and the
/// strips -- the next waypoint, off the line, the fuel burnt -- is the
/// engine's `in_flight` (InFlight); `route_position` (Position below) is
/// the same projection for a position the ribbon and the Live Activity
/// are given.
enum Flight {
    /// Whether a groundspeed is flying speed, by the engine's rule
    /// (motion/glide.rs underway, AIRBORNE_KT 40 kt, the debrief's
    /// airborne line), the web's and OwnTrail's same: the app keeps no
    /// figure of its own for it.
    static func underway(_ groundspeedKt: Double?) -> Bool {
        (try? Engine.call("underway", json: ["speed_kt": groundspeedKt])) ?? false
    }

    /// Which side of true north the compass points, from the planner's
    /// signed variation, positive east (wingtip.magnetic; the nav log's
    /// MH = TH - var). West variation is added to a true course and east
    /// taken off, "east is least, west is best" (FAA Pilot's Handbook of
    /// Aeronautical Knowledge, ch. 16, Navigation: Variation).
    static func variationSide(_ deg: Double) -> (letter: String, word: String) {
        deg < 0 ? ("W", "west") : ("E", "east")
    }

    /// Where the airplane is along the route, the engine's `route_position`
    /// (motion/along.rs), the very answer Android's ribbon asks: the miles
    /// along the line, to go and off it, whether it is on the route (within
    /// 3 nm, the debrief's tolerance, ACS PA.VI.A.S5), the leg it is on and
    /// how far along it, and the fuel the plan's legs have burnt by there.
    struct Position: Equatable, Sendable, Decodable {
        let alongNm: Double
        let totalNm: Double
        let leftNm: Double
        let offNm: Double
        let onRoute: Bool
        let leg: Int
        let legFraction: Double
        let burntGal: Double
    }

    /// Where `position` is along the course line, with the legs' miles and
    /// fuel where given; nil with no line to be on.
    static func position(_ position: CLLocationCoordinate2D, line: [CLLocationCoordinate2D], legs: [Leg] = []) -> Position? {
        try? Engine.call("route_position", json: [
            "at": ["lat": position.latitude, "lon": position.longitude],
            "line": line.map { [$0.latitude, $0.longitude] },
            "legs": legs.map { ["distance_nm": $0.distanceNm, "fuel_gal": $0.fuelGal] },
        ], decoder: Planner.snakeCase)
    }

    /// The same along the route's own points, those with no place left
    /// out: the leg an index into `points`.
    static func position(_ position: CLLocationCoordinate2D, points: [CLLocationCoordinate2D?]) -> Position? {
        try? Engine.call("route_position", json: [
            "at": ["lat": position.latitude, "lon": position.longitude],
            "points": points.map { p in p.map { [$0.latitude, $0.longitude] } as Any? },
        ], decoder: Planner.snakeCase)
    }

    static func nm(from a: CLLocationCoordinate2D, to b: CLLocationCoordinate2D) -> Double {
        CLLocation(latitude: a.latitude, longitude: a.longitude).distance(from: CLLocation(latitude: b.latitude, longitude: b.longitude)) / 1852
    }

    /// The true bearing from one point to the other, the great circle's
    /// initial course.
    static func bearing(from a: CLLocationCoordinate2D, to b: CLLocationCoordinate2D) -> Double {
        let lat1 = a.latitude * .pi / 180, lat2 = b.latitude * .pi / 180, dLon = (b.longitude - a.longitude) * .pi / 180
        let y = sin(dLon) * cos(lat2), x = cos(lat1) * sin(lat2) - sin(lat1) * cos(lat2) * cos(dLon)
        return (atan2(y, x) * 180 / .pi + 360).truncatingRemainder(dividingBy: 360)
    }
}
