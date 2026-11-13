import MapKit
import Observation
import os

/// One frame's picture as tiles: the radar's from IEM by z, x and y, the
/// satellite's from nowCOAST's WMS by the tile's box in web Mercator
/// metres, `{bbox-epsg-3857}` in its template (wingtip.weather_loop),
/// which MapKit does not fill itself. Counts its tiles in flight, so the
/// loop knows when the frames have loaded (LoopTiles).
final class LoopTileOverlay: MKTileOverlay, @unchecked Sendable {
    let key: String
    let radar: Bool

    init(template: String, key: String, radar: Bool) {
        self.key = key
        self.radar = radar
        super.init(urlTemplate: template)
        canReplaceMapContent = false
        // IEM's mosaic is about a kilometre, nowCOAST's infrared two:
        // nearer in, the last tiles are enlarged (the web's maxzoom).
        maximumZ = radar ? 10 : 9
    }

    override func url(forTilePath path: MKTileOverlayPath) -> URL {
        guard let template = urlTemplate, template.contains("{bbox-epsg-3857}") else { return super.url(forTilePath: path) }
        let m = TileMath.metres(z: path.z, x: path.x, y: path.y)
        let box = "\(m.west),\(m.south),\(m.east),\(m.north)"
        return URL(string: template.replacingOccurrences(of: "{bbox-epsg-3857}", with: box)) ?? super.url(forTilePath: path)
    }

    override func loadTile(at path: MKTileOverlayPath, result: @escaping @Sendable (Data?, (any Error)?) -> Void) {
        LoopTiles.shared.began()
        let address = url(forTilePath: path)
        super.loadTile(at: path) { data, error in
            LoopTiles.shared.ended()
            // With no signal, the radar's newest frame as Keep for the Air
            // kept it along the route (KeepRadar), where it was.
            if data == nil, let kept = KeptForAir.picture(KeepRadar.key(address)) {
                result(kept, nil)
            } else {
                result(data, error)
            }
        }
    }
}

/// How many of the loop's tiles are in flight, and how many have come
/// since the frames were last put on the map.
final class LoopTiles: Sendable {
    static let shared = LoopTiles()
    private let state = OSAllocatedUnfairLock(initialState: (pending: 0, done: 0))

    func began() { state.withLock { $0.pending += 1 } }
    func ended() { state.withLock { $0.pending -= 1; $0.done += 1 } }
    func reset() { state.withLock { $0.done = 0 } }
    /// Some tiles came and none is still coming.
    var settled: Bool { state.withLock { $0.pending <= 0 && $0.done > 0 } }
}

/// The radar and satellite loop over the chart (WeatherLoop): every frame
/// a tile overlay of its own just above the chart, all on the map at once
/// so each one's tiles load ahead, the one shown at its alpha and the rest
/// clear -- a swap of alphas between loaded overlays, which does not
/// flicker. Tells the loop when the frames have loaded, or when eight
/// seconds have passed with some still coming (the web's PRELOAD_CAP_MS).
@MainActor
final class WeatherLoopLayer {
    private weak var map: MKMapView?
    private var overlays: [String: LoopTileOverlay] = [:]
    private var renderers: [String: MKTileOverlayRenderer] = [:]
    private var watching: Task<Void, Never>?

    /// How strongly each picture is drawn: the satellite's cloud under,
    /// the radar's echoes over, the chart read through both (the web's).
    static let radarAlpha: CGFloat = 0.6, satelliteAlpha: CGFloat = 0.45
    static let preloadCap: Duration = .seconds(8)

    func attach(_ map: MKMapView) {
        self.map = map
        follow()
    }

    private func follow() {
        withObservationTracking {
            let loop = WeatherLoop.shared
            draw(loop.kind == .off ? [] : loop.frames, shown: loop.shown, ready: loop.ready)
        } onChange: { [weak self] in
            Task { @MainActor in self?.follow() }
        }
    }

    private func draw(_ frames: [APILoopFrame], shown: Int, ready: Bool) {
        guard let map else { return }
        var wanted: [String: (template: String, radar: Bool, frame: Int)] = [:]
        for (i, frame) in frames.enumerated() {
            if let tiles = frame.satelliteTiles { wanted["sat-\(frame.valid)"] = (tiles, false, i) }
            if let tiles = frame.radarTiles { wanted["radar-\(frame.valid)"] = (tiles, true, i) }
        }
        let gone = overlays.filter { wanted[$0.key] == nil }
        map.removeOverlays(Array(gone.values))
        for key in gone.keys {
            overlays[key] = nil
            renderers[key] = nil
        }
        // The radar's over the satellite's, both just above the chart (at
        // 0) and under every line drawn on it.
        let added = wanted.filter { overlays[$0.key] == nil }.sorted { $0.value.radar && !$1.value.radar }
        if !added.isEmpty { LoopTiles.shared.reset() }
        for (key, want) in added {
            let overlay = LoopTileOverlay(template: want.template, key: key, radar: want.radar)
            overlays[key] = overlay
            map.insertOverlay(overlay, at: min(1, map.overlays(in: .aboveLabels).count), level: .aboveLabels)
        }
        for (key, renderer) in renderers {
            renderer.alpha = wanted[key]?.frame == shown ? Self.alpha(radar: overlays[key]?.radar ?? true) : 0
        }
        if !ready, !frames.isEmpty { watchLoading() }
    }

    /// Asked a few times a second until the tiles have come or the cap.
    private func watchLoading() {
        guard watching == nil else { return }
        watching = Task { [weak self] in
            let start = ContinuousClock.now
            while !Task.isCancelled, ContinuousClock.now - start < Self.preloadCap {
                try? await Task.sleep(for: .milliseconds(250))
                if LoopTiles.shared.settled { break }
            }
            WeatherLoop.shared.loaded()
            self?.watching = nil
        }
    }

    private static func alpha(radar: Bool) -> CGFloat { radar ? radarAlpha : satelliteAlpha }

    func renderer(for overlay: any MKOverlay) -> MKOverlayRenderer? {
        guard let tiles = overlay as? LoopTileOverlay else { return nil }
        let renderer = MKTileOverlayRenderer(tileOverlay: tiles)
        let loop = WeatherLoop.shared
        let frame = loop.frames.firstIndex { tiles.key.hasSuffix($0.valid) }
        renderer.alpha = frame == loop.shown ? Self.alpha(radar: tiles.radar) : 0
        renderers[tiles.key] = renderer
        return renderer
    }
}
