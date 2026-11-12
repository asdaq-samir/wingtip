import MapKit
import UIKit

/// A runway's extended centreline on the ground (approach_scene).
final class CentrelinePolyline: MKPolyline {}
/// The traffic pattern's ring round the field (approach_scene).
final class PatternRing: MKCircle {}

/// The way in to the route's destination in 3D, as the web's ApproachGl
/// draws it, on the ground: each runway's extended centreline dashed in
/// white, as a runway's own centreline is painted, and the pattern's ring
/// in the pattern's teal. Every figure is the engine's `approach_scene`
/// (the centrelines' lengths, the ring's radius and altitude, each sourced
/// in engine/crates/route/src/approach/scene.rs); this only draws them.
/// MapKit has no altitude for an overlay (an MKPolyline's points are
/// latitude and longitude), so the glidepath and the approach at their
/// altitudes, and the ring at the pattern's, cannot stand in the air as
/// they do on the web: the ring is drawn where it is, on the ground, and
/// the glidepath, which would lie on its centreline, is left out.
@MainActor
final class ApproachLines {
    private var field: String?
    private var drawn: [any MKOverlay] = []
    private var asking: Task<Void, Never>?

    /// Shown for `ident`, or taken off with nil.
    func show(_ ident: String?, on map: MKMapView) {
        guard ident != field else { return }
        field = ident
        asking?.cancel()
        map.removeOverlays(drawn)
        drawn = []
        guard let ident else { return }
        asking = Task { [weak self, weak map] in
            guard let place = try? await Planner.place(ident), !Task.isCancelled,
                  let self, let map, self.field == ident,
                  let scene = try? Self.scene(place)
            else { return }
            drawn = Self.overlays(scene)
            map.addOverlays(drawn, level: .aboveRoads)
        }
    }

    /// The engine's scene for a field, from its card's answer, as the web's
    /// approachScene asks it: its open runways and their ends.
    nonisolated static func scene(_ place: AirportPlace) throws -> EngineContract.ApproachSceneAnswer {
        let runways = place.runways.filter { !$0.closed }.map { runway in
            EngineContract.ApproachSceneInputRunwaysItem(
                lengthFt: runway.lengthFt.map(Double.init),
                runwayEnds: (runway.runwayEnds ?? []).map {
                    EngineContract.ApproachSceneInputRunwaysItemRunwayEndsItem(ident: $0.ident, lat: $0.lat, lon: $0.lon, headingTrueDeg: $0.headingTrueDeg)
                })
        }
        return try Engine.approachScene(lat: place.lat, lon: place.lon, elevationFt: place.elevationFt,
                                        patternFt: place.pattern?.altitudeFt, runways: runways, drawing: nil)
    }

    /// The engine's [lat, lon, ...] as a place.
    nonisolated static func coordinate(_ point: [JSONValue]) -> CLLocationCoordinate2D? {
        guard point.count >= 2, case .number(let lat) = point[0], case .number(let lon) = point[1] else { return nil }
        return CLLocationCoordinate2D(latitude: lat, longitude: lon)
    }

    /// One international nautical mile, 1,852 m exactly (NIST Handbook 44, Appendix C).
    nonisolated static let metresPerNm = 1852.0

    nonisolated static func overlays(_ scene: EngineContract.ApproachSceneAnswer) -> [any MKOverlay] {
        var out: [any MKOverlay] = scene.centrelines.compactMap { line in
            let points = line.points.compactMap(coordinate)
            return points.count >= 2 ? CentrelinePolyline(coordinates: points, count: points.count) : nil
        }
        if let ring = scene.ring, let middle = coordinate(ring.center) {
            out.append(PatternRing(center: middle, radius: ring.radiusNm * metresPerNm))
        }
        return out
    }

    static func renderer(for overlay: any MKOverlay) -> MKOverlayRenderer? {
        if let line = overlay as? CentrelinePolyline {
            let renderer = MKPolylineRenderer(polyline: line)
            renderer.strokeColor = WingtipColor.Chart.centreline.withAlphaComponent(0.9)
            renderer.lineWidth = 2
            renderer.lineDashPattern = [8, 6]
            return renderer
        }
        if let ring = overlay as? PatternRing {
            let renderer = MKCircleRenderer(circle: ring)
            renderer.strokeColor = WingtipColor.Chart.pattern.withAlphaComponent(0.9)
            renderer.lineWidth = 2
            return renderer
        }
        return nil
    }
}
