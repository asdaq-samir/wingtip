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
    /// figure of its own for it. Throws where the engine cannot answer,
    /// rather than reading as "on the ground".
    static func underway(_ groundspeedKt: Double?) throws -> Bool {
        try Engine.underway(speedKt: groundspeedKt)
    }

    /// Which side of true north the compass points, from the planner's
    /// signed variation, positive east (wingtip.magnetic; the nav log's
    /// MH = TH - var). West variation is added to a true course and east
    /// taken off, "east is least, west is best" (FAA Pilot's Handbook of
    /// Aeronautical Knowledge, ch. 16, Navigation: Variation).
    static func variationSide(_ deg: Double) -> (letter: String, word: String) {
        deg < 0 ? ("W", "west") : ("E", "east")
    }

    /// The great-circle miles between two points, the engine's
    /// `distance_nm` (WGS 84); thrown where it cannot say, never a guess.
    static func distanceNm(_ from: CLLocationCoordinate2D, _ to: CLLocationCoordinate2D) throws -> Double {
        try Engine.distanceNm(lat1: from.latitude, lon1: from.longitude, lat2: to.latitude, lon2: to.longitude)
    }

    /// Where the airplane is along the route, the engine's `route_position`
    /// (motion/along.rs), the very answer Android's ribbon asks: the miles
    /// along the line, to go and off it, whether it is on the route (within
    /// 3 nm, the debrief's tolerance, ACS PA.VI.A.S5), the leg it is on and
    /// how far along it, and the fuel the plan's legs have burnt by there.
    /// The engine's answer (Engine/Generated); `leg` is an index, given as
    /// a number by the contract.
    typealias Position = EngineContract.RoutePositionAnswer

    /// Where `position` is along the course line, with the legs' miles and
    /// fuel where given; nil with no line to be on, thrown where the
    /// engine refuses.
    static func position(_ position: CLLocationCoordinate2D, line: [CLLocationCoordinate2D], legs: [Leg] = []) throws -> Position? {
        try Engine.routePosition(at: .init(lat: position.latitude, lon: position.longitude),
                                 line: line.map { [$0.latitude, $0.longitude] },
                                 legs: legs.map { .init(distanceNm: $0.distanceNm, fuelGal: $0.fuelGal) })
    }

    /// The same along the route's own points, those with no place left
    /// out: the leg an index into `points`.
    static func position(_ position: CLLocationCoordinate2D, points: [CLLocationCoordinate2D?]) throws -> Position? {
        try Engine.routePosition(at: .init(lat: position.latitude, lon: position.longitude),
                                 points: points.map { p in p.map { [$0.latitude, $0.longitude] } })
    }
}
