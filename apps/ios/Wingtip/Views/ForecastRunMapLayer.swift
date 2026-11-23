import MapKit
import Observation
import SwiftUI
import UIKit

/// An advisory area the forecast run is in, with its kind for its look.
final class RunAreaPolygon: MKPolygon {
    var kind = ""
}

/// The advisory areas in force at the dry run's time while forecast mode
/// is on (ForecastRun.areas): each a filled outline, a SIGMET in the
/// problem's red, a G-AIRMET or the SPC's outlook in the caution's amber,
/// a G-AIRMET's outline dashed as a forecast's is on the web's map (WeatherGl).
/// Drawn again only when the areas in force change, not each tick.
@MainActor
final class ForecastRunMapLayer {
    private weak var map: MKMapView?
    private var shown: [RunAreaPolygon] = []
    private var drawn: [APIRunArea] = []
    /// One task the layer owns, iterating Observations: every change is
    /// drawn, none lost between a change and a re-arm, and it ends with the
    /// layer.
    private var following: Task<Void, Never>?

    func attach(_ map: MKMapView) {
        self.map = map
        follow()
    }

    private func follow() {
        following?.cancel()
        following = Task { [weak self] in
            for await areas in Observations({ @MainActor in ForecastRun.shared.areas }) {
                guard let self else { return }
                draw(areas)
            }
        }
    }

    private func draw(_ areas: [APIRunArea]) {
        guard let map, areas != drawn else { return }
        drawn = areas
        map.removeOverlays(shown)
        shown = Self.overlays(areas)
        map.addOverlays(shown, level: .aboveRoads)
    }

    /// One polygon an area with an outline to draw.
    static func overlays(_ areas: [APIRunArea]) -> [RunAreaPolygon] {
        areas.compactMap { area in
            let ring = area.coords.compactMap { $0.count == 2 ? CLLocationCoordinate2D(latitude: $0[0], longitude: $0[1]) : nil }
            guard ring.count >= 3 else { return nil }
            let polygon = RunAreaPolygon(coordinates: ring, count: ring.count)
            polygon.kind = area.kind
            return polygon
        }
    }

    func renderer(for overlay: any MKOverlay) -> MKOverlayRenderer? {
        guard let area = overlay as? RunAreaPolygon else { return nil }
        let renderer = MKPolygonRenderer(polygon: area)
        let ink = UIColor(area.kind == "sigmet" ? WingtipInk.problem : WingtipInk.caution)
        renderer.fillColor = ink.withAlphaComponent(0.12)
        renderer.strokeColor = ink
        renderer.lineWidth = 2
        if area.kind == "gairmet" { renderer.lineDashPattern = [6, 5] }
        return renderer
    }
}
