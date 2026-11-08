import CoreLocation
import Foundation

/// The small figures of a flight the screens share: whether the airplane
/// is at flying speed (the engine's), which side of north the compass
/// points, and the miles and bearing between two points for a list's
/// sorting. Where the airplane is on its route -- along the line, off it,
/// the next waypoint, the fuel burnt -- is the engine's `in_flight`
/// (InFlight), no longer worked out here.
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
