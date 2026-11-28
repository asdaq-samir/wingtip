import MapKit
import UIKit

/// Where the route turns (the owner's option A, 2026-11-14; the web's
/// routeMarks and routeTurns, docs/design/rules.md §10): a point the route
/// flies through and turns at -- a VFR or GPS waypoint, a present position
/// (POS0) -- is a small white dot ringed in the course's magenta exactly
/// where the legs meet, so the turn and own ship on it stay in sight, and
/// its name sits on its own white pill edged in the waypoint magenta off
/// the point on the outside of the turn, never on the line. The side turns
/// with the map. Airports keep their mark (AirportMarkView).
enum RouteTurns {
    /// The side a point's name goes, degrees clockwise from up on a
    /// north-up screen: away from the turn at the course line's vertex
    /// nearest the point -- the two legs leaving it, each a unit step,
    /// added, point into the turn -- and on a straight point or the route's
    /// first or last, square to the course on its upper side. The screen is
    /// MapKit's own Web Mercator (MKMapPoint, y down), as the map draws it.
    static func outside(of line: [CLLocationCoordinate2D], at point: CLLocationCoordinate2D) -> Double {
        guard line.count >= 2 else { return 0 }
        let points = line.map(MKMapPoint.init)
        let here = MKMapPoint(point)
        let i = points.indices.min { points[$0].distance(to: here) < points[$1].distance(to: here) } ?? 0
        let back = leg(points, from: i, by: -1), ahead = leg(points, from: i, by: 1)
        var out: (x: Double, y: Double)
        if let back, let ahead, hypot(back.x + ahead.x, back.y + ahead.y) > 0.05 {
            out = (-(back.x + ahead.x), -(back.y + ahead.y))
        } else {
            let along = ahead ?? back ?? (1, 0)
            out = (along.y, -along.x)
            if out.y > 0 || (out.y == 0 && out.x < 0) { out = (-out.x, -out.y) }
        }
        let degrees = atan2(out.x, -out.y) * 180 / .pi
        return ((degrees + 360).truncatingRemainder(dividingBy: 360)).rounded()
    }

    /// The side a top of climb's or descent's name goes: square to the
    /// course on its upper side, as the web's squareToCourse.
    static func squareToCourse(_ courseDeg: Double) -> Double {
        let left = ((Int(courseDeg.rounded()) - 90) % 360 + 360) % 360
        return Double(left > 90 && left <= 270 ? (left + 180) % 360 : left)
    }

    /// The first unit step along the line from vertex `i`, going `by`, past
    /// any vertex on the point itself.
    private static func leg(_ points: [MKMapPoint], from i: Int, by: Int) -> (x: Double, y: Double)? {
        var j = i + by
        while j >= 0, j < points.count {
            let dx = points[j].x - points[i].x, dy = points[j].y - points[i].y
            let n = hypot(dx, dy)
            if n > 1e-9 { return (dx / n, dy / n) }
            j += by
        }
        return nil
    }
}

/// A route point the course turns at, with the side its name goes.
final class RoutePointAnnotation: NSObject, MKAnnotation {
    let name: String
    let coordinate: CLLocationCoordinate2D
    /// Degrees clockwise from up on a north-up map (RouteTurns.outside).
    let out: Double
    /// A top of climb or descent (RouteLegs.LegPoint), which gives way to
    /// the route's own marks where it would cover one.
    let legPoint: Bool

    init(name: String, coordinate: CLLocationCoordinate2D, out: Double, legPoint: Bool = false) {
        self.name = name
        self.coordinate = coordinate
        self.out = out
        self.legPoint = legPoint
    }

    var title: String? { name }
}

/// The dot on the point and the name's pill beside it, turned with the map
/// so the name stays outside the turn, to the nearest of eight sides as
/// the web's turnSide.
final class RoutePointMarkView: MKAnnotationView {
    static let reuse = "route-point"
    private static let dot: CGFloat = 14
    private let ring = UIView()
    private let pill = UILabel()
    private var heading = 0.0

    override init(annotation: (any MKAnnotation)?, reuseIdentifier: String?) {
        super.init(annotation: annotation, reuseIdentifier: reuseIdentifier)
        ring.backgroundColor = WingtipColor.Chart.casing
        ring.layer.borderColor = NightPalette.course.cgColor
        ring.layer.borderWidth = 3
        ring.layer.cornerRadius = Self.dot / 2
        ring.isUserInteractionEnabled = false
        pill.font = UIFont.systemFont(ofSize: 11, weight: .semibold)
        pill.textColor = WingtipColor.Chart.fixInk
        pill.textAlignment = .center
        pill.backgroundColor = WingtipColor.Chart.casing
        pill.layer.borderColor = WingtipColor.Chart.waypoint.cgColor
        pill.layer.borderWidth = 1.5
        pill.layer.masksToBounds = true
        addSubview(pill)
        addSubview(ring)
        canShowCallout = false
        // Always drawn: the route's own points never give way.
        displayPriority = .required
        isAccessibilityElement = true
        accessibilityTraits = .staticText
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { nil }

    override var annotation: (any MKAnnotation)? {
        didSet { lay() }
    }

    /// The map turned: the name put back outside the turn on the screen.
    func turn(mapHeading: Double) {
        guard abs(mapHeading - heading) > 0.5 else { return }
        heading = mapHeading
        lay()
    }

    private func lay() {
        guard let point = annotation as? RoutePointAnnotation else { return }
        pill.text = point.name
        accessibilityLabel = point.legPoint
            ? (point.name == "TOC" ? Wording.topOfClimb : Wording.topOfDescent) : "Route point \(point.name)"
        // A top of climb or descent is kept over every field's mark but
        // gives way to the route's own (the web's leg points, under
        // ROUTE_MARKS_LOWEST); the route's points never give way.
        displayPriority = point.legPoint ? MKFeatureDisplayPriority(rawValue: 999) : .required
        collisionMode = .rectangle
        let size = pill.intrinsicContentSize
        let pillSize = CGSize(width: size.width + 12, height: 20)
        pill.layer.cornerRadius = pillSize.height / 2
        // The side on the screen, to the nearest 45 degrees.
        let side = ((point.out - heading) / 45).rounded() * 45 * .pi / 180
        let gap: CGFloat = 4
        let dx = CGFloat(sin(side)) * (Self.dot / 2 + gap + pillSize.width / 2)
        let dy = -CGFloat(cos(side)) * (Self.dot / 2 + gap + pillSize.height / 2)
        // The view's box holds the dot and the pill; the dot on the point.
        let dotFrame = CGRect(x: -Self.dot / 2, y: -Self.dot / 2, width: Self.dot, height: Self.dot)
        let pillFrame = CGRect(x: dx - pillSize.width / 2, y: dy - pillSize.height / 2, width: pillSize.width, height: pillSize.height)
        let box = dotFrame.union(pillFrame)
        frame.size = box.size
        ring.frame = dotFrame.offsetBy(dx: -box.minX, dy: -box.minY)
        pill.frame = pillFrame.offsetBy(dx: -box.minX, dy: -box.minY)
        centerOffset = CGPoint(x: box.midX, y: box.midY)
    }
}

/// The route's own marks over the chart, kept apart from the map's
/// coordinator: the chosen checkpoints, numbered in flight order and named
/// closer in (CheckpointAnnotation), and the points the course turns at
/// (RoutePointAnnotation), on the main actor as the map is.
@MainActor
final class RouteMarksLayer {
    /// The checkpoints' marks by the checkpoint's id, with the number and
    /// place each was drawn with.
    private var checkpointMarks: [String: (number: Int, checkpoint: Checkpoint, mark: CheckpointAnnotation)] = [:]
    /// Whether the checkpoints' names show at the zoom now.
    private var checkpointNames = false
    private var points: [RoutePointAnnotation] = []
    /// The tops of climb and descent, and the ones on the map now: none
    /// below map.zoom.route-tags, where over the whole country a TOD's
    /// pill sat on the fields it was between (the owner's iPhone
    /// screenshot, 2026-11-23).
    private var legPoints: [RouteLegs.LegPoint] = []
    private var legMarks: [RoutePointAnnotation] = []
    private var legZoom = 0.0

    func attach(to map: MKMapView) {
        map.register(CheckpointMarkView.self, forAnnotationViewWithReuseIdentifier: CheckpointMarkView.reuse)
        map.register(RoutePointMarkView.self, forAnnotationViewWithReuseIdentifier: RoutePointMarkView.reuse)
    }

    func view(for annotation: any MKAnnotation, on map: MKMapView) -> MKAnnotationView? {
        if annotation is CheckpointAnnotation {
            let view = map.dequeueReusableAnnotationView(withIdentifier: CheckpointMarkView.reuse, for: annotation)
            (view as? CheckpointMarkView)?.showName(checkpointNames)
            return view
        }
        guard annotation is RoutePointAnnotation else { return nil }
        let view = map.dequeueReusableAnnotationView(withIdentifier: RoutePointMarkView.reuse, for: annotation)
        (view as? RoutePointMarkView)?.turn(mapHeading: map.camera.heading)
        return view
    }

    /// The checkpoints' marks brought to `checkpoints`: a new one added, a
    /// gone one taken off, one whose number, name, place or score changed
    /// drawn again, the rest left as they are -- every change to the plan
    /// took every mark off the map and put it back before, a flicker of
    /// the whole route.
    func showCheckpoints(_ checkpoints: [Checkpoint], on map: MKMapView) {
        var wanted: [String: (number: Int, checkpoint: Checkpoint)] = [:]
        for (i, checkpoint) in checkpoints.enumerated() { wanted[checkpoint.id] = (number: i + 1, checkpoint: checkpoint) }
        for (id, drawn) in checkpointMarks where wanted[id] == nil || wanted[id]!.number != drawn.number || wanted[id]!.checkpoint != drawn.checkpoint {
            map.removeAnnotation(drawn.mark)
            checkpointMarks[id] = nil
        }
        for (id, want) in wanted where checkpointMarks[id] == nil {
            let mark = CheckpointAnnotation(number: want.number, checkpoint: want.checkpoint)
            map.addAnnotation(mark)
            checkpointMarks[id] = (number: want.number, checkpoint: want.checkpoint, mark: mark)
        }
    }

    /// The course's points that are not fields (kind "fix": a waypoint, a
    /// present position) as dots, each with its name's side, for a new
    /// course; none with no course.
    func showPoints(_ course: Course?, on map: MKMapView) {
        map.removeAnnotations(points)
        points = []
        guard let course, course.coordinates.count >= 2 else { return }
        let ends = [course.departure] + (course.stops ?? []) + [course.destination]
        points = ends.filter { $0.kind == "fix" }.map { end in
            let at = CLLocationCoordinate2D(latitude: end.lat, longitude: end.lon)
            return RoutePointAnnotation(name: end.ident, coordinate: at, out: RouteTurns.outside(of: course.coordinates, at: at))
        }
        map.addAnnotations(points)
    }

    /// The tops of climb and descent brought to `wanted`, drawn only from
    /// map.zoom.route-tags; nothing done while they are the same.
    func showLegPoints(_ wanted: [RouteLegs.LegPoint], on map: MKMapView) {
        guard wanted != legPoints else { return }
        legPoints = wanted
        placeLegPoints(on: map)
    }

    private func placeLegPoints(on map: MKMapView) {
        map.removeAnnotations(legMarks)
        legMarks = []
        guard legZoom >= WingtipMapZoom.routeTags else { return }
        legMarks = legPoints.map {
            RoutePointAnnotation(name: $0.name, coordinate: CLLocationCoordinate2D(latitude: $0.lat, longitude: $0.lon), out: $0.out, legPoint: true)
        }
        map.addAnnotations(legMarks)
    }

    /// The map moved: the checkpoints' names in with the zoom, the tops of
    /// climb and descent in from map.zoom.route-tags, and each point's
    /// name turned back outside its turn.
    func moved(_ map: MKMapView, zoom: Double) {
        let tags = zoom >= WingtipMapZoom.routeTags
        let wereTags = legZoom >= WingtipMapZoom.routeTags
        legZoom = zoom
        if tags != wereTags { placeLegPoints(on: map) }
        let names = zoom >= CheckpointAnnotation.namesFromZoom
        if names != checkpointNames {
            checkpointNames = names
            for mark in checkpointMarks.values { (map.view(for: mark.mark) as? CheckpointMarkView)?.showName(names) }
        }
        for point in points + legMarks { (map.view(for: point) as? RoutePointMarkView)?.turn(mapHeading: map.camera.heading) }
    }
}
