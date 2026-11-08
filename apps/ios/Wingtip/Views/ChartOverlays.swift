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
    static let blue = UIColor(hex: 0x2465B8)
    static let magenta = UIColor(hex: 0xC0309F)
    /// A field whose tower is not known yet (web airportMark UNKNOWN_GREY).
    static let unknown = UIColor(hex: 0x6B7280)

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
    static let airspaceBlue = UIColor(hex: 0x2F8CFF)
    static let airspaceMagenta = UIColor(hex: 0xE02AD8)
    /// The dark tab an airspace's altitudes sit in.
    static let tab = UIColor(hex: 0x1C2330).withAlphaComponent(0.9)
    /// A runway's surface and the halo of its numbers (glOverlays'
    /// runwayLayers: ForeFlight's dark grey over its street map).
    static let runway = UIColor(hex: 0x4A4F57)
    /// A soft runway's (turf, grass, dirt, gravel): the web's olive for
    /// a runway that is not hard (glOverlays' runway-surface fill).
    static let softRunway = UIColor(hex: 0x7D8A6A)
    static let runwayHalo = UIColor(hex: 0x1C1A17)
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
}

// MARK: - When to ask again

/// The view's box as south, west, north, east.
struct ViewBox: Equatable, Sendable {
    var south, west, north, east: Double

    init(south: Double, west: Double, north: Double, east: Double) {
        (self.south, self.west, self.north, self.east) = (south, west, north, east)
    }

    init(_ region: MKCoordinateRegion) {
        self.init(south: region.center.latitude - region.span.latitudeDelta / 2,
                  west: region.center.longitude - region.span.longitudeDelta / 2,
                  north: region.center.latitude + region.span.latitudeDelta / 2,
                  east: region.center.longitude + region.span.longitudeDelta / 2)
    }

    /// The box grown by half of itself on every side: what is asked for,
    /// so a pan within it asks nothing.
    var widened: ViewBox {
        let dLat = (north - south) / 2, dLon = (east - west) / 2
        return ViewBox(south: max(-90, south - dLat), west: max(-180, west - dLon), north: min(90, north + dLat), east: min(180, east + dLon))
    }

    func holds(_ other: ViewBox) -> Bool {
        other.south >= south && other.north <= north && other.west >= west && other.east <= east
    }
}

/// What was last asked for the view, as the web map's useGlView asks during
/// a gesture: again when the whole level changes or the view leaves the
/// box asked for, at most once a frame, and not otherwise.
struct ViewFetch: Equatable, Sendable {
    private(set) var box: ViewBox?
    private(set) var level: Int?

    /// Whether a view at this zoom wants a new answer.
    func wants(_ view: ViewBox, zoom: Double) -> Bool {
        guard let box, let level else { return true }
        return Int(zoom.rounded(.down)) != level || !box.holds(view)
    }

    /// The box to ask for, kept as asked.
    mutating func ask(_ view: ViewBox, zoom: Double) -> ViewBox {
        let wide = view.widened
        box = wide
        level = Int(zoom.rounded(.down))
        return wide
    }

    mutating func forget() { box = nil; level = nil }
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

/// A volume's altitudes in its tab, as ForeFlight writes them and the web
/// map's airspaceText: the class, then the ceiling over the floor in the
/// sectional's hundreds of feet MSL (FAA Aeronautical Chart User's
/// Guide, VFR Terms and Symbols, Airspace) -- "B: 100–30", "C: 48–SFC" --
/// and a Class D its ceiling alone, "D: 25", with a minus where the file
/// says the top is "up to but not including" it (TNI, a Class D under a
/// Class B shelf: "D: -30"). None where the file gives no top.
enum AirspaceTab {
    static func text(_ volume: AirspaceVolume) -> String? {
        guard let ceiling = volume.ceilingFt else { return nil }
        let top = (volume.ceilingExcluded ? "-" : "") + hundreds(ceiling)
        if volume.airspaceClass == "D" { return "D: \(top)" }
        return "\(volume.airspaceClass): \(top)–\(volume.floorSfc ? "SFC" : hundreds(volume.floorFt))"
    }

    /// Feet as the chart's hundreds: 3,600 is "36", 10,000 "100".
    static func hundreds(_ ft: Double) -> String {
        String(Int((ft / 100).rounded()))
    }

    /// The same for VoiceOver, in words a pilot says.
    static func spoken(_ volume: AirspaceVolume) -> String {
        let top = volume.ceilingFt.map { "\(volume.ceilingExcluded ? "up to but not including " : "")\(Int($0)) feet" } ?? "no top given"
        let floor = volume.floorSfc ? "the surface" : "\(Int(volume.floorFt)) feet"
        return "Class \(volume.airspaceClass) airspace, \(floor) to \(top)"
    }

    /// Where a volume's tab sits: on its ring, at the northernmost of its
    /// points in sight (ForeFlight's tab on the line, as the web map
    /// places its label along it); none where no point of it is.
    static func point(_ lines: [[[Double]]], in rect: MKMapRect) -> CLLocationCoordinate2D? {
        var best: CLLocationCoordinate2D?
        for line in lines {
            for p in line where p.count == 2 {
                let at = CLLocationCoordinate2D(latitude: p[0], longitude: p[1])
                guard rect.contains(MKMapPoint(at)) else { continue }
                if best == nil || at.latitude > best!.latitude { best = at }
            }
        }
        return best
    }
}

final class AirspaceTabAnnotation: NSObject, MKAnnotation {
    let volume: AirspaceVolume
    let text: String
    @objc dynamic var coordinate: CLLocationCoordinate2D

    init(_ volume: AirspaceVolume, text: String, at: CLLocationCoordinate2D) {
        self.volume = volume
        self.text = text
        coordinate = at
    }
}

/// The tab: white bold type in a dark rounded box with a white edge, level
/// on the screen (web AIRSPACE_TAB_PICTURE).
final class AirspaceTabView: MKAnnotationView {
    static let reuse = "airspace-tab"
    private let label = UILabel()

    override init(annotation: (any MKAnnotation)?, reuseIdentifier: String?) {
        super.init(annotation: annotation, reuseIdentifier: reuseIdentifier)
        backgroundColor = SectionalInk.tab
        layer.cornerRadius = 3
        layer.borderWidth = 1
        layer.borderColor = UIColor.white.cgColor
        label.font = UIFont.systemFont(ofSize: 11, weight: .bold)
        label.textColor = .white
        addSubview(label)
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

    private func show() {
        guard let tab = annotation as? AirspaceTabAnnotation else { return }
        label.text = tab.text
        label.sizeToFit()
        frame.size = CGSize(width: label.bounds.width + 10, height: label.bounds.height + 4)
        label.frame.origin = CGPoint(x: 5, y: 2)
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
        isEnabled = false
        isAccessibilityElement = true
        accessibilityTraits = .staticText
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
    /// Turf, grass, dirt or gravel, drawn in the soft runway's olive.
    private(set) var soft = false

    /// The rectangle's corners, each end moved half the width either side
    /// of the centreline in map points (a foot is 0.3048 m exactly).
    static func between(_ a: CLLocationCoordinate2D, _ b: CLLocationCoordinate2D, widthFt: Double, soft: Bool = false) -> RunwaySurface {
        let pa = MKMapPoint(a), pb = MKMapPoint(b)
        let length = max(1e-9, hypot(pb.x - pa.x, pb.y - pa.y))
        let half = widthFt * 0.3048 / 2 * MKMapPointsPerMeterAtLatitude((a.latitude + b.latitude) / 2)
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
/// own last level is passed and Apple's map shows (ChartFade), the web
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

/// A field's runways as the map draws them, from its card's answer.
struct RunwayShape: Equatable, Sendable {
    struct End: Equatable, Sendable { let ident: String; let lat: Double; let lon: Double; let headingTrueDeg: Double? }
    let a: End
    let b: End
    let widthFt: Double?
    /// Turf, grass, dirt or gravel by its surface (the planner's field,
    /// OurAirports' or NASR's code), as the engine reads it for the
    /// short-field figures (gonogo_soft_surface).
    var soft = false

    /// The runways with both ends placed; a helipad (no heading) or a
    /// runway with an end the data does not place is not drawn.
    static func of(_ runways: [Runway]) -> [RunwayShape] {
        runways.compactMap { runway in
            let ends = (runway.runwayEnds ?? []).compactMap { end -> End? in
                guard let lat = end.lat, let lon = end.lon, end.headingTrueDeg != nil else { return nil }
                return End(ident: end.ident, lat: lat, lon: lon, headingTrueDeg: end.headingTrueDeg)
            }
            guard ends.count == 2 else { return nil }
            let soft: Bool = (try? Engine.call("gonogo_soft_surface", json: ["surface": runway.surface])) ?? false
            return RunwayShape(a: ends[0], b: ends[1], widthFt: runway.widthFt.map(Double.init), soft: soft)
        }
    }
}

// MARK: - The overlays on the map

/// The airspace, the VORs and the runways on the map, kept in step with
/// the view; on the main actor, as the map is.
@MainActor
final class ChartOverlays {
    private var airspaceFetch = ViewFetch()
    private var vorFetch = ViewFetch()
    private var volumes: [String: (volume: AirspaceVolume, lines: [AirspaceLine])] = [:]
    private var tabs: [String: AirspaceTabAnnotation] = [:]
    private var vors: [String: VorAnnotation] = [:]
    private var runwayLines: [String: [any MKOverlay]] = [:]
    private var runwayEnds: [String: [RunwayEndAnnotation]] = [:]
    private var runwaysKept: [String: [RunwayShape]] = [:]
    private var runwaysAsking: Set<String> = []
    /// Told once, the first time the airspace is answered (or cannot be):
    /// the map shows itself with its rings on (ChartMap's reveal).
    var onFirstAnswer: (() -> Void)?
    private var answered = false

    func attach(to map: MKMapView) {
        map.register(AirspaceTabView.self, forAnnotationViewWithReuseIdentifier: AirspaceTabView.reuse)
        map.register(VorMarkView.self, forAnnotationViewWithReuseIdentifier: VorMarkView.reuse)
        map.register(RunwayEndView.self, forAnnotationViewWithReuseIdentifier: RunwayEndView.reuse)
    }

    func renderer(for overlay: any MKOverlay) -> MKOverlayRenderer? {
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
            renderer.fillColor = (surface.soft ? SectionalInk.softRunway : SectionalInk.runway).withAlphaComponent(0.95)
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
        if annotation is AirspaceTabAnnotation {
            return map.dequeueReusableAnnotationView(withIdentifier: AirspaceTabView.reuse, for: annotation)
        }
        if annotation is VorAnnotation {
            return map.dequeueReusableAnnotationView(withIdentifier: VorMarkView.reuse, for: annotation)
        }
        if annotation is RunwayEndAnnotation {
            let view = map.dequeueReusableAnnotationView(withIdentifier: RunwayEndView.reuse, for: annotation) as! RunwayEndView
            view.turn(mapHeading: map.camera.heading)
            return view
        }
        return nil
    }

    /// The view moved (during a gesture with `live`, or at its rest): what
    /// is drawn for its zoom, and a new answer where it wants one -- from
    /// the packs at once, from the planner only once it rests.
    func moved(_ map: MKMapView, chart: (any MKOverlay)?, live: Bool) {
        guard map.bounds.width > 0 else { return }
        let view = ViewBox(map.region)
        let zoom = MapExtras.zoom(longitudeDelta: map.region.span.longitudeDelta, width: Double(map.bounds.width))
        if airspaceFetch.wants(view, zoom: zoom) { askAirspace(map, view: view, zoom: zoom, chart: chart, live: live) }
        if zoom >= VorZoom.from, vorFetch.wants(view, zoom: zoom) { askVors(map, view: view, zoom: zoom, live: live) }
        if zoom < VorZoom.from, !vors.isEmpty {
            map.removeAnnotations(Array(vors.values))
            vors = [:]
            vorFetch.forget()
        }
        drawAirspace(map, zoom: zoom, chart: chart)
        if !live { placeTabs(map, zoom: zoom) }
        for case let end as RunwayEndView in runwayEnds.values.flatMap({ $0 }).compactMap({ map.view(for: $0) }) {
            end.turn(mapHeading: map.camera.heading)
        }
    }

    // Airspace

    private func askAirspace(_ map: MKMapView, view: ViewBox, zoom: Double, chart: (any MKOverlay)?, live: Bool) {
        let wide = view.widened
        if let data = CyclePacks.shared.airspaceInView(south: wide.south, west: wide.west, north: wide.north, east: wide.east) {
            struct Answer: Decodable { let volumes: [AirspaceVolume] }
            _ = airspaceFetch.ask(view, zoom: zoom)
            if let answer = try? Planner.snakeCase.decode(Answer.self, from: data) {
                take(answer.volumes, map: map, zoom: zoom, chart: chart)
            }
            return
        }
        // No pack for the box: the airspace comes from the packs alone
        // (the planner's /api/airspace/in-view is gone, the web drawing it
        // from the overlay tiles), so the reveal waits for nothing here.
        firstAnswer()
    }

    private func take(_ fresh: [AirspaceVolume], map: MKMapView, zoom: Double, chart: (any MKOverlay)?) {
        let byId = Dictionary(fresh.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        for (id, kept) in volumes where byId[id] == nil || byId[id]! != kept.volume {
            map.removeOverlays(kept.lines)
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
            volumes[id] = (volume: volume, lines: lines)
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
        let on = Set(map.overlays.compactMap { $0 as? AirspaceLine }.map(ObjectIdentifier.init))
        for (_, kept) in volumes {
            let wanted = zoom >= AirspaceZoom.from(kept.volume.airspaceClass)
            for line in kept.lines {
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

    /// The tabs on the rings in sight, from the tabs' zoom.
    private func placeTabs(_ map: MKMapView, zoom: Double) {
        let rect = map.visibleMapRect
        for (id, kept) in volumes {
            let point = zoom >= AirspaceZoom.tabsFrom && zoom >= AirspaceZoom.from(kept.volume.airspaceClass)
                ? AirspaceTab.point(kept.volume.lines, in: rect) : nil
            guard let point, let text = AirspaceTab.text(kept.volume) else {
                if let tab = tabs.removeValue(forKey: id) { map.removeAnnotation(tab) }
                continue
            }
            if let tab = tabs[id] {
                tab.coordinate = point
            } else {
                let tab = AirspaceTabAnnotation(kept.volume, text: text, at: point)
                tabs[id] = tab
                map.addAnnotation(tab)
            }
        }
    }

    // VORs

    private func askVors(_ map: MKMapView, view: ViewBox, zoom: Double, live: Bool) {
        let wide = view.widened
        if let data = CyclePacks.shared.navaidsInView(south: wide.south, west: wide.west, north: wide.north, east: wide.east) {
            struct Answer: Decodable { let vors: [VorPin] }
            _ = vorFetch.ask(view, zoom: zoom)
            if let answer = try? Planner.snakeCase.decode(Answer.self, from: data) { takeVors(answer.vors, map: map) }
            return
        }
        // No pack for the box: no VORs, as the planner's
        // /api/navaids/in-view is gone (the packs alone answer it).
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
            // Over Apple's roads and under its labels, where the chart has
            // given way (ChartFade).
            map.addOverlays(lines, level: .aboveRoads)
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
