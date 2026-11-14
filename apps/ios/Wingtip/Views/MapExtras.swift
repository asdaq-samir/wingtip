import MapKit
import UIKit

/// What the map draws beyond the fields and the route: the chart's VFR
/// waypoints close in, the Class B fields' weather, the approach plates
/// picked, and the pin a held finger drops (the web app's WaypointsLayer,
/// ClassBLayer, PlateLayer and the airspace card's point).
enum MapExtras {
    /// From this zoom in, as the web app's waypoints and airports: further
    /// out the diamonds would be a scatter over every city's airspace.
    static let waypointsFromZoom = 8.0

    /// The web map's zoom level for a span shown across a width of
    /// points: 256-point tiles, the world's 360 degrees at zoom 0.
    static func zoom(longitudeDelta: Double, width: Double) -> Double {
        guard longitudeDelta > 0, width > 0 else { return 0 }
        return log2(360 * width / 256 / longitudeDelta)
    }

    /// A Class B field as the map's airport mark takes it: its ring in
    /// the colour of what it reports now.
    static func pin(_ field: ClassBAirport) -> AirportPin {
        AirportPin(airspaceClass: "B", flightCategory: field.flightCategory, ident: field.ident, kind: "large", lat: field.lat, lon: field.lon, military: nil, name: field.name, isPrivate: false)
    }
}

/// A VFR waypoint (VPBNG): the chart's magenta diamond, its ident and
/// what it is in its callout, and with a route open a + that puts it in
/// the stops to be flown through.
final class WaypointAnnotation: NSObject, MKAnnotation {
    let waypoint: WaypointPin
    let coordinate: CLLocationCoordinate2D

    init(_ waypoint: WaypointPin) {
        self.waypoint = waypoint
        coordinate = CLLocationCoordinate2D(latitude: waypoint.lat, longitude: waypoint.lon)
    }

    var title: String? { waypoint.ident }
    var subtitle: String? {
        ["VFR waypoint", waypoint.description.map { AirportWords.faaWords($0) }].compactMap { $0 }.joined(separator: " · ")
    }
}

final class WaypointMarkView: MKAnnotationView {
    static let reuse = "waypoint"
    /// The sectional's magenta (web lib/useAirspace MAGENTA).
    static let magenta = WingtipColor.Chart.waypoint
    private let diamond = UIView()

    override init(annotation: (any MKAnnotation)?, reuseIdentifier: String?) {
        super.init(annotation: annotation, reuseIdentifier: reuseIdentifier)
        // The mark small, its tap the 44 points round it.
        frame = CGRect(x: 0, y: 0, width: 44, height: 44)
        diamond.frame = CGRect(x: 16, y: 16, width: 12, height: 12)
        diamond.backgroundColor = Self.magenta
        diamond.layer.borderColor = UIColor.white.cgColor
        diamond.layer.borderWidth = 2
        diamond.layer.cornerRadius = 2
        diamond.transform = CGAffineTransform(rotationAngle: .pi / 4)
        addSubview(diamond)
        canShowCallout = true
        displayPriority = .defaultLow
        isAccessibilityElement = true
        accessibilityTraits = .button
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { nil }

    /// Its ident and what it is, for VoiceOver: the callout says the same.
    override var annotation: (any MKAnnotation)? {
        didSet {
            let mark = annotation as? WaypointAnnotation
            accessibilityLabel = [mark?.title, mark?.subtitle].compactMap { $0 }.joined(separator: ", ")
        }
    }
}

/// The pin a held finger drops, where the airspace card is for.
final class HeldAnnotation: MKPointAnnotation {}

/// What the root view hands the map for these: the pin, the switches
/// from Setup, the approaches picked, and what a hold or a waypoint's
/// actions do.
struct MapExtrasInput {
    var held: CLLocationCoordinate2D?
    /// The field whose card is open, ringed on the chart (SelectedHalo).
    var selectedField: String?
    var waypoints = false
    var classB = false
    var plates = true
    var approaches: [ProcedurePick] = []
    /// The plates taken off the map from their card (HiddenPlates).
    var hiddenPlates: Set<String> = []
    /// How the plates are drawn, from their card (PlateLook).
    var plateLook = PlateLook()
    /// A plate's page tapped: its card, by the plate's key.
    var onPlate: ((String) -> Void)?
    var onHold: ((CLLocationCoordinate2D) -> Void)?
    /// A waypoint's card's action (CardKind.navaid): Direct To, Add to
    /// Route, Copy.
    var onWaypoint: ((String, CLLocationCoordinate2D, CardAction) -> Void)?
    /// The emergency card open: the private and military fields drawn
    /// whatever Setup's switches say, since in an emergency the pilot in
    /// command may land where it needs (14 CFR 91.3(b); the owner,
    /// 2026-11-13). The switches themselves are never changed, so they are
    /// as they were once the card closes.
    var emergency = false

    /// Which of Setup's field switches the map draws by now.
    func fieldSwitches(military: Bool, privateFields: Bool) -> (military: Bool, privateFields: Bool) {
        (military || emergency, privateFields || emergency)
    }

    /// Setup's switches, kept on the device (the web app's preferences:
    /// waypoints and Class B off until a pilot turns them on, plates on).
    enum Keys {
        static let waypoints = "map.waypoints"
        static let classB = "map.classB"
        static let plates = "map.plates"
        /// The web app's Military and Private settings (lib/preferences):
        /// the armed services' fields and the private ones off, at first
        /// (the owner, 2026-10-27: "Make private airports hidden by default").
        static let military = "map.military"
        static let privateFields = "map.private"
        /// The Map card's Aeronautical and Weather layers (the owner,
        /// 2026-11-14: "can we just have four layers aeronautical,
        /// weather, traffic, private/military"), on at first: the
        /// airspace, special-use areas, VORs and fixes; the fields' weather
        /// marks, the radar loop and the model weather.
        static let aeronautical = "map.aeronautical"
        static let weather = "map.weather"
    }
}

/// The map's coordinator's part for these, kept apart from the rest of
/// it: the held finger, the waypoints asked for as the map rests, the
/// Class B fields, the plates (PlateLayer). On the main actor, as the map is; the
/// coordinator's delegate calls come in through MainActor.assumeIsolated.
@MainActor
final class MapExtrasState: NSObject {
    var onHold: ((CLLocationCoordinate2D) -> Void)?
    var onWaypoint: ((String, CLLocationCoordinate2D, CardAction) -> Void)?
    private var held: HeldAnnotation?
    private var showWaypoints = false
    private var showClassB = false
    private var waypointMarks: [String: WaypointAnnotation] = [:]
    private var classBMarks: [AirportAnnotation] = []
    let plates = PlateLayer()
    private var waypointTask: Task<Void, Never>?
    private var classBTask: Task<Void, Never>?

    override nonisolated init() { super.init() }

    /// A finger held on the map asks what is there, as Maps drops a pin.
    func attach(to map: MKMapView) {
        map.register(WaypointMarkView.self, forAnnotationViewWithReuseIdentifier: WaypointMarkView.reuse)
        plates.attach(to: map)
        let hold = UILongPressGestureRecognizer(target: self, action: #selector(held(_:)))
        hold.minimumPressDuration = 0.5
        map.addGestureRecognizer(hold)
        // The airports, checkpoints and traffic in view in VoiceOver's rotor,
        // and to Siri as what is on the screen (View Annotations).
        map.accessibilityCustomRotors = MapRotors.rotors(for: map)
        ChartMapSiri.attach(to: map)
        // The held finger for VoiceOver, which cannot hold a point: the
        // same ask, of the map's centre (Apple's HIG: every gesture has an
        // accessible way to do the same).
        map.accessibilityCustomActions = [
            UIAccessibilityCustomAction(name: "What's Here") { [weak self, weak map] _ in
                guard let self, let map, let onHold = self.onHold else { return false }
                onHold(map.centerCoordinate)
                return true
            },
        ]
    }

    @objc private func held(_ gesture: UILongPressGestureRecognizer) {
        guard gesture.state == .began, let map = gesture.view as? MKMapView else { return }
        let at = map.convert(gesture.location(in: map), toCoordinateFrom: map)
        // Maps' pin-drop tap, played by Feel's host as every tap is.
        Feel.tap(.held)
        onHold?(at)
    }

    func update(_ map: MKMapView, _ input: MapExtrasInput, tiles: (any MKOverlay)?) {
        onHold = input.onHold
        onWaypoint = input.onWaypoint
        AirportMarkView.select(input.selectedField, on: map)
        if let point = input.held {
            if let pin = held {
                if pin.coordinate.latitude != point.latitude || pin.coordinate.longitude != point.longitude { pin.coordinate = point }
            } else {
                let pin = HeldAnnotation()
                pin.coordinate = point
                held = pin
                map.addAnnotation(pin)
            }
        } else if let pin = held {
            map.removeAnnotation(pin)
            held = nil
        }
        if input.waypoints != showWaypoints {
            showWaypoints = input.waypoints
            refreshWaypoints(map, after: 0)
        }
        if input.classB != showClassB {
            showClassB = input.classB
            refreshClassB(map)
        }
        plates.onPlate = input.onPlate
        plates.update(map, picks: PlateLayer.shown(plates: input.plates, approaches: input.approaches, hidden: input.hiddenPlates),
                      look: input.plateLook, tiles: tiles)
    }

    /// The map rested: the waypoints in view asked for again.
    func regionChanged(_ map: MKMapView) {
        if showWaypoints || !waypointMarks.isEmpty { refreshWaypoints(map, after: 300) }
    }

    func view(for annotation: any MKAnnotation, on map: MKMapView) -> MKAnnotationView? {
        if let mark = annotation as? WaypointAnnotation {
            let view = map.dequeueReusableAnnotationView(withIdentifier: WaypointMarkView.reuse, for: mark)
            // A waypoint's card is its callout, with the navaid card's
            // actions under its name, as the web's (CardKind.navaid).
            view.detailCalloutAccessoryView = actions(for: mark)
            return view
        }
        if annotation is HeldAnnotation {
            let view = MKMarkerAnnotationView(annotation: annotation, reuseIdentifier: nil)
            view.markerTintColor = .systemRed
            view.displayPriority = .required
            view.accessibilityLabel = "The point held, whose airspace the card shows"
            return view
        }
        return plates.view(for: annotation, on: map)
    }

    /// The navaid card's actions in a row, the first filled: Direct To and
    /// Add to Route once there is a route, Copy always.
    private func actions(for mark: WaypointAnnotation) -> UIView {
        let row = UIStackView()
        row.axis = .horizontal
        row.spacing = WingtipSpace.sm
        for (i, action) in CardKind.navaid.actions.enumerated() {
            var look: UIButton.Configuration = i == 0 ? .borderedProminent() : .bordered()
            look.title = action.title
            look.image = UIImage(systemName: action.systemImage)
            look.imagePlacement = .top
            look.imagePadding = WingtipSpace.xs
            look.buttonSize = .small
            let button = UIButton(configuration: look, primaryAction: UIAction { [weak self, weak mark] _ in
                guard let self, let mark else { return }
                if action == .copy {
                    UIPasteboard.general.string = mark.waypoint.ident
                } else {
                    self.onWaypoint?(mark.waypoint.ident, mark.coordinate, action)
                }
            })
            button.isEnabled = action == .copy || onWaypoint != nil
            row.addArrangedSubview(button)
        }
        return row
    }

    private func refreshWaypoints(_ map: MKMapView, after ms: Int) {
        waypointTask?.cancel()
        let region = map.region
        let zoom = MapExtras.zoom(longitudeDelta: region.span.longitudeDelta, width: Double(map.bounds.width))
        guard showWaypoints, zoom >= MapExtras.waypointsFromZoom else {
            map.removeAnnotations(Array(waypointMarks.values))
            waypointMarks = [:]
            return
        }
        waypointTask = Task { @MainActor [weak self, weak map] in
            if ms > 0 { try? await Task.sleep(for: .milliseconds(ms)) }
            guard !Task.isCancelled else { return }
            let south = region.center.latitude - region.span.latitudeDelta / 2, north = region.center.latitude + region.span.latitudeDelta / 2
            let west = region.center.longitude - region.span.longitudeDelta / 2, east = region.center.longitude + region.span.longitudeDelta / 2
            guard let found = try? await Planner.waypoints(south: south, west: west, north: north, east: east),
                  !Task.isCancelled, let self, let map else { return }
            let fresh = Dictionary(found.map { ($0.ident, $0) }, uniquingKeysWith: { a, _ in a })
            let gone = waypointMarks.filter { fresh[$0.key] == nil }
            map.removeAnnotations(Array(gone.values))
            for ident in gone.keys { waypointMarks[ident] = nil }
            for (ident, pin) in fresh where waypointMarks[ident] == nil {
                let mark = WaypointAnnotation(pin)
                waypointMarks[ident] = mark
                map.addAnnotation(mark)
            }
        }
    }

    private func refreshClassB(_ map: MKMapView) {
        classBTask?.cancel()
        map.removeAnnotations(classBMarks)
        classBMarks = []
        guard showClassB else { return }
        classBTask = Task { @MainActor [weak self, weak map] in
            guard let fields = try? await Planner.classB(), !Task.isCancelled, let self, let map else { return }
            classBMarks = fields.map { AirportAnnotation(MapExtras.pin($0)) }
            map.addAnnotations(classBMarks)
        }
    }
}
