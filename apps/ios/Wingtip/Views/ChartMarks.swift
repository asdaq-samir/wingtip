import MapKit
import UIKit

/// The special-use areas and the fixes over the chart, as the web and
/// Android draw them from the overlay tiles' `special_use` and `fixes`
/// layers (glStyle specialUseLayers, MapStyle.kt): each area's boundary a
/// solid line with a hatched band of short ticks along its inside,
/// prohibited, restricted, warning and danger areas orange-brown and MOAs
/// and alert areas magenta, a restricted area over a MOA it lies in
/// (ForeFlight's inks, the owner's of 2026-11-08); each Enroute Low fix a
/// four-point star in the airspace blue with its ident beside it. From the
/// phone's cycle packs through the engine (wt_special_use_in_view,
/// wt_fixes_in_view), with no network: the overlay tiles' PMTiles would
/// need a vector tile decoder MapKit does not have, and a planner answer
/// would not draw in the air with no signal. The VFR waypoints are
/// MapExtras' own. Nothing here works out a rule: it draws what it is given.
@MainActor
final class ChartMarks {
    /// A special-use area as the engine answers it, its rings [lat, lon]
    /// with the area on their left.
    struct Area: Decodable, Equatable {
        let type: String
        let name: String
        let floorFt: Double?
        let ceilingFt: Double?
        let rings: [[[Double]]]
        let label: [Double]
        /// ForeFlight's tab on its boundary (SpecialUseTab); nil from an
        /// older engine or a pack with no codes, or limits with no figure.
        var tab: Tab?

        /// The tab as the engine writes and places it (crate::sua_tab):
        /// its words as the map draws them, its point [lat, lon] on the
        /// line, its clockwise turn, and the side of the text the area is
        /// on (1 below, -1 above).
        struct Tab: Decodable, Equatable {
            let text: String
            let at: [Double]
            let angle: Double
            let side: Double
        }

        /// Inked as a restricted area rather than a MOA (wingtip.sua TYPES).
        var restricted: Bool { ["P", "R", "W", "D"].contains(type) }
    }

    /// A fix as the engine answers it: the Enroute Low chart's (a star) or
    /// a charted VFR waypoint.
    struct Fix: Decodable, Equatable {
        let ident: String
        let lat: Double
        let lon: Double
        let vfr: Bool
    }

    /// From which Leaflet zoom each is drawn: the areas from 7 (Android's
    /// SUA_FROM), the fixes from 10 (the web's FIX_ZOOM).
    static let areasFrom = 7.0
    static let fixesFrom = 10.0

    private var areaFetch = ViewFetch()
    private var fixFetch = ViewFetch()
    private var lines: [String: [SpecialUseLine]] = [:]
    private var fixes: [String: FixAnnotation] = [:]
    /// The areas drawn, and their tabs shown, by the same key.
    private var areas: [String: Area] = [:]
    private var tabs: [String: SpecialUseTabAnnotation] = [:]

    func attach(to map: MKMapView) {
        map.register(FixMarkView.self, forAnnotationViewWithReuseIdentifier: FixMarkView.reuse)
        map.register(SpecialUseTabView.self, forAnnotationViewWithReuseIdentifier: SpecialUseTabView.reuse)
    }

    func renderer(for overlay: any MKOverlay) -> MKOverlayRenderer? {
        (overlay as? SpecialUseLine).map(SpecialUseRenderer.init(line:))
    }

    func view(for annotation: any MKAnnotation, on map: MKMapView) -> MKAnnotationView? {
        if annotation is SpecialUseTabAnnotation { return map.dequeueReusableAnnotationView(withIdentifier: SpecialUseTabView.reuse, for: annotation) }
        return annotation is FixAnnotation ? map.dequeueReusableAnnotationView(withIdentifier: FixMarkView.reuse, for: annotation) : nil
    }

    /// The view moved: each kind off below its zoom, else asked of the
    /// packs where the view wants a new answer.
    func moved(_ map: MKMapView, view: ViewBox, zoom: Double) {
        let wide = view.widened
        if zoom < Self.areasFrom {
            take([], map: map)
            areaFetch.forget()
        } else if areaFetch.wants(view, zoom: zoom),
                  let areas = CyclePacks.shared.specialUseInView(south: wide.south, west: wide.west, north: wide.north, east: wide.east) {
            _ = areaFetch.ask(view, zoom: zoom)
            take(areas, map: map)
        }
        showTabs(zoom >= SpecialUseTab.from, heading: map.camera.heading, map: map)
        if zoom < Self.fixesFrom {
            takeFixes([], map: map)
            fixFetch.forget()
        } else if fixFetch.wants(view, zoom: zoom),
                  let found = CyclePacks.shared.fixesInView(south: wide.south, west: wide.west, north: wide.north, east: wide.east) {
            _ = fixFetch.ask(view, zoom: zoom)
            takeFixes(found.filter { !$0.vfr }, map: map)
        }
    }

    private func take(_ areas: [Area], map: MKMapView) {
        let fresh = Dictionary(areas.map { ("\($0.type)|\($0.name)", $0) }, uniquingKeysWith: { a, _ in a })
        for key in lines.keys where fresh[key] == nil { map.removeOverlays(lines.removeValue(forKey: key) ?? []) }
        self.areas = fresh
        // MOAs first, so a restricted area's line is drawn over them.
        for area in areas where lines["\(area.type)|\(area.name)"] == nil {
            let made = area.rings.compactMap { SpecialUseLine.of($0, restricted: area.restricted) }
            lines["\(area.type)|\(area.name)"] = made
            map.addOverlays(made, level: .aboveLabels)
        }
    }

    /// The areas' tabs on (from SpecialUseTab.from) or off, a gone area's
    /// taken off, and turned again where the map has turned.
    private func showTabs(_ on: Bool, heading: Double, map: MKMapView) {
        let wanted = on ? areas : [:]
        for key in tabs.keys where wanted[key] == nil || wanted[key] != tabs[key]?.area {
            if let tab = tabs.removeValue(forKey: key) { map.removeAnnotation(tab) }
        }
        for (key, area) in wanted where tabs[key] == nil {
            guard let tab = SpecialUseTabAnnotation(area) else { continue }
            tabs[key] = tab
            map.addAnnotation(tab)
        }
        guard abs(heading - SpecialUseTabView.heading) > 0.5 else { return }
        SpecialUseTabView.heading = heading
        for tab in tabs.values { (map.view(for: tab) as? SpecialUseTabView)?.turn() }
    }

    private func takeFixes(_ found: [Fix], map: MKMapView) {
        let fresh = Dictionary(found.map { ($0.ident, $0) }, uniquingKeysWith: { a, _ in a })
        let gone = fixes.filter { fresh[$0.key] == nil }
        map.removeAnnotations(Array(gone.values))
        for key in gone.keys { fixes[key] = nil }
        for (ident, fix) in fresh where fixes[ident] == nil {
            let mark = FixAnnotation(fix)
            fixes[ident] = mark
            map.addAnnotation(mark)
        }
    }
}

/// A ring of a special-use area, the area on its left.
final class SpecialUseLine: MKPolyline {
    private(set) var restricted = false

    static func of(_ ring: [[Double]], restricted: Bool) -> SpecialUseLine? {
        let points = ring.compactMap { $0.count == 2 ? CLLocationCoordinate2D(latitude: $0[0], longitude: $0[1]) : nil }
        guard points.count >= 3 else { return nil }
        let line = SpecialUseLine(coordinates: points, count: points.count)
        line.restricted = restricted
        return line
    }

    var ink: UIColor { restricted ? WingtipColor.Chart.specialUse : WingtipColor.Chart.airspaceMagenta }
}

/// The boundary: a solid line, and inside it a band of short ticks
/// across the line (the web's "sua|hatch" pattern), on the area's side.
final class SpecialUseRenderer: MKPolylineRenderer {
    /// The band's width and the ticks' spacing, in points on the screen.
    static let band: CGFloat = 6
    static let tickEvery: CGFloat = 5

    private let ink: UIColor

    init(line: SpecialUseLine) {
        ink = line.ink
        super.init(polyline: line)
        strokeColor = ink
        lineWidth = 2
        lineJoin = .round
    }

    /// The side the area is on, as a unit vector in map points (x east, y
    /// south), for a segment running (dx, dy): the left in lon/lat, where
    /// north is up, is (dy, -dx) once y runs south.
    nonisolated static func inside(dx: Double, dy: Double) -> (x: Double, y: Double) {
        let length = (dx * dx + dy * dy).squareRoot()
        guard length > 0 else { return (0, 0) }
        return (dy / length, -dx / length)
    }

    override func draw(_ mapRect: MKMapRect, zoomScale: MKZoomScale, in context: CGContext) {
        super.draw(mapRect, zoomScale: zoomScale, in: context)
        let line = polyline
        guard line.pointCount >= 2 else { return }
        let points = line.points()
        let band = Self.band / zoomScale, step = Self.tickEvery / zoomScale
        context.setStrokeColor(ink.withAlphaComponent(0.7).cgColor)
        context.setLineWidth(1.5 / zoomScale)
        for i in 0..<(line.pointCount - 1) {
            let a = point(for: points[i]), b = point(for: points[i + 1])
            let (dx, dy) = (Double(b.x - a.x), Double(b.y - a.y))
            let length = CGFloat((dx * dx + dy * dy).squareRoot())
            guard length > 0 else { continue }
            let n = Self.inside(dx: dx, dy: dy)
            var at: CGFloat = 0
            while at < length {
                let x = a.x + CGFloat(dx) * at / length, y = a.y + CGFloat(dy) * at / length
                context.move(to: CGPoint(x: x, y: y))
                context.addLine(to: CGPoint(x: x + CGFloat(n.x) * band, y: y + CGFloat(n.y) * band))
                at += step
            }
        }
        context.strokePath()
    }
}

final class FixAnnotation: NSObject, MKAnnotation {
    let fix: ChartMarks.Fix
    let coordinate: CLLocationCoordinate2D

    init(_ fix: ChartMarks.Fix) {
        self.fix = fix
        coordinate = CLLocationCoordinate2D(latitude: fix.lat, longitude: fix.lon)
    }
}

/// A fix: the four-point star in the airspace blue, its ident in the
/// chart's ink on a white halo (Android's nav|fix, the web's FIX_BLUE).
final class FixMarkView: MKAnnotationView {
    static let reuse = "fix"
    private static let star: UIImage = UIGraphicsImageRenderer(size: CGSize(width: 12, height: 12)).image { context in
        let cg = context.cgContext
        let points: [(CGFloat, CGFloat)] = [(6, 0), (7.4, 4.6), (12, 6), (7.4, 7.4), (6, 12), (4.6, 7.4), (0, 6), (4.6, 4.6)]
        cg.move(to: CGPoint(x: points[0].0, y: points[0].1))
        for p in points.dropFirst() { cg.addLine(to: CGPoint(x: p.0, y: p.1)) }
        cg.closePath()
        cg.setFillColor(WingtipColor.Chart.airspaceBlue.cgColor)
        cg.fillPath()
    }
    private let mark = UIImageView(image: FixMarkView.star)
    private let identLabel = UILabel()

    override init(annotation: (any MKAnnotation)?, reuseIdentifier: String?) {
        super.init(annotation: annotation, reuseIdentifier: reuseIdentifier)
        identLabel.font = UIFont.systemFont(ofSize: 11, weight: .semibold)
        identLabel.textColor = WingtipColor.Chart.fixInk
        identLabel.layer.shadowColor = UIColor.white.cgColor
        identLabel.layer.shadowRadius = 2
        identLabel.layer.shadowOpacity = 1
        identLabel.layer.shadowOffset = .zero
        addSubview(mark)
        addSubview(identLabel)
        isEnabled = false
        isAccessibilityElement = true
        accessibilityTraits = .staticText
        collisionMode = .rectangle
        displayPriority = MKFeatureDisplayPriority(rawValue: 450)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { nil }

    override var annotation: (any MKAnnotation)? {
        didSet { show() }
    }

    private func show() {
        guard let fix = annotation as? FixAnnotation else { return }
        identLabel.text = fix.fix.ident
        identLabel.sizeToFit()
        let height = max(12, identLabel.bounds.height)
        mark.frame = CGRect(x: 0, y: (height - 12) / 2, width: 12, height: 12)
        identLabel.frame.origin = CGPoint(x: 15, y: (height - identLabel.bounds.height) / 2)
        frame.size = CGSize(width: 15 + identLabel.bounds.width, height: height)
        // The star's middle on the fix.
        centerOffset = CGPoint(x: frame.width / 2 - 6, y: 0)
        accessibilityLabel = "Fix \(fix.fix.ident)"
    }
}
