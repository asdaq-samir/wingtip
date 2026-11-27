import MapKit
import Observation
import os
import UIKit

/// The model weather's box on the map: the picture's (FlowPaint.box), the
/// same for every hour, so one overlay stays while its renderer's picture
/// changes and nothing flickers as the timeline plays.
final class ModelWeatherOverlay: NSObject, MKOverlay {
    let box: [Double]
    let boundingMapRect: MKMapRect
    let coordinate: CLLocationCoordinate2D

    init(box: [Double]) {
        self.box = box
        let northWest = MKMapPoint(CLLocationCoordinate2D(latitude: box[3], longitude: box[0]))
        let southEast = MKMapPoint(CLLocationCoordinate2D(latitude: box[1], longitude: box[2]))
        boundingMapRect = MKMapRect(x: northWest.x, y: northWest.y, width: southEast.x - northWest.x, height: southEast.y - northWest.y)
        coordinate = CLLocationCoordinate2D(latitude: (box[1] + box[3]) / 2, longitude: (box[0] + box[2]) / 2)
    }
}

/// Draws the hour's painted picture into the box. MapKit calls draw on its
/// own queues, so the picture is held under a lock.
/// Unchecked: MKOverlayRenderer is not Sendable; the picture is in a lock.
final nonisolated class ModelWeatherRenderer: MKOverlayRenderer, NightDimmed, @unchecked Sendable {
    private let held = OSAllocatedUnfairLock<PaintedField?>(initialState: nil)
    /// The chart's brightness at night (OverlayDim), the picture's opacity
    /// times it, so the weather is no brighter than the chart under it.
    private var brightness: CGFloat = 1

    func show(_ painted: PaintedField?) {
        held.withLock { $0 = painted }
        alpha = (painted?.opacity ?? 0) * brightness
        setNeedsDisplay()
    }

    func dim(brightness: CGFloat) {
        self.brightness = brightness
        alpha = (held.withLock { $0 }?.opacity ?? 0) * brightness
    }

    override func draw(_ mapRect: MKMapRect, zoomScale: MKZoomScale, in context: CGContext) {
        guard let painted = held.withLock({ $0 }) else { return }
        // UIKit's drawing, so the picture stands north up in the map's
        // flipped context; smoothed between the grid's quarter degrees, as
        // the web's linear reading is.
        context.interpolationQuality = .medium
        UIGraphicsPushContext(context)
        UIImage(cgImage: painted.image).draw(in: rect(for: overlay.boundingMapRect))
        UIGraphicsPopContext()
    }
}

/// A G-AIRMET's outline, in its hazard's colour.
final nonisolated class AirmetLine: MKPolyline {
    var colour = WingtipColor.Weather.other
}

/// A G-AIRMET's label, AWC's short hazard name, at its outline's top.
final class AirmetLabel: NSObject, MKAnnotation {
    let coordinate: CLLocationCoordinate2D
    let text: String
    let colour: UIColor

    init(_ at: CLLocationCoordinate2D, text: String, colour: UIColor) {
        (coordinate, self.text, self.colour) = (at, text, colour)
    }
}

/// Where the pilot tapped, for the value's badge.
final class FlowPointAnnotation: NSObject, MKAnnotation {
    @objc dynamic var coordinate: CLLocationCoordinate2D

    init(_ at: CLLocationCoordinate2D) { coordinate = at }
}

/// The model weather over the chart (ModelWeather): the hour's field just
/// above the chart and under the airspace, the route and the marks, as
/// the web draws it under its "areas" slot; for an hour past on the
/// precipitation the radar's mosaic in its place; the hour's G-AIRMETs
/// dashed over it with their labels; and the badge where the pilot tapped
/// the map, a tap that found no mark.
@MainActor
final class ModelWeatherLayer: NSObject, UIGestureRecognizerDelegate {
    /// The map's model weather, the one the app shows.
    private static var models: ModelWeather { .shared }

    private weak var map: MKMapView?
    private var overlay: ModelWeatherOverlay?
    private var renderer: ModelWeatherRenderer?
    private var radar: MKTileOverlay?
    private var airmetLines: [AirmetLine] = []
    private var airmetLabels: [AirmetLabel] = []
    private var airmetsDrawn: [APIWeatherArea] = []
    private var labelsDrawn: [String: String] = [:]
    private var badge: FlowPointAnnotation?
    /// One task the layer owns, iterating Observations: every change is
    /// drawn, none lost between a change and a re-arm, and it ends with the
    /// layer.
    private var following: Task<Void, Never>?

    /// What the layer draws of the model weather, read as one value.
    private struct Shown: Sendable {
        let painted: PaintedField?, radar: String?
        let airmets: [APIWeatherArea], labels: [String: String]
        let point: CLLocationCoordinate2D?, reading: FlowReading?

        @MainActor init(_ model: ModelWeather) {
            let on = model.field != .off
            (painted, radar) = (on ? model.painted : nil, on ? model.radarTiles : nil)
            (airmets, labels) = (on ? model.airmets : [], model.airmetLabels)
            (point, reading) = (on ? model.point : nil, model.reading)
        }
    }

    func attach(_ map: MKMapView) {
        self.map = map
        map.register(AirmetLabelView.self, forAnnotationViewWithReuseIdentifier: AirmetLabelView.reuse)
        map.register(FlowBadgeView.self, forAnnotationViewWithReuseIdentifier: FlowBadgeView.reuse)
        let tap = UITapGestureRecognizer(target: self, action: #selector(tapped(_:)))
        tap.delegate = self
        tap.cancelsTouchesInView = false
        map.addGestureRecognizer(tap)
        follow()
    }

    private func follow() {
        following?.cancel()
        following = Task { [weak self] in
            let model = Self.models
            for await shown in Observations({ @MainActor in Shown(model) }) {
                guard let self else { return }
                draw(shown.painted, radar: shown.radar)
                drawAirmets(shown.airmets, labels: shown.labels)
                drawBadge(shown.point, reading: shown.reading)
            }
        }
    }

    private func draw(_ painted: PaintedField?, radar template: String?) {
        guard let map else { return }
        if let painted, overlay?.box != painted.box {
            if let overlay { map.removeOverlay(overlay) }
            let made = ModelWeatherOverlay(box: painted.box)
            overlay = made
            renderer = nil
            map.insertOverlay(made, at: Self.justAboveChart(map), level: .aboveLabels)
        } else if painted == nil, template == nil, let overlay {
            map.removeOverlay(overlay)
            self.overlay = nil
            renderer = nil
        }
        renderer?.show(painted)
        if radar?.urlTemplate != template {
            if let radar { map.removeOverlay(radar) }
            radar = template.map { url in
                let tiles = MKTileOverlay(urlTemplate: url)
                // IEM's mosaic is about a kilometre: enlarged past 10, as the loop's.
                tiles.maximumZ = 10
                tiles.canReplaceMapContent = false
                return tiles
            }
            if let radar { map.insertOverlay(radar, at: Self.justAboveChart(map), level: .aboveLabels) }
        }
    }

    /// Over the chart, which is the first overlay, and under the rest.
    private static func justAboveChart(_ map: MKMapView) -> Int { min(1, map.overlays(in: .aboveLabels).count) }

    /// The outlines and their labels: AWC's short names where the engine
    /// gave them, else the hazard as sent, the failure said in the bar
    /// (ModelWeather.airmetsProblem) rather than here.
    private func drawAirmets(_ areas: [APIWeatherArea], labels: [String: String]) {
        guard let map, areas != airmetsDrawn || labels != labelsDrawn else { return }
        (airmetsDrawn, labelsDrawn) = (areas, labels)
        map.removeOverlays(airmetLines)
        map.removeAnnotations(airmetLabels)
        airmetLines = []
        airmetLabels = []
        for area in areas {
            let ring = area.coords.compactMap { $0.count >= 2 ? CLLocationCoordinate2D(latitude: $0[0], longitude: $0[1]) : nil }
            guard ring.count >= 2, let first = ring.first else { continue }
            let closed = ring + [first]
            let line = AirmetLine(coordinates: closed, count: closed.count)
            line.colour = Self.colour(area)
            airmetLines.append(line)
            if let top = ring.max(by: { $0.latitude < $1.latitude }) {
                airmetLabels.append(AirmetLabel(top, text: labels[area.hazard ?? ""] ?? area.hazard ?? "", colour: line.colour))
            }
        }
        map.addOverlays(airmetLines, level: .aboveLabels)
        map.addAnnotations(airmetLabels)
    }

    private func drawBadge(_ point: CLLocationCoordinate2D?, reading: FlowReading?) {
        guard let map else { return }
        if let point {
            let mark = badge ?? { let made = FlowPointAnnotation(point); badge = made; map.addAnnotation(made); return made }()
            mark.coordinate = point
            (map.view(for: mark) as? FlowBadgeView)?.show(reading, dark: Self.models.field == .precip)
        } else if let badge {
            map.removeAnnotation(badge)
            self.badge = nil
        }
    }

    /// Each area's colour by what it warns of, the web's areaColour
    /// (lib/map/weatherColours): convective red-orange, icing blue,
    /// turbulence amber, IFR violet, mountains obscured stone, the winds teal.
    static func colour(_ area: APIWeatherArea) -> UIColor {
        typealias W = WingtipColor.Weather
        if area.kind == "convective" { return W.convective }
        switch area.hazard ?? "" {
        case "Icing", "ICE": return W.icing
        case "Turbulence", "TURB": return W.turbulence
        case "IFR conditions", "IFR": return W.ifr
        case "Mountains obscured", "MTN OBSCN": return W.mountains
        case "Low-level wind shear": return W.shear
        case "Strong surface winds": return W.wind
        case "ASH": return W.ash
        default: return W.other
        }
    }

    @objc private func tapped(_ tap: UITapGestureRecognizer) {
        guard let map, Self.models.field != .off, tap.state == .ended else { return }
        let at = tap.location(in: map)
        // A tap on a mark is the mark's.
        var hit = map.hitTest(at, with: nil)
        while let view = hit, view !== map {
            if view is MKAnnotationView { return }
            hit = view.superview
        }
        Self.models.tapped(map.convert(at, toCoordinateFrom: map))
    }

    func gestureRecognizer(_ g: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool { true }

    func renderer(for overlay: any MKOverlay) -> MKOverlayRenderer? {
        if let field = overlay as? ModelWeatherOverlay {
            let made = ModelWeatherRenderer(overlay: field)
            made.show(Self.models.painted)
            renderer = made
            return made
        }
        if let tiles = overlay as? MKTileOverlay, tiles === radar {
            let made = MKTileOverlayRenderer(tileOverlay: tiles)
            made.alpha = 0.75
            return made
        }
        if let line = overlay as? AirmetLine {
            // Dashed in its hazard's colour, as the map's own weather areas
            // draw a G-AIRMET, a forecast's outline.
            let made = MKPolylineRenderer(polyline: line)
            made.strokeColor = line.colour
            made.lineWidth = 1.5
            made.lineDashPattern = [4.5, 3.75]
            return made
        }
        return nil
    }

    func view(for annotation: any MKAnnotation, on map: MKMapView) -> MKAnnotationView? {
        if let label = annotation as? AirmetLabel {
            let view = map.dequeueReusableAnnotationView(withIdentifier: AirmetLabelView.reuse, for: label) as? AirmetLabelView
            view?.show(label)
            return view
        }
        if let point = annotation as? FlowPointAnnotation {
            let view = map.dequeueReusableAnnotationView(withIdentifier: FlowBadgeView.reuse, for: point) as? FlowBadgeView
            let weather = Self.models
            view?.show(weather.reading, dark: weather.field == .precip)
            return view
        }
        return nil
    }
}
