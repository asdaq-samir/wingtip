import MapKit
import UIKit

/// The FAA's overlays over the chart as the web map draws them since the
/// owner's ForeFlight screenshots (2026-11-07, #539, #541): the Class B, C
/// and D rings bolder than the chart's printed ones with their altitudes
/// in a dark tab, the VORs with their ident and frequency, and close in
/// each field's runways from the FAA's data. What they are and where comes
/// from the phone's cycle packs through the engine (CyclePacks'
/// airspaceInView and navaidsInView), else the planner's in-view answers,
/// the same shapes; the runways from the planner's field (/api/airport,
/// NASR's runway ends and widths). Nothing here works out a rule: it
/// draws what it is given.
///
/// The marks follow a pinch: the view is asked again as it moves, not
/// only once the fingers lift, whenever it changes level or leaves the
/// box already asked for (ViewFetch), the packs answering at once.

// MARK: - Inks

/// The chart colours the overlays wear, each the web map's own
/// (lib/useAirspace, lib/map/gl/glStyle.ts AIRSPACE_INK, glOverlays).
/// They are the chart's and stay the same at night, as the sectional
/// under them does.
enum SectionalInk {
    /// The sectional's airport and VOR blue and its magenta (web
    /// useAirspace BLUE and MAGENTA): "Airports having control towers are
    /// shown in blue, all others in magenta" (FAA Aeronautical Chart
    /// User's Guide, VFR Terms and Symbols, Airports).
    static let blue = WingtipColor.Chart.towered
    static let magenta = WingtipColor.Chart.untowered
    /// A field whose tower is not known yet (web airportMark UNKNOWN_GREY).
    static let unknown = WingtipColor.Chart.fieldUnknown

    static func airport(towered: Bool?) -> UIColor {
        switch towered {
        case true?: return blue
        case false?: return magenta
        case nil: return unknown
        }
    }

    /// The airspace's lines in ForeFlight's brighter blue and magenta
    /// (glStyle AIRSPACE_INK): Class B solid blue, C solid magenta, D
    /// dashed blue, as the sectional codes them (Chart User's Guide,
    /// Airspace).
    static let airspaceBlue = WingtipColor.Chart.airspaceBlue
    static let airspaceMagenta = WingtipColor.Chart.airspaceMagenta
    /// The dark tab an airspace's altitudes sit in.
    static let tab = WingtipColor.Chart.airspaceTab.withAlphaComponent(0.9)
    /// A runway's surface and the halo of its numbers (glOverlays'
    /// runwayLayers: ForeFlight's dark grey over its street map).
    static let runway = WingtipColor.Chart.runwayHard
    /// A soft runway's (turf, grass, dirt, gravel): the web's olive for
    /// a runway that is not hard (glOverlays' runway-surface fill).
    static let softRunway = WingtipColor.Chart.runwaySoft
    static let runwayHalo = WingtipColor.Chart.fixInk
}

// MARK: - What the planner and the packs answer

/// One Class B, C or D volume in view (the planner's AirspaceVolume, and
/// the engine's from a pack).
struct AirspaceVolume: Decodable, Equatable, Sendable {
    let id: String
    var ident: String?
    let name: String
    let airspaceClass: String
    let floorFt: Double
    let floorSfc: Bool
    var ceilingFt: Double?
    let ceilingExcluded: Bool
    var hoursCode: String?
    var hoursRemark: String?
    let labelLat: Double
    let labelLon: Double
    /// Its boundary, lines of [lat, lon].
    let lines: [[[Double]]]
}

/// A VOR, VOR/DME or VORTAC in view (VorPin).
struct VorPin: Decodable, Equatable, Sendable {
    let ident: String
    var name: String?
    let kind: String
    var freq: String?
    let lat: Double
    let lon: Double
    /// What its card says of it (NavaidCard), as the engine's
    /// navaids_in_view reads NASR's NAV_BASE: its magnetic variation, east
    /// positive; its elevation; its DME channel; its standard service
    /// volume's code (AIM 1-1-8); its hours; whether it is in service with
    /// restrictions, and its remarks.
    var magVar: Double?
    var elevationFt: Double?
    var channel: String?
    var serviceVolume: String?
    var hours: String?
    var restricted: Bool?
    var remarks: [String]?

    /// Its link's key and its card's (`navaid=`, the web's navaidAt):
    /// "OBK@42.2214,-87.9517", the ident and its place, as one ident names
    /// navaids in more than one place.
    var key: String { NavaidKey(ident: ident, lat: lat, lon: lon).text }
}

// MARK: - Airspace

/// From which Leaflet zoom each class is drawn, the web map's
/// (glStyle AIRSPACE_FROM): B from 6, C from 7, D and the tabs from 8.
enum AirspaceZoom {
    static func from(_ cls: String) -> Double {
        switch cls {
        case "B": return 6
        case "C": return 7
        default: return 8
        }
    }
    static let tabsFrom = 8.0
}

/// One line of a volume's ring, told by its class.
final class AirspaceLine: MKPolyline {
    var cls = "D"
}

/// A volume's band along the inside of its boundary, as ForeFlight draws
/// the sectional's vignette (the owner's screenshot over Madison,
/// 2026-11-08; the web's airspace-*-band layers): its rings as one
/// polygon, the largest the shell and the rest inside it, which the
/// renderer fills with nothing and strokes wide, clipped to the polygon
/// by the even-odd rule -- the inside of a shelf's outer ring and of its
/// hole alike.
final class AirspaceVignette: MKPolygon {
    var cls = "D"

    static func of(_ lines: [[[Double]]], cls: String) -> AirspaceVignette? {
        let rings = lines.map { $0.compactMap { $0.count == 2 ? CLLocationCoordinate2D(latitude: $0[0], longitude: $0[1]) : nil } }
            .filter { $0.count >= 3 }
        guard let outer = rings.indices.max(by: { AirspaceTab.extent(rings[$0]) < AirspaceTab.extent(rings[$1]) }) else { return nil }
        let shell = rings[outer]
        let inner = rings.indices.filter { $0 != outer }.map { MKPolygon(coordinates: rings[$0], count: rings[$0].count) }
        let band = AirspaceVignette(coordinates: shell, count: shell.count, interiorPolygons: inner)
        band.cls = cls
        return band
    }
}

/// Draws an AirspaceVignette: a stroke twice the band's width along every
/// ring, clipped to the polygon, so only its inner half shows. The band
/// widens as the map comes in, as the web's BAND_WIDTH: 3 points at
/// Leaflet's 7, 6 at 9, 10 at 11, 16 at 13.
final class AirspaceVignetteRenderer: MKPolygonRenderer {
    static func width(zoom: Double) -> CGFloat {
        let stops: [(Double, Double)] = [(7, 3), (9, 6), (11, 10), (13, 16)]
        if zoom <= stops[0].0 { return CGFloat(stops[0].1) }
        for (a, b) in zip(stops, stops.dropFirst()) where zoom <= b.0 {
            return CGFloat(a.1 + (b.1 - a.1) * (zoom - a.0) / (b.0 - a.0))
        }
        return CGFloat(stops.last!.1)
    }

    override func draw(_ mapRect: MKMapRect, zoomScale: MKZoomScale, in context: CGContext) {
        if path == nil { createPath() }
        guard let path, let colour = strokeColor else { return }
        // MapKit's world is 2^28 map points across, Leaflet's 256 * 2^z
        // screen points: the level from the scale.
        let zoom = log2(Double(zoomScale)) + 20
        context.saveGState()
        context.addPath(path)
        context.clip(using: .evenOdd)
        context.addPath(path)
        context.setStrokeColor(colour.cgColor)
        context.setLineWidth(2 * Self.width(zoom: zoom) / zoomScale)
        context.setLineJoin(.round)
        context.strokePath()
        context.restoreGState()
    }
}

/// A volume's altitudes in its tab, as ForeFlight writes them and the web
/// map's airspaceText (the owner's screenshot over Madison, 2026-11-08):
/// the class, then the floor and the ceiling in feet MSL with an en dash
/// -- "C: 2300–4900", "B: SFC–10000", "D: SFC–2500" -- the surface "SFC",
/// and "<" before a ceiling the file says is "up to but not including"
/// (UPPER_DESC TNI, which the sectional prints as a minus: FAA
/// Aeronautical Chart User's Guide, VFR Terms and Symbols, Airspace; a
/// Class D under a Class B shelf, "D: SFC–<3000"). None where the file
/// gives no top.
enum AirspaceTab {
    static func text(_ volume: AirspaceVolume) -> String? {
        guard let ceiling = volume.ceilingFt else { return nil }
        let floor = volume.floorSfc ? "SFC" : feet(volume.floorFt)
        return "\(volume.airspaceClass): \(floor)–\(volume.ceilingExcluded ? "<" : "")\(feet(ceiling))"
    }

    /// Feet MSL whole, as ForeFlight's tab writes them: "2300".
    static func feet(_ ft: Double) -> String {
        String(Int(ft.rounded()))
    }

    /// The same for VoiceOver, in words a pilot says.
    static func spoken(_ volume: AirspaceVolume) -> String {
        let top = volume.ceilingFt.map { "\(volume.ceilingExcluded ? "up to but not including " : "")\(Int($0)) feet" } ?? "no top given"
        let floor = volume.floorSfc ? "the surface" : "\(Int(volume.floorFt)) feet"
        return "Class \(volume.airspaceClass) airspace, \(floor) to \(top)"
    }

    /// A ring's size, its bounds' span: the largest of a volume's rings is
    /// its outer one.
    static func extent(_ ring: [CLLocationCoordinate2D]) -> Double {
        let lats = ring.map(\.latitude), lons = ring.map(\.longitude)
        return ((lats.max() ?? 0) - (lats.min() ?? 0)) + ((lons.max() ?? 0) - (lons.min() ?? 0))
    }

    /// Where on a round ring its tab sits: the azimuth from its
    /// airspace's centre, a little west of north, where ForeFlight puts
    /// Madison's Class C tab (the charts job's LABEL_AZIMUTH).
    static let azimuth = 330.0

    /// Where a volume's tab sits and how it is turned, as the charts job
    /// places the web's (overlays.py _label_place): a point in sight on
    /// the shelf's outer edge (its outer ring's points farthest from the
    /// airspace's `centre`), in the middle of that edge, or at `azimuth`
    /// where the edge goes all the way round; and the ring's direction
    /// there as the text's clockwise turn in degrees, upright (-90 to 90)
    /// with the map's `heading` taken off. In a plane tangent at the
    /// centre (east by the cosine of the latitude), Mercator being
    /// conformal. None where no point of the ring is in sight.
    static func place(_ lines: [[[Double]]], centre: CLLocationCoordinate2D, in rect: MKMapRect, heading: Double = 0)
        -> (at: CLLocationCoordinate2D, angle: Double)? {
        let rings = lines.map { $0.compactMap { $0.count == 2 ? CLLocationCoordinate2D(latitude: $0[0], longitude: $0[1]) : nil } }
        guard var ring = rings.max(by: { extent($0) < extent($1) }), ring.count >= 3 else { return nil }
        if let first = ring.first, let last = ring.last, first.latitude == last.latitude, first.longitude == last.longitude {
            ring.removeLast()
        }
        let k = cos(centre.latitude * .pi / 180)
        let xy = ring.map { (($0.longitude - centre.longitude) * k, $0.latitude - centre.latitude) }
        let far = xy.map { hypot($0.0, $0.1) }.max() ?? 0
        let sight = ring.indices.filter { rect.contains(MKMapPoint(ring[$0])) }
        guard far > 0, !sight.isEmpty else { return nil }
        var edge = sight.filter { hypot(xy[$0].0, xy[$0].1) >= 0.97 * far }
        if edge.isEmpty { edge = sight }
        let units = edge.map { i -> (Double, Double) in
            let d = hypot(xy[i].0, xy[i].1)
            return d > 0 ? (xy[i].0 / d, xy[i].1 / d) : (0, 0)
        }
        var sx = units.reduce(0) { $0 + $1.0 }, sy = units.reduce(0) { $0 + $1.1 }
        if hypot(sx, sy) < 0.5 * Double(units.count) {
            sx = sin(azimuth * .pi / 180)
            sy = cos(azimuth * .pi / 180)
        }
        let best = units.indices.max { units[$0].0 * sx + units[$0].1 * sy < units[$1].0 * sx + units[$1].1 * sy }!
        let i = edge[best], n = ring.count
        let a = xy[(i - 1 + n) % n], b = xy[(i + 1) % n]
        let bearing = atan2(b.0 - a.0, b.1 - a.1) * 180 / .pi
        var turn = bearing - 90 - heading
        while turn > 90 { turn -= 180 }
        while turn <= -90 { turn += 180 }
        return (ring[i], turn)
    }
}

final class AirspaceTabAnnotation: NSObject, MKAnnotation {
    let volume: AirspaceVolume
    let text: String
    @objc dynamic var coordinate: CLLocationCoordinate2D
    /// The tab's clockwise turn on the screen, degrees (AirspaceTab.place).
    var angle: Double

    init(_ volume: AirspaceVolume, text: String, at: CLLocationCoordinate2D, angle: Double) {
        self.volume = volume
        self.text = text
        coordinate = at
        self.angle = angle
    }
}

/// The tab: white bold type in a dark rounded box bordered in its class's
/// ink, turned along its ring (web airspace|tab|<class>).
final class AirspaceTabView: MKAnnotationView {
    static let reuse = "airspace-tab"
    private let box = UIView()
    private let label = UILabel()

    override init(annotation: (any MKAnnotation)?, reuseIdentifier: String?) {
        super.init(annotation: annotation, reuseIdentifier: reuseIdentifier)
        box.backgroundColor = SectionalInk.tab
        box.layer.cornerRadius = 3
        box.layer.borderWidth = 1.5
        label.font = UIFont.systemFont(ofSize: 11, weight: .bold)
        label.textColor = .white
        addSubview(box)
        box.addSubview(label)
        canShowCallout = false
        isEnabled = false
        isAccessibilityElement = true
        accessibilityTraits = .staticText
        collisionMode = .rectangle
        displayPriority = MKFeatureDisplayPriority(rawValue: 600)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { nil }

    override var annotation: (any MKAnnotation)? {
        didSet { show() }
    }

    /// Turned again as the map turns or the tab moves along its ring.
    func turn() {
        guard let tab = annotation as? AirspaceTabAnnotation else { return }
        box.transform = CGAffineTransform(rotationAngle: CGFloat(tab.angle * .pi / 180))
    }

    private func show() {
        guard let tab = annotation as? AirspaceTabAnnotation else { return }
        box.layer.borderColor = (tab.volume.airspaceClass == "C" ? SectionalInk.airspaceMagenta : SectionalInk.airspaceBlue).cgColor
        label.text = tab.text
        label.sizeToFit()
        box.transform = .identity
        let size = CGSize(width: label.bounds.width + 12, height: label.bounds.height + 4)
        box.bounds = CGRect(origin: .zero, size: size)
        label.frame.origin = CGPoint(x: 6, y: 2)
        // The view a square round the turned box, so MapKit's collision
        // keeps room for it at any turn.
        let side = hypot(size.width, size.height)
        frame.size = CGSize(width: side, height: side)
        box.center = CGPoint(x: side / 2, y: side / 2)
        turn()
        accessibilityLabel = AirspaceTab.spoken(tab.volume)
    }
}

// MARK: - VORs

final class VorAnnotation: NSObject, MKAnnotation {
    let vor: VorPin
    let coordinate: CLLocationCoordinate2D

    init(_ vor: VorPin) {
        self.vor = vor
        coordinate = CLLocationCoordinate2D(latitude: vor.lat, longitude: vor.lon)
    }

    /// Its ident and frequency as ForeFlight writes them: "GCO (108.25)".
    var tag: String { vor.freq.map { "\(vor.ident) (\($0))" } ?? vor.ident }
}

/// A VOR: the chart's hexagon in the sectional's blue, with its ident and
/// frequency on a blue tag beside it (FAA Aeronautical Chart User's Guide,
/// Radio Aids to Navigation; the web map's NAVAID_PICTURES and navaidMarks).
final class VorMarkView: MKAnnotationView {
    static let reuse = "vor"
    private static let hexagon: UIImage = UIGraphicsImageRenderer(size: CGSize(width: 16, height: 16)).image { context in
        let cg = context.cgContext
        let points = [(15.0, 8.0), (11.5, 14.06), (4.5, 14.06), (1.0, 8.0), (4.5, 1.94), (11.5, 1.94)]
        cg.move(to: CGPoint(x: points[0].0, y: points[0].1))
        for p in points.dropFirst() { cg.addLine(to: CGPoint(x: p.0, y: p.1)) }
        cg.closePath()
        cg.setFillColor(UIColor.white.cgColor)
        cg.setStrokeColor(SectionalInk.blue.cgColor)
        cg.setLineWidth(2)
        cg.drawPath(using: .fillStroke)
        cg.setFillColor(SectionalInk.blue.cgColor)
        cg.fillEllipse(in: CGRect(x: 6.4, y: 6.4, width: 3.2, height: 3.2))
    }
    private let mark = UIImageView(image: VorMarkView.hexagon)
    private let tagLabel = UILabel()

    override init(annotation: (any MKAnnotation)?, reuseIdentifier: String?) {
        super.init(annotation: annotation, reuseIdentifier: reuseIdentifier)
        tagLabel.font = UIFont.systemFont(ofSize: 11, weight: .bold)
        tagLabel.textColor = .white
        tagLabel.backgroundColor = SectionalInk.blue
        tagLabel.textAlignment = .center
        tagLabel.layer.cornerRadius = 3
        tagLabel.layer.masksToBounds = true
        addSubview(mark)
        addSubview(tagLabel)
        canShowCallout = false
        // A tap opens its card (NavaidCard), as the web's VOR does.
        isAccessibilityElement = true
        accessibilityTraits = .button
        collisionMode = .rectangle
        displayPriority = MKFeatureDisplayPriority(rawValue: 550)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { nil }

    override var annotation: (any MKAnnotation)? {
        didSet { show() }
    }

    private func show() {
        guard let vor = annotation as? VorAnnotation else { return }
        tagLabel.text = vor.tag
        tagLabel.sizeToFit()
        let tagSize = CGSize(width: tagLabel.bounds.width + 8, height: tagLabel.bounds.height + 2)
        let height = max(16, tagSize.height)
        mark.frame = CGRect(x: 0, y: (height - 16) / 2, width: 16, height: 16)
        tagLabel.frame = CGRect(x: 20, y: (height - tagSize.height) / 2, width: tagSize.width, height: tagSize.height)
        frame.size = CGSize(width: 20 + tagSize.width, height: height)
        // The hexagon's middle on the VOR.
        centerOffset = CGPoint(x: frame.width / 2 - 8, y: 0)
        accessibilityLabel = "\(vor.vor.kind) \(vor.vor.ident)\(vor.vor.freq.map { ", \($0)" } ?? "")"
    }
}

// MARK: - Runways

/// A runway's surface: the rectangle between its two surveyed ends at its
/// own width (NASR APT_RWY RWY_WIDTH and APT_RWY_END's ends, as the
/// planner's field answers them), drawn by MapKit's own polygon renderer
/// (a renderer of the app's own drawing was never asked to draw).
final class RunwaySurface: MKPolygon {
    /// Turf, grass, dirt or gravel, drawn in the soft runway's olive; nil
    /// where the engine could not class the surface.
    private(set) var soft: Bool? = false

    /// The rectangle's corners, each end moved half the width either side
    /// of the centreline in map points (Foundation's foot, exactly 0.3048 m).
    static func between(_ a: CLLocationCoordinate2D, _ b: CLLocationCoordinate2D, widthFt: Double, soft: Bool? = false) -> RunwaySurface {
        let pa = MKMapPoint(a), pb = MKMapPoint(b)
        let length = max(1e-9, hypot(pb.x - pa.x, pb.y - pa.y))
        let half = Measurement(value: widthFt, unit: UnitLength.feet).converted(to: .meters).value / 2 * MKMapPointsPerMeterAtLatitude((a.latitude + b.latitude) / 2)
        let nx = -(pb.y - pa.y) / length * half, ny = (pb.x - pa.x) / length * half
        let corners = [MKMapPoint(x: pa.x + nx, y: pa.y + ny), MKMapPoint(x: pb.x + nx, y: pb.y + ny),
                       MKMapPoint(x: pb.x - nx, y: pb.y - ny), MKMapPoint(x: pa.x - nx, y: pa.y - ny)]
        let surface = RunwaySurface(points: corners, count: corners.count)
        surface.soft = soft
        return surface
    }
}

/// A runway's dashed centreline, end to end.
final class RunwayCentreline: MKPolyline {}

/// From which Leaflet zoom the runways are drawn: 13, where the chart's
/// own last level is passed and the imagery shows (ChartFade), the web
/// map's MapLibre 12 (glOverlays' RUNWAYS_FROM); the ends' numbers half a
/// level later.
enum RunwayZoom {
    static let from = 13.0
    static let endsFrom = 13.5
}

/// A runway end's number (09L), painted as on the runway: turned to the
/// end's true heading so its top points down the runway, a little in from
/// the threshold.
final class RunwayEndAnnotation: NSObject, MKAnnotation {
    let ident: String
    let headingTrueDeg: Double
    let coordinate: CLLocationCoordinate2D

    init(ident: String, headingTrueDeg: Double, at: CLLocationCoordinate2D) {
        self.ident = ident
        self.headingTrueDeg = headingTrueDeg
        coordinate = at
    }
}

final class RunwayEndView: MKAnnotationView {
    static let reuse = "runway-end"
    private let label = UILabel()

    override init(annotation: (any MKAnnotation)?, reuseIdentifier: String?) {
        super.init(annotation: annotation, reuseIdentifier: reuseIdentifier)
        label.font = UIFont.systemFont(ofSize: 13, weight: .heavy)
        label.textColor = .white
        label.layer.shadowColor = SectionalInk.runwayHalo.cgColor
        label.layer.shadowOffset = .zero
        label.layer.shadowRadius = 1.75
        label.layer.shadowOpacity = 1
        addSubview(label)
        canShowCallout = false
        isEnabled = false
        displayPriority = .required
        isAccessibilityElement = true
        accessibilityTraits = .staticText
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { nil }

    override var annotation: (any MKAnnotation)? {
        didSet {
            guard let end = annotation as? RunwayEndAnnotation else { return }
            label.text = end.ident
            label.sizeToFit()
            // The bounds, not the frame: the view is turned (turn).
            bounds.size = label.bounds.size
            label.frame.origin = .zero
            accessibilityLabel = "Runway \(end.ident)"
        }
    }

    /// Turned for the map's own heading: the number's top down the runway,
    /// its middle 14 points in from the threshold.
    func turn(mapHeading: Double) {
        guard let end = annotation as? RunwayEndAnnotation else { return }
        let radians = (end.headingTrueDeg - mapHeading) * .pi / 180
        transform = CGAffineTransform(rotationAngle: radians)
        centerOffset = CGPoint(x: 14 * sin(radians), y: -14 * cos(radians))
    }
}

// MARK: - The overlays on the map

/// The airspace, the VORs, the runways and the marks on the map, kept with the view, on the main actor as the map is.
@MainActor final class ChartOverlays {
    /// The special-use areas and the fixes (ChartMarks).
    let marks = ChartMarks()
    private var airspaceFetch = ViewFetch()
    private var vorFetch = ViewFetch()
    private var volumes: [String: (volume: AirspaceVolume, lines: [AirspaceLine], band: AirspaceVignette?)] = [:]
    private var tabs: [String: AirspaceTabAnnotation] = [:]
    private var vors: [String: VorAnnotation] = [:]
    private var runwayLines: [String: [any MKOverlay]] = [:]
    private var runwayEnds: [String: [RunwayEndAnnotation]] = [:]
    private var runwaysKept: [String: [RunwayShape]] = [:]
    private var runwaysAsking: Set<String> = []
    /// The Map card's Aeronautical layer: off, the airspace and its tabs,
    /// the special-use areas, the VORs and the fixes are taken off and not
    /// asked for; the fields' runways stay, as the fields do.
    private(set) var aeronautical = true
    /// Told once, the first time the airspace is answered (or cannot be): the map shows itself with its rings on (ChartMap's reveal).
    var onFirstAnswer: (() -> Void)?
    private var answered = false

    func attach(to map: MKMapView) {
        marks.attach(to: map)
        map.register(AirspaceTabView.self, forAnnotationViewWithReuseIdentifier: AirspaceTabView.reuse)
        map.register(VorMarkView.self, forAnnotationViewWithReuseIdentifier: VorMarkView.reuse)
        map.register(RunwayEndView.self, forAnnotationViewWithReuseIdentifier: RunwayEndView.reuse)
    }

    func renderer(for overlay: any MKOverlay) -> MKOverlayRenderer? {
        if let renderer = marks.renderer(for: overlay) { return renderer }
        if let band = overlay as? AirspaceVignette {
            // The class's ink, faint (glStyle AIRSPACE_INK's band).
            let renderer = AirspaceVignetteRenderer(polygon: band)
            renderer.strokeColor = (band.cls == "C" ? SectionalInk.airspaceMagenta : SectionalInk.airspaceBlue)
                .withAlphaComponent(band.cls == "D" ? 0.22 : 0.3)
            return renderer
        }
        if let line = overlay as? AirspaceLine {
            let renderer = MKPolylineRenderer(polyline: line)
            switch line.cls {
            case "B":
                renderer.strokeColor = SectionalInk.airspaceBlue
                renderer.lineWidth = 4
            case "C":
                renderer.strokeColor = SectionalInk.airspaceMagenta
                renderer.lineWidth = 4
            default:
                // A dash of 10 points and a gap of 5 (glStyle's D).
                renderer.strokeColor = SectionalInk.airspaceBlue
                renderer.lineWidth = 3.5
                renderer.lineDashPattern = [10, 5]
            }
            renderer.lineJoin = .round
            renderer.lineCap = line.cls == "D" ? .butt : .round
            return renderer
        }
        if let surface = overlay as? RunwaySurface {
            // ForeFlight's dark grey with a white edge, olive for a soft
            // one (glOverlays' runwayLayers).
            let renderer = MKPolygonRenderer(polygon: surface)
            // A surface the engine could not class is drawn in the chart's
            // unknown grey, neither paved nor soft (RunwayShape).
            let fill = surface.soft.map { $0 ? SectionalInk.softRunway : SectionalInk.runway } ?? WingtipColor.Chart.fieldUnknown
            renderer.fillColor = fill.withAlphaComponent(0.95)
            renderer.strokeColor = .white
            renderer.lineWidth = 1
            return renderer
        }
        if let centreline = overlay as? RunwayCentreline {
            let renderer = MKPolylineRenderer(polyline: centreline)
            renderer.strokeColor = .white
            renderer.lineWidth = 1.25
            renderer.lineDashPattern = [5, 4]
            renderer.lineCap = .butt
            return renderer
        }
        return nil
    }

    func view(for annotation: any MKAnnotation, on map: MKMapView) -> MKAnnotationView? {
        if let view = marks.view(for: annotation, on: map) { return view }
        if annotation is AirspaceTabAnnotation { return map.dequeueReusableAnnotationView(withIdentifier: AirspaceTabView.reuse, for: annotation) }
        if annotation is VorAnnotation { return map.dequeueReusableAnnotationView(withIdentifier: VorMarkView.reuse, for: annotation) }
        if annotation is RunwayEndAnnotation {
            let view = map.dequeueReusableAnnotationView(withIdentifier: RunwayEndView.reuse, for: annotation) as! RunwayEndView
            view.turn(mapHeading: map.camera.heading)
            return view
        }
        return nil
    }

    /// The view moved (during a gesture with `live`, or at its rest): what is drawn for its zoom, and a new
    /// answer where it wants one -- from the packs at once, from the planner only once it rests.
    /// The Aeronautical layer turned on or off: off, everything it draws
    /// taken off at once; on, asked for again where the map is.
    func show(aeronautical on: Bool, on map: MKMapView, chart: (any MKOverlay)?) {
        guard on != aeronautical else { return }
        aeronautical = on
        if on {
            moved(map, chart: chart, live: false)
            return
        }
        map.removeOverlays(volumes.values.flatMap { kept in (kept.band.map { [$0 as any MKOverlay] } ?? []) + kept.lines })
        volumes = [:]
        map.removeAnnotations(Array(tabs.values))
        tabs = [:]
        map.removeAnnotations(Array(vors.values))
        vors = [:]
        airspaceFetch.forget()
        vorFetch.forget()
        marks.clear(map)
        // Nothing of it to wait for before the map shows.
        firstAnswer()
    }

    func moved(_ map: MKMapView, chart: (any MKOverlay)?, live: Bool) {
        guard map.bounds.width > 0 else { return }
        let view = ViewBox(map.region)
        let zoom = MapExtras.zoom(longitudeDelta: map.region.span.longitudeDelta, width: Double(map.bounds.width))
        if aeronautical {
            marks.moved(map, view: view, zoom: zoom)
            if airspaceFetch.wants(view, zoom: zoom) { askAirspace(map, view: view, zoom: zoom, chart: chart, live: live) }
            if zoom >= VorZoom.from, vorFetch.wants(view, zoom: zoom) { askVors(map, view: view, zoom: zoom, live: live) }
            if zoom < VorZoom.from, !vors.isEmpty {
                map.removeAnnotations(Array(vors.values))
                vors = [:]
                vorFetch.forget()
            }
            drawAirspace(map, zoom: zoom, chart: chart)
            if !live { placeTabs(map, zoom: zoom) }
        }
        for case let end as RunwayEndView in runwayEnds.values.flatMap({ $0 }).compactMap({ map.view(for: $0) }) {
            end.turn(mapHeading: map.camera.heading)
        }
    }

    // Airspace

    private func askAirspace(_ map: MKMapView, view: ViewBox, zoom: Double, chart: (any MKOverlay)?, live: Bool) {
        let asked = airspaceFetch.ask(view, zoom: zoom)
        Task { [weak self, weak map] in
            // Off the main actor (CyclePacks.airspaceVolumesInView), taken
            // back only while the view still wants this box.
            let found = await CyclePacks.shared.airspaceVolumesInView(asked)
            guard let self, let map, airspaceFetch.box == asked else { return }
            guard let found else {
                // No pack for the box: asked again at the next move. The
                // airspace comes from the packs alone (the planner's
                // /api/airspace/in-view is gone, the web drawing it from
                // the overlay tiles), so the reveal waits for nothing here.
                airspaceFetch.forget()
                return firstAnswer()
            }
            let now = MapExtras.zoom(longitudeDelta: map.region.span.longitudeDelta, width: Double(map.bounds.width))
            if let found { take(found, map: map, zoom: now, chart: chart) }
        }
    }

    private func take(_ fresh: [AirspaceVolume], map: MKMapView, zoom: Double, chart: (any MKOverlay)?) {
        let byId = Dictionary(fresh.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        for (id, kept) in volumes where byId[id] == nil || byId[id]! != kept.volume {
            map.removeOverlays(kept.lines)
            if let band = kept.band { map.removeOverlay(band) }
            volumes[id] = nil
            if let tab = tabs.removeValue(forKey: id) { map.removeAnnotation(tab) }
        }
        for (id, volume) in byId where volumes[id] == nil {
            let lines = volume.lines.compactMap { points -> AirspaceLine? in
                let coordinates = points.compactMap { $0.count == 2 ? CLLocationCoordinate2D(latitude: $0[0], longitude: $0[1]) : nil }
                guard coordinates.count >= 2 else { return nil }
                let line = AirspaceLine(coordinates: coordinates, count: coordinates.count)
                line.cls = volume.airspaceClass
                return line
            }
            volumes[id] = (volume: volume, lines: lines, band: AirspaceVignette.of(volume.lines, cls: volume.airspaceClass))
        }
        drawAirspace(map, zoom: zoom, chart: chart)
        placeTabs(map, zoom: zoom)
        firstAnswer()
    }

    private func firstAnswer() {
        guard !answered else { return }
        answered = true
        onFirstAnswer?()
    }

    /// Each volume's lines on the map from its class's zoom, off before it,
    /// over the chart and under the route.
    private func drawAirspace(_ map: MKMapView, zoom: Double, chart: (any MKOverlay)?) {
        let on = Set(map.overlays.filter { $0 is AirspaceLine || $0 is AirspaceVignette }.map { ObjectIdentifier($0) })
        for (_, kept) in volumes {
            let wanted = zoom >= AirspaceZoom.from(kept.volume.airspaceClass)
            // The band first, so each line is put over it.
            let overlays: [any MKOverlay] = (kept.band.map { [$0] } ?? []) + kept.lines
            for line in overlays {
                let drawn = on.contains(ObjectIdentifier(line))
                if wanted && !drawn {
                    if let chart, map.overlays.contains(where: { $0 === chart }) {
                        map.insertOverlay(line, above: chart)
                    } else {
                        map.insertOverlay(line, at: 0, level: .aboveLabels)
                    }
                } else if !wanted && drawn {
                    map.removeOverlay(line)
                }
            }
        }
    }

    /// The tabs on the rings in sight, from the tabs' zoom: one a volume,
    /// on its outer edge and turned along it (AirspaceTab.place), each
    /// airspace's centre the middle of its volumes' bounds (a Class C's
    /// surface area and shelf, a Class B's shelves), as the charts job
    /// places the web's.
    private func placeTabs(_ map: MKMapView, zoom: Double) {
        let rect = map.visibleMapRect
        var bounds: [String: (s: Double, w: Double, n: Double, e: Double)] = [:]
        func key(_ v: AirspaceVolume) -> String { "\(v.airspaceClass)|\(v.ident ?? v.name)" }
        for (_, kept) in volumes {
            for p in kept.volume.lines.joined() where p.count == 2 {
                let b = bounds[key(kept.volume)] ?? (p[0], p[1], p[0], p[1])
                bounds[key(kept.volume)] = (min(b.s, p[0]), min(b.w, p[1]), max(b.n, p[0]), max(b.e, p[1]))
            }
        }
        for (id, kept) in volumes {
            let b = bounds[key(kept.volume)]
            let centre = CLLocationCoordinate2D(latitude: ((b?.s ?? 0) + (b?.n ?? 0)) / 2, longitude: ((b?.w ?? 0) + (b?.e ?? 0)) / 2)
            let place = zoom >= AirspaceZoom.tabsFrom && zoom >= AirspaceZoom.from(kept.volume.airspaceClass)
                ? AirspaceTab.place(kept.volume.lines, centre: centre, in: rect, heading: map.camera.heading) : nil
            guard let place, let text = AirspaceTab.text(kept.volume) else {
                if let tab = tabs.removeValue(forKey: id) { map.removeAnnotation(tab) }
                continue
            }
            if let tab = tabs[id] {
                tab.coordinate = place.at
                tab.angle = place.angle
                (map.view(for: tab) as? AirspaceTabView)?.turn()
            } else {
                let tab = AirspaceTabAnnotation(kept.volume, text: text, at: place.at, angle: place.angle)
                tabs[id] = tab
                map.addAnnotation(tab)
            }
        }
    }

    // VORs

    private func askVors(_ map: MKMapView, view: ViewBox, zoom: Double, live: Bool) {
        let asked = vorFetch.ask(view, zoom: zoom)
        Task { [weak self, weak map] in
            let found = await CyclePacks.shared.vorsInView(asked)
            guard let self, let map, vorFetch.box == asked else { return }
            // No pack for the box: no VORs, as the planner's
            // /api/navaids/in-view is gone (the packs alone answer it);
            // asked again at the next move.
            guard let found else { return vorFetch.forget() }
            if let found { takeVors(found, map: map) }
        }
    }

    private func takeVors(_ found: [VorPin], map: MKMapView) {
        let fresh = Dictionary(found.map { ($0.ident + $0.kind, $0) }, uniquingKeysWith: { a, _ in a })
        let gone = vors.filter { fresh[$0.key] == nil || fresh[$0.key]! != $0.value.vor }
        map.removeAnnotations(Array(gone.values))
        for key in gone.keys { vors[key] = nil }
        for (key, vor) in fresh where vors[key] == nil {
            let mark = VorAnnotation(vor)
            vors[key] = mark
            map.addAnnotation(mark)
        }
    }

    // Runways

    /// The runways of the fields in sight from close in, each field's asked
    /// for once (its card's answer, /api/airport/{ident}) and kept; off
    /// further out. At most the eight biggest fields in sight are asked.
    func runways(_ map: MKMapView, fields: [AirportPin], chart: (any MKOverlay)?) {
        guard map.bounds.width > 0 else { return }
        let zoom = MapExtras.zoom(longitudeDelta: map.region.span.longitudeDelta, width: Double(map.bounds.width))
        let rect = map.visibleMapRect
        let inSight = zoom >= RunwayZoom.from
            ? Array(fields.filter { rect.contains(MKMapPoint(CLLocationCoordinate2D(latitude: $0.lat, longitude: $0.lon))) }.prefix(8)) : []
        let wanted = Set(inSight.map(\.ident))
        for ident in Set(runwayLines.keys).subtracting(wanted) {
            map.removeOverlays(runwayLines.removeValue(forKey: ident) ?? [])
            map.removeAnnotations(runwayEnds.removeValue(forKey: ident) ?? [])
        }
        let showEnds = zoom >= RunwayZoom.endsFrom
        for (ident, ends) in runwayEnds where !showEnds {
            map.removeAnnotations(ends)
            runwayEnds[ident] = []
        }
        for field in inSight {
            if let shapes = runwaysKept[field.ident] {
                draw(field.ident, shapes, on: map, chart: chart, ends: showEnds)
            } else if !runwaysAsking.contains(field.ident) {
                runwaysAsking.insert(field.ident)
                Task { [weak self, weak map] in
                    let place = try? await Planner.place(field.ident)
                    guard let self else { return }
                    self.runwaysAsking.remove(field.ident)
                    guard let place else { return }
                    self.runwaysKept[field.ident] = RunwayShape.of(place.runways)
                    if let map { self.runways(map, fields: fields, chart: chart) }
                }
            }
        }
    }

    private func draw(_ ident: String, _ shapes: [RunwayShape], on map: MKMapView, chart: (any MKOverlay)?, ends: Bool) {
        if runwayLines[ident] == nil {
            // Each runway's surface, then its centreline over it; one the FAA
            // gives no width for is not drawn (its ends' numbers are).
            let lines: [any MKOverlay] = shapes.flatMap { shape -> [any MKOverlay] in
                guard let width = shape.widthFt else { return [] }
                let ends = [CLLocationCoordinate2D(latitude: shape.a.lat, longitude: shape.a.lon),
                            CLLocationCoordinate2D(latitude: shape.b.lat, longitude: shape.b.lon)]
                return [RunwaySurface.between(ends[0], ends[1], widthFt: width, soft: shape.soft), RunwayCentreline(coordinates: ends, count: 2)]
            }
            // Just over the chart, so over the imagery it fades into (CloseImagery) and under the rest.
            let onChart = chart.map { c in map.overlays.contains { $0 === c } } == true
            if let chart, onChart { lines.forEach { map.insertOverlay($0, above: chart) } } else { map.addOverlays(lines, level: .aboveRoads) }
            runwayLines[ident] = lines
        }
        if ends, (runwayEnds[ident] ?? []).isEmpty {
            let marks = shapes.flatMap { [$0.a, $0.b] }.compactMap { end -> RunwayEndAnnotation? in
                guard let heading = end.headingTrueDeg else { return nil }
                return RunwayEndAnnotation(ident: end.ident, headingTrueDeg: heading, at: CLLocationCoordinate2D(latitude: end.lat, longitude: end.lon))
            }
            map.addAnnotations(marks)
            runwayEnds[ident] = marks
        }
    }
}

/// The VORs from a region's zoom, the web map's (glOverlays VOR_ZOOM).
enum VorZoom {
    static let from = 8.0
}
