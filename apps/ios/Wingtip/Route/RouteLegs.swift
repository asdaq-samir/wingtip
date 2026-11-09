import CoreLocation
import CoreGraphics
import Foundation

/// The route's legs as the map's course line is tapped by, and the Route
/// Leg sheet's figures and actions, as the web's useLegSheet has them: a
/// leg from one point of the route to the next (its ends and stops and
/// each hop's checkpoints, RouteShare.points), its distance and magnetic
/// course the nav log's leg's (the engine's navlog on the planner: the
/// true course less the FAA's variation), Active Leg on the one flown to
/// (the engine's in_flight `next`), Direct to its end where the end is a
/// stop or the destination, and Remove where it is a stop. Fly Leg,
/// ForeFlight's third action, is not here: the planner has no way to make
/// a leg the active one but flying it.
enum RouteLegs {
    /// One leg of the line.
    struct MapLeg: Equatable {
        let index: Int
        let from: String
        let to: String
        let start: CLLocationCoordinate2D
        let end: CLLocationCoordinate2D
        /// The point it goes to is a checkpoint, which the route cannot
        /// be sent direct to.
        let toCheckpoint: Bool

        static func == (a: MapLeg, b: MapLeg) -> Bool {
            a.index == b.index && a.from == b.from && a.to == b.to && a.toCheckpoint == b.toCheckpoint
                && ChartMap.samePath([a.start, a.end], [b.start, b.end])
        }
    }

    /// The sheet's contents for one leg.
    struct Sheet: Equatable {
        let from: String
        let to: String
        /// The leg's length, nm, and magnetic course, degrees; nil until
        /// the nav log's leg streams in.
        let distanceNm: Double?
        let courseMagDeg: Double?
        let active: Bool
        /// The point a Direct goes to, and whether the route is flown
        /// direct to it already; nil for a checkpoint.
        let direct: (ident: String, on: Bool)?
        /// The stop Remove takes out; nil for anything but a stop.
        let remove: String?

        static func == (a: Sheet, b: Sheet) -> Bool {
            a.from == b.from && a.to == b.to && a.distanceNm == b.distanceNm && a.courseMagDeg == b.courseMagDeg
                && a.active == b.active && a.direct?.ident == b.direct?.ident && a.direct?.on == b.direct?.on && a.remove == b.remove
        }
    }

    /// The legs, point to point, from the route's points in order.
    static func legs(_ points: [(name: String, lat: Double, lon: Double, checkpoint: Checkpoint?)]) -> [MapLeg] {
        guard points.count >= 2 else { return [] }
        return (0..<(points.count - 1)).map { i in
            let a = points[i], b = points[i + 1]
            return MapLeg(index: i, from: a.name, to: b.name,
                          start: CLLocationCoordinate2D(latitude: a.lat, longitude: a.lon),
                          end: CLLocationCoordinate2D(latitude: b.lat, longitude: b.lon),
                          toCheckpoint: b.checkpoint != nil)
        }
    }

    /// The leg nearest a tap, by the screen distance from the tap to each
    /// leg's segment; nil where none passes within `within` points (the
    /// 44-point hit area's half).
    static func nearest(to tap: CGPoint, segments: [(CGPoint, CGPoint)], within: CGFloat = 22) -> Int? {
        var best: (index: Int, distance: CGFloat)?
        for (i, segment) in segments.enumerated() {
            let d = distance(tap, segment.0, segment.1)
            if d <= within, d < (best?.distance ?? .infinity) { best = (i, d) }
        }
        return best?.index
    }

    /// A point's distance from a segment, in the plane.
    static func distance(_ p: CGPoint, _ a: CGPoint, _ b: CGPoint) -> CGFloat {
        let dx = b.x - a.x, dy = b.y - a.y
        let length = dx * dx + dy * dy
        let t = length == 0 ? 0 : max(0, min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length))
        let x = a.x + t * dx - p.x, y = a.y + t * dy - p.y
        return (x * x + y * y).squareRoot()
    }

    /// The sheet for a leg. `legs` the nav log's, taken where they are
    /// one to one with the map's; `nextIndex` the point the airplane flies
    /// to (in_flight's next.index), the leg arriving at it the active one;
    /// `stops` the route's stops and `direct` the point flown direct to.
    static func sheet(_ leg: MapLeg, mapLegs: Int, legs: [Leg], nextIndex: Int?, stops: [String], dest: String, direct: String?) -> Sheet {
        let navLeg = legs.count == mapLegs && legs.indices.contains(leg.index) ? legs[leg.index] : nil
        let ident = leg.toCheckpoint ? nil : leg.to
        let isStop = ident.map { id in stops.contains { $0.uppercased() == id.uppercased() } } ?? false
        let directable = ident.map { isStop || $0.uppercased() == dest.uppercased() } ?? false
        return Sheet(
            from: leg.from, to: leg.to,
            distanceNm: navLeg?.distanceNm, courseMagDeg: navLeg?.magneticCourseDeg,
            active: nextIndex == leg.index + 1,
            direct: directable ? (ident!, direct?.uppercased() == ident!.uppercased()) : nil,
            remove: isStop ? ident : nil)
    }

    /// A magnetic course as the sheet writes it: "045°M".
    static func courseWords(_ deg: Double?) -> String {
        guard let deg else { return Format.none }
        return Format.heading(deg) + "M"
    }
}
