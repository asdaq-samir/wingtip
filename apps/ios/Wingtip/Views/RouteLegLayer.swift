import MapKit
import UIKit

/// What the map needs of the route's legs: each leg's ends, the one whose
/// sheet is open, and what a tap on the course opens.
struct RouteLegInput {
    var legs: [RouteLegs.MapLeg] = []
    var selected: Int?
    var onSelect: ((Int) -> Void)?
}

/// The green either side of the selected leg's magenta, as ForeFlight
/// cases a selected course (NightPalette.routeGreen).
final class LegCasingPolyline: MKPolyline {}

/// The map's part for the legs, kept by ChartMap's coordinator: a tap
/// near the course opens the nearest leg's sheet (RouteLegs.nearest), and
/// the leg open is cased in green, the only one (the owner, 2026-11-09:
/// ForeFlight shows the green only on a selected course).
@MainActor
final class RouteLegLayer: NSObject, UIGestureRecognizerDelegate {
    private var input = RouteLegInput()
    private var casing: LegCasingPolyline?
    private var casingRenderer: MKPolylineRenderer?
    private var drawn: RouteLegs.MapLeg?
    private var night = false

    override nonisolated init() { super.init() }

    func attach(_ map: MKMapView) {
        let tap = UITapGestureRecognizer(target: self, action: #selector(tapped(_:)))
        tap.cancelsTouchesInView = false
        tap.delegate = self
        map.addGestureRecognizer(tap)
    }

    /// Along with MapKit's own taps, which select a field's mark.
    nonisolated func gestureRecognizer(_ a: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith b: UIGestureRecognizer) -> Bool { true }

    @objc private func tapped(_ tap: UITapGestureRecognizer) {
        guard let map = tap.view as? MKMapView, let onSelect = input.onSelect else { return }
        let at = tap.location(in: map)
        // A tap on a mark is the mark's, not the course's under it.
        if map.hitTest(at, with: nil).map({ $0 is MKAnnotationView || $0.superview is MKAnnotationView }) == true { return }
        if let index = leg(at, on: map) { onSelect(index) }
    }

    /// Whether a point of the map is close enough to the course for a
    /// tap there to be the course's (PlateLayer asks, so a leg's card wins
    /// over the plate's page under it).
    func hits(_ at: CGPoint, on map: MKMapView) -> Bool { input.onSelect != nil && leg(at, on: map) != nil }

    private func leg(_ at: CGPoint, on map: MKMapView) -> Int? {
        guard !input.legs.isEmpty else { return nil }
        let segments = input.legs.map { (map.convert($0.start, toPointTo: map), map.convert($0.end, toPointTo: map)) }
        return RouteLegs.nearest(to: at, segments: segments)
    }

    func update(_ map: MKMapView, _ next: RouteLegInput, night: Bool, below edge: (any MKOverlay)?) {
        input = next
        if night != self.night {
            self.night = night
            casingRenderer?.strokeColor = NightPalette.routeGreen(night: night)
            casingRenderer?.setNeedsDisplay()
        }
        let leg = next.selected.flatMap { i in next.legs.indices.contains(i) ? next.legs[i] : nil }
        guard leg != drawn else { return }
        drawn = leg
        if let casing { map.removeOverlay(casing) }
        casing = nil
        guard let leg else { return }
        var ends = [leg.start, leg.end]
        let line = LegCasingPolyline(coordinates: &ends, count: 2)
        // Under the course's edge and magenta.
        if let edge { map.insertOverlay(line, below: edge) } else { map.addOverlay(line, level: .aboveLabels) }
        casing = line
    }

    func renderer(for overlay: any MKOverlay) -> MKOverlayRenderer? {
        guard let casing = overlay as? LegCasingPolyline else { return nil }
        let renderer = MKPolylineRenderer(polyline: casing)
        renderer.strokeColor = NightPalette.routeGreen(night: night)
        // Wider than the edge (ChartMap's edgeWidth), so the green shows
        // either side of it.
        renderer.lineWidth = ChartMap.Coordinator.edgeWidth + 5
        renderer.lineCap = .round
        renderer.lineJoin = .round
        casingRenderer = renderer
        return renderer
    }
}
