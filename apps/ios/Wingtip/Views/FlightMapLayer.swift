@preconcurrency import MapKit
import UIKit

/// What the map draws of the airplanes tracked and the flights flown, and
/// the tap it answers for them: an airplane's mark, opening its card. (A
/// long press is the airspace card's, MapExtras.)
struct FlightLayer {
    var trackedHex: String?
    var tracked: TrafficAircraft?
    var follow = false
    var path: [PathPoint] = []
    var past: [PathPoint] = []
    var flown: [PathPoint] = []
    /// The glide ring about own ship (InFlight, the engine's glide_ring),
    /// its outline; empty with none.
    var glide: [CLLocationCoordinate2D] = []
    /// The emergency assistant's line from the airplane to the field
    /// picked (Emergency), while it is open; empty otherwise.
    var emergency: [CLLocationCoordinate2D] = []
    var onTraffic: ((TrafficAircraft) -> Void)?
    /// The pilot dragged the map off the airplane followed.
    var onDragged: (() -> Void)?
}

/// A run of a flown path in one colour, its height's.
final class HeightPolyline: MKPolyline {
    var colour: UIColor = .systemGray
}

/// The white casing under a flown path, so it holds over any chart colour.
final class CasingPolyline: MKPolyline {}

/// The still-air glide ring about own ship, dashed as the web app's.
final class GlidePolyline: MKPolyline {}

/// The emergency assistant's line to the field picked.
final class EmergencyPolyline: MKPolyline {}

/// The ring round the airplane tracked, as the web app's TrafficLayer
/// draws it.
final class TrackedRing: MKPointAnnotation {}

final class TrackedRingView: MKAnnotationView {
    static let reuse = "tracked-ring"

    override init(annotation: (any MKAnnotation)?, reuseIdentifier: String?) {
        super.init(annotation: annotation, reuseIdentifier: reuseIdentifier)
        frame = CGRect(x: 0, y: 0, width: 40, height: 40)
        layer.cornerRadius = 20
        layer.borderWidth = 3
        layer.borderColor = UIColor.systemBlue.cgColor
        backgroundColor = UIColor.systemBlue.withAlphaComponent(0.12)
        isEnabled = false
        displayPriority = .required
        zPriority = .min
        // Decoration round the airplane's own mark, which carries the name.
        isAccessibilityElement = false
        accessibilityElementsHidden = true
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { nil }
}

/// The map's part for them, kept by ChartMap's coordinator.
@MainActor
final class FlightMapLayer: NSObject {
    private var layer = FlightLayer()
    private var ring: TrackedRing?
    private var lines: [String: [MKPolyline]] = [:]
    private var drawn: [String: [PathPoint]] = [:]
    /// The tracked airplane's last place, followed or not, for the next
    /// report's move (MapCamera.keepOnScreen).
    private var centred: CLLocationCoordinate2D?
    private var glideLine: GlidePolyline?
    private var glideDrawn: [CLLocationCoordinate2D] = []
    private var emergencyLine: EmergencyPolyline?
    private var emergencyDrawn: [CLLocationCoordinate2D] = []
    private weak var map: MKMapView?
    /// FIS-B's NEXRAD from the cockpit's receiver, under the flights.
    private var nexrad: NexradMapLayer?
    /// The radar and satellite loop, just above the chart (WeatherLoopLayer).
    private var weatherLoop: WeatherLoopLayer?
    /// The advisory areas the dry run's forecast run is in (ForecastRun).
    private var forecastAreas: ForecastRunMapLayer?
    /// The model weather's field, its G-AIRMETs and the value tapped (ModelWeatherLayer).
    private var modelWeather: ModelWeatherLayer?

    func attach(_ map: MKMapView) {
        self.map = map
        map.register(TrackedRingView.self, forAnnotationViewWithReuseIdentifier: TrackedRingView.reuse)
        nexrad = MainActor.assumeIsolated { NexradMapLayer() }
        if let nexrad { MainActor.assumeIsolated { nexrad.attach(map) } }
        weatherLoop = MainActor.assumeIsolated { WeatherLoopLayer() }
        if let weatherLoop { MainActor.assumeIsolated { weatherLoop.attach(map) } }
        forecastAreas = MainActor.assumeIsolated { ForecastRunMapLayer() }
        if let forecastAreas { MainActor.assumeIsolated { forecastAreas.attach(map) } }
        modelWeather = MainActor.assumeIsolated { ModelWeatherLayer() }
        if let modelWeather { MainActor.assumeIsolated { modelWeather.attach(map) } }
    }

    func update(_ map: MKMapView, _ next: FlightLayer) {
        layer = next
        // The ring on the airplane tracked, where its report puts it.
        if let plane = next.tracked, plane.hex.lowercased() == next.trackedHex {
            let at = CLLocationCoordinate2D(latitude: plane.lat, longitude: plane.lon)
            let ring = ring ?? { let mark = TrackedRing(); self.ring = mark; map.addAnnotation(mark); return mark }()
            ring.coordinate = at
            // Kept where it is on the screen while followed, the map moved
            // by what it moved (MapCamera.keepOnScreen; the web's camera).
            if next.follow, centred?.latitude != at.latitude || centred?.longitude != at.longitude {
                MapCamera.keepOnScreen(from: centred, to: at, on: map)
            }
            centred = at
        } else if let ring {
            map.removeAnnotation(ring)
            self.ring = nil
            centred = nil
        }
        draw("path", next.path, on: map)
        draw("past", next.past, on: map, fit: true)
        draw("flown", next.flown, on: map, fit: true)
        drawGlide(next.glide, on: map)
        drawEmergency(next.emergency, on: map)
    }

    /// The line to the field picked, drawn again only where it moved.
    private func drawEmergency(_ path: [CLLocationCoordinate2D], on map: MKMapView) {
        guard !ChartMap.samePath(path, emergencyDrawn) else { return }
        emergencyDrawn = path
        if let emergencyLine { map.removeOverlay(emergencyLine) }
        emergencyLine = nil
        guard path.count >= 2 else { return }
        let line = EmergencyPolyline(coordinates: path, count: path.count)
        map.addOverlay(line, level: .aboveLabels)
        emergencyLine = line
    }

    /// The glide ring, drawn again only where it moved.
    private func drawGlide(_ ring: [CLLocationCoordinate2D], on map: MKMapView) {
        guard !ChartMap.samePath(ring, glideDrawn) else { return }
        glideDrawn = ring
        if let glideLine { map.removeOverlay(glideLine) }
        glideLine = nil
        guard ring.count >= 2 else { return }
        let line = GlidePolyline(coordinates: ring, count: ring.count)
        map.addOverlay(line, level: .aboveLabels)
        glideLine = line
    }

    /// A path in its heights' colours over a white casing, drawn again
    /// only where it changed; fitted into view once where asked.
    private func draw(_ key: String, _ path: [PathPoint], on map: MKMapView, fit: Bool = false) {
        guard drawn[key] != path else { return }
        let first = drawn[key]?.isEmpty ?? true
        drawn[key] = path
        map.removeOverlays(lines[key] ?? [])
        lines[key] = nil
        guard path.count >= 2 else { return }
        let coordinates = path.map(\.coordinate)
        var overlays: [MKPolyline] = [CasingPolyline(coordinates: coordinates, count: coordinates.count)]
        for run in HeightColour.runs(path) where run.points.count >= 2 {
            let line = HeightPolyline(coordinates: run.points, count: run.points.count)
            line.colour = HeightColour.colour(run.band)
            overlays.append(line)
        }
        map.addOverlays(overlays, level: .aboveLabels)
        lines[key] = overlays
        if fit, first, let casing = overlays.first {
            map.setVisibleMapRect(casing.boundingMapRect, edgePadding: ChartMap.routePadding(in: map), animated: MapMotion.animated)
        }
    }

    func renderer(for overlay: any MKOverlay) -> MKOverlayRenderer? {
        if let nexrad, let renderer = MainActor.assumeIsolated({ nexrad.renderer(for: overlay) }) { return renderer }
        if let weatherLoop, let renderer = MainActor.assumeIsolated({ weatherLoop.renderer(for: overlay) }) { return renderer }
        if let forecastAreas, let renderer = MainActor.assumeIsolated({ forecastAreas.renderer(for: overlay) }) { return renderer }
        if let modelWeather, let renderer = MainActor.assumeIsolated({ modelWeather.renderer(for: overlay) }) { return renderer }
        if let renderer = MainActor.assumeIsolated({ ApproachLines.renderer(for: overlay) }) { return renderer }
        if let ring = overlay as? GlidePolyline {
            // Dashed in the tint, as the web app's ring: what the airplane
            // reaches in still air, not a boundary to fly by.
            let renderer = MKPolylineRenderer(polyline: ring)
            renderer.strokeColor = UIColor.systemBlue.withAlphaComponent(0.85)
            renderer.lineWidth = 2
            renderer.lineDashPattern = [8, 6]
            return renderer
        }
        if let line = overlay as? EmergencyPolyline {
            // In the problem's red, solid: the way to the field picked.
            let renderer = MKPolylineRenderer(polyline: line)
            renderer.strokeColor = UIColor(WingtipInk.problem)
            renderer.lineWidth = 4
            renderer.lineCap = .round
            return renderer
        }
        if let casing = overlay as? CasingPolyline {
            let renderer = MKPolylineRenderer(polyline: casing)
            renderer.strokeColor = UIColor.white.withAlphaComponent(0.85)
            renderer.lineWidth = 6
            renderer.lineJoin = .round
            renderer.lineCap = .round
            return renderer
        }
        if let line = overlay as? HeightPolyline {
            let renderer = MKPolylineRenderer(polyline: line)
            renderer.strokeColor = line.colour
            renderer.lineWidth = 3
            renderer.lineJoin = .round
            renderer.lineCap = .round
            return renderer
        }
        return nil
    }

    func view(for annotation: any MKAnnotation, on map: MKMapView) -> MKAnnotationView? {
        if let modelWeather, let view = MainActor.assumeIsolated({ modelWeather.view(for: annotation, on: map) }) { return view }
        guard annotation is TrackedRing else { return nil }
        return map.dequeueReusableAnnotationView(withIdentifier: TrackedRingView.reuse, for: annotation)
    }

    /// An airplane's mark tapped: its card. True where it was one.
    func selected(_ view: MKAnnotationView, on map: MKMapView) -> Bool {
        guard let mark = view.annotation as? TrafficAnnotation else { return false }
        map.deselectAnnotation(mark, animated: false)
        layer.onTraffic?(mark.plane)
        return true
    }

    /// The pilot's own drag ends the following, as Maps' does; the map's
    /// own move to the airplane does not.
    func regionWillChange(_ map: MKMapView) {
        guard layer.follow, layer.trackedHex != nil else { return }
        let touched = map.subviews.first?.gestureRecognizers?.contains { $0.state == .began || $0.state == .changed } ?? false
        if touched { layer.onDragged?() }
    }
}
