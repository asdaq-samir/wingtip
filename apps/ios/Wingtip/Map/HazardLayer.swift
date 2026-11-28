import MapKit
import os

/// The DOF's obstacles the hazard colouring rings: only those the engine
/// levels red or amber, each a dot of a few points, as the web's
/// OBSTACLE_LAYER (3 points at zoom 9 to 6 at 13), each with a dark ring.
final class HazardObstacleOverlay: NSObject, MKOverlay, Sendable {
    let points: [(at: MKMapPoint, warning: Bool)]
    let boundingMapRect: MKMapRect
    var coordinate: CLLocationCoordinate2D { boundingMapRect.origin.coordinate }

    init(_ points: [(at: MKMapPoint, warning: Bool)]) {
        self.points = points
        let rects = points.map { MKMapRect(origin: $0.at, size: MKMapSize(width: 0, height: 0)) }
        boundingMapRect = rects.dropFirst().reduce(rects.first ?? .null) { $0.union($1) }.insetBy(dx: -50_000, dy: -50_000)
    }
}

/// Unchecked: MKOverlayRenderer is not Sendable; its brightness is in a lock.
/// At night the dots are dimmed by their colour with the chart (OverlayDim,
/// the owner's "Dim by colour" for obstacle warnings), so they keep their
/// contrast with the dimmed chart, where an opacity would wash them out.
final nonisolated class HazardObstacleRenderer: MKOverlayRenderer, NightDimmed, @unchecked Sendable {
    private let brightness = OSAllocatedUnfairLock(initialState: CGFloat(1))

    func dim(brightness next: CGFloat) {
        if brightness.withLock({ old in defer { old = next }; return old != next }) { setNeedsDisplay() }
    }

    override func draw(_ mapRect: MKMapRect, zoomScale: MKZoomScale, in context: CGContext) {
        guard let dots = overlay as? HazardObstacleOverlay else { return }
        let light = brightness.withLock { $0 }
        // The three inks worked out once a tile, not twice a dot.
        let ink = { (colour: UIColor) in (OverlayDim.colour(colour, brightness: light) ?? colour).cgColor }
        let edge = ink(WingtipColor.Chart.routeEdge), warning = ink(WingtipColor.Chart.warning), caution = ink(WingtipColor.Chart.caution)
        // The web's zoom of the view, from MapKit's 2^28-point world.
        let zoom = log2(MKMapSize.world.width * Double(zoomScale) / 256)
        let radius = (3 + 3 * min(1, max(0, (zoom - 9) / 4))) / Double(zoomScale)
        let near = mapRect.insetBy(dx: -radius * 2, dy: -radius * 2)
        // A dark ring in the course's edge colour, dimmed by colour, by
        // day and by night: a white one vanished on the sectional's white
        // paper and on the dimmed chart alike (1:1), where the dark ring
        // stands about 5:1 off the paper at the default Dimmer and keeps
        // the amber about 3:1 inside it (WCAG 2.2 1.4.11 counts the
        // adjacent edge), the amber still amber beside the red.
        context.setLineWidth(1.5 / zoomScale)
        context.setStrokeColor(edge)
        for dot in dots.points where near.contains(dot.at) {
            let centre = point(for: dot.at)
            let ring = CGRect(x: centre.x - radius, y: centre.y - radius, width: radius * 2, height: radius * 2)
            context.setFillColor(dot.warning ? warning : caution)
            context.fillEllipse(in: ring)
            context.strokeEllipse(in: ring)
        }
    }
}

/// The map's hazard colouring (TerrainHazard; the web's HazardGl): the
/// ground's tiles coloured against the engine's lines (HazardTileOverlay)
/// just over the chart, and the obstacles round the view it levels red or
/// amber over the rest, close in only. The engine is asked again only as
/// what it is asked changes (the GPS's height to 50 ft), the tiles coloured
/// again only as its lines move, and the obstacles asked for again only as
/// the view leaves their box. Part of the map's extras (MapExtrasState).
@MainActor
final class HazardLayer {
    /// Obstacles are asked for from the web's zoom 9, where a dot is more
    /// than a pixel (obstacleBox.ts).
    static let obstaclesFromZoom = 9.0

    private var input: HazardInput?
    private var view: TerrainHazard.View?
    private var tiles: HazardTileOverlay?
    private var dots: HazardObstacleOverlay?
    private var box: [Double]?
    private var obstacles: [Obstacle] = []
    private var asking: Task<Void, Never>?

    func update(_ map: MKMapView, _ asked: HazardInput) {
        if let input, input.same(asked) { return }
        let next = asked
        input = next
        let was = view
        view = next.setting == .off ? nil : try? TerrainHazard.view(setting: next.setting, clearanceFt: next.clearanceFt, speedKt: next.speedKt,
                                                                    gpsFt: next.gpsFt, plannedFt: next.plannedFt)
        guard let bands = Self.bands(view) else { return off(map) }
        if bands != Self.bands(was) || tiles == nil { paint(map, bands) }
        if was?.altitudeFt != view?.altitudeFt || was?.clearanceFt != view?.clearanceFt || dots == nil { ring(map) }
        rested(map)
    }

    /// The map rested: the obstacles round the view asked for where it has
    /// left their box, none further out than obstaclesFromZoom.
    func rested(_ map: MKMapView) {
        guard Self.bands(view) != nil else { return }
        let zoom = MapExtras.zoom(longitudeDelta: map.region.span.longitudeDelta, width: Double(map.bounds.width))
        let wanted = zoom >= Self.obstaclesFromZoom ? Self.box(map.centerCoordinate) : nil
        guard wanted != box else { return }
        box = wanted
        asking?.cancel()
        guard let wanted else { obstacles = []; return ring(map) }
        asking = Task { [weak self, weak map] in
            guard let found = try? await Planner.obstacles(south: wanted[0], west: wanted[1], north: wanted[2], east: wanted[3]),
                  !Task.isCancelled, let self, let map else { return }
            obstacles = found
            ring(map)
        }
    }

    /// The renderers this layer's overlays are drawn with.
    func renderer(for overlay: any MKOverlay) -> MKOverlayRenderer? {
        overlay is HazardObstacleOverlay ? HazardObstacleRenderer(overlay: overlay) : nil
    }

    /// The half-degree box round the view's middle, a degree each way at
    /// most, as the web asks it (obstacleBox.ts): south, west, north, east.
    static func box(_ c: CLLocationCoordinate2D) -> [Double] {
        let out = { (v: Double, up: Bool) in (up ? (v * 2).rounded(.up) : (v * 2).rounded(.down)) / 2 }
        return [out(c.latitude - 0.5, false), out(c.longitude - 0.5, false), out(c.latitude + 0.5, true), out(c.longitude + 0.5, true)]
    }

    private static func bands(_ view: TerrainHazard.View?) -> HazardBands? {
        guard let view, view.shown, let warning = view.warningFromFt, let caution = view.cautionFromFt else { return nil }
        return HazardBands(warningFt: warning, cautionFt: caution)
    }

    /// The tiles coloured for the lines: put just over the chart and its
    /// imagery the first time, reloaded by MapKit's renderer after.
    private func paint(_ map: MKMapView, _ bands: HazardBands) {
        if let tiles {
            tiles.bands = bands
            (map.renderer(for: tiles) as? MKTileOverlayRenderer)?.reloadData()
            return
        }
        let made = HazardTileOverlay()
        made.bands = bands
        let ground = map.overlays(in: .aboveLabels).lastIndex { $0 is ChartTileOverlay || $0 is CloseImageryOverlay }
        map.insertOverlay(made, at: (ground ?? -1) + 1, level: .aboveLabels)
        tiles = made
    }

    /// The obstacles' dots drawn again for the levels now.
    private func ring(_ map: MKMapView) {
        if let dots { map.removeOverlay(dots) }
        dots = nil
        guard let altitude = view?.altitudeFt, !obstacles.isEmpty,
              let levels = try? TerrainHazard.levels(of: obstacles.map { Double($0.amslFt) }, altitudeFt: altitude, clearanceFt: input?.clearanceFt)
        else { return }
        let points = zip(obstacles, levels).compactMap { obstacle, level -> (at: MKMapPoint, warning: Bool)? in
            guard level == "warning" || level == "caution" else { return nil }
            return (MKMapPoint(CLLocationCoordinate2D(latitude: obstacle.lat, longitude: obstacle.lon)), level == "warning")
        }
        guard !points.isEmpty else { return }
        let made = HazardObstacleOverlay(points)
        map.addOverlay(made, level: .aboveLabels)
        dots = made
    }

    /// The setting off, or nothing to colour against: all of it taken off.
    private func off(_ map: MKMapView) {
        asking?.cancel()
        if let tiles { map.removeOverlay(tiles) }
        if let dots { map.removeOverlay(dots) }
        tiles = nil
        dots = nil
        box = nil
        obstacles = []
    }
}
