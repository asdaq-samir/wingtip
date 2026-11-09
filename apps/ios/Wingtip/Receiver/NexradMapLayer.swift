import MapKit
import Observation
import UIKit

/// One NEXRAD level's rectangles as one shape, so the map draws seven
/// overlays however many bins the receiver was sent.
final class NexradLevelOverlay: MKMultiPolygon {
    var level = 1
}

/// FIS-B's NEXRAD over the chart (the engine's `receiver_nexrad`): each
/// level's rectangles in its token's colour, under the labels and
/// see-through, so the chart reads under it. Redrawn whenever the
/// receiver's picture brings or drops a block. Not for avoiding weather
/// close in: FIS-B's NEXRAD is minutes old (AIM 4-5-9's table, a regional
/// image every 2.5 minutes).
@MainActor
final class NexradMapLayer {
    private weak var map: MKMapView?
    private var shown: [NexradLevelOverlay] = []

    /// Each level's colour, design/tokens.json's chart.nexrad-1 to -7.
    static let inks: [UIColor] = [WingtipColor.Chart.nexrad1, WingtipColor.Chart.nexrad2, WingtipColor.Chart.nexrad3,
                                  WingtipColor.Chart.nexrad4, WingtipColor.Chart.nexrad5, WingtipColor.Chart.nexrad6,
                                  WingtipColor.Chart.nexrad7]

    func attach(_ map: MKMapView) {
        self.map = map
        follow()
    }

    /// Draw now, and again when the receiver's NEXRAD changes.
    private func follow() {
        withObservationTracking {
            draw(Receiver.shared.nexrad)
        } onChange: { [weak self] in
            Task { @MainActor in self?.follow() }
        }
    }

    private func draw(_ nexrad: EngineContract.ReceiverNexradAnswer?) {
        guard let map else { return }
        map.removeOverlays(shown)
        shown = Self.overlays(nexrad)
        map.addOverlays(shown, level: .aboveRoads)
    }

    /// One overlay a level that has rectangles.
    static func overlays(_ nexrad: EngineContract.ReceiverNexradAnswer?) -> [NexradLevelOverlay] {
        (nexrad?.levels ?? []).compactMap { level in
            let polygons = level.rects.compactMap { r -> MKPolygon? in
                guard r.count == 4 else { return nil }
                let (south, west, north, east) = (r[0], r[1], r[2], r[3])
                let corners = [CLLocationCoordinate2D(latitude: south, longitude: west), CLLocationCoordinate2D(latitude: north, longitude: west),
                               CLLocationCoordinate2D(latitude: north, longitude: east), CLLocationCoordinate2D(latitude: south, longitude: east)]
                return MKPolygon(coordinates: corners, count: 4)
            }
            guard !polygons.isEmpty else { return nil }
            let overlay = NexradLevelOverlay(polygons)
            overlay.level = Int(level.level)
            return overlay
        }
    }

    func renderer(for overlay: any MKOverlay) -> MKOverlayRenderer? {
        guard let level = overlay as? NexradLevelOverlay else { return nil }
        let renderer = MKMultiPolygonRenderer(multiPolygon: level)
        renderer.fillColor = Self.inks[min(max(level.level, 1), 7) - 1].withAlphaComponent(0.5)
        renderer.strokeColor = nil
        renderer.lineWidth = 0
        return renderer
    }
}
