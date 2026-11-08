import CoreImage
import Foundation
import MapKit
import OSLog
import UIKit

/// The FAA chart as the map's ground: an MKTileOverlay over Apple's map,
/// which shows only close in (ChartFade), drawing 512-point tiles, each
/// composed of four of the pyramid's 256-pixel tiles one level finer. On a 3x screen a 256-point tile is scaled up
/// three times and a phone's screen needs about 55 of them; a 512-point
/// tile is scaled 1.5 times and the screen needs about 18, so the chart
/// is sharper and MapKit has a third of the tiles to place (the owner's
/// ask, 2026-11-03: the native app fast and sharp). The pyramid on disk
/// and on the CDN is unchanged.
///
/// A tile is answered from memory (TileCache, the composed tiles), else
/// composed from the children in the store on disk, else from the
/// network, the children kept on disk as they come so the chart a pilot
/// looked at is there in the air. A tile asked for twice while it loads
/// is fetched once. Each load is a signpost interval ("tile") under the
/// app's "tiles" log category, so Instruments and the runner's logs show
/// where a pan's time goes and which level answered.
///
/// By day each composed tile is given the web map's lift (glStyle.ts
/// chartPaint: raster-contrast and raster-saturation 0.1, the owner's
/// pick beside ForeFlight's chart, 2026-11-07), so the paper reads as
/// crisply here as there; at night, dimmed, it is left as printed.
///
/// Close in, past the chart's own scale, Apple's map is under it
/// (canReplaceMapContent off) and the chart fades out over a level
/// (ChartFade), as the web map's street map fades in over it: the
/// runways (RunwaySurface) then lie on Apple's roads and buildings.
final class ChartTileOverlay: MKTileOverlay {
    let template: TileTemplate
    /// The day's lift (ChartLift) put on each tile as it is composed.
    let lift: Bool
    /// Told on the main queue as each tile is answered with a picture: the
    /// map shows itself once the chart is drawn (ChartMap's reveal).
    var onTile: (@MainActor @Sendable () -> Void)?
    let store: TileStore
    private let cache: TileCache
    private let session = URLSession(configuration: .default)
    private let signposter = OSSignposter(subsystem: "app.wingtipmaps.ios", category: "tiles")
    /// The loads under way, by tile, with everyone waiting for each: a
    /// pan that asks for a tile twice before it is in gets one fetch.
    // Unchecked state, as the waiting closures are not Sendable: the lock
    // is what makes them safe to hold and hand back.
    private let inFlight = OSAllocatedUnfairLock(uncheckedState: [String: [(Data?, (any Error)?) -> Void]]())

    /// The pyramid's zooms, kept: a 512-point tile at the overlay's z is
    /// made of the pyramid's tiles at z + 1, so the overlay's levels are
    /// the pyramid's less one, and its finest tile is made of the
    /// pyramid's finest.
    let pyramidMinZoom: Int
    let pyramidMaxZoom: Int

    init(template: TileTemplate, minZoom: Int, maxZoom: Int, lift: Bool = true, store: TileStore = .shared, cache: TileCache = .shared) {
        self.template = template
        self.lift = lift
        self.store = store
        self.cache = cache
        self.pyramidMinZoom = minZoom
        self.pyramidMaxZoom = maxZoom
        super.init(urlTemplate: nil)
        // Apple's map under the chart, for the close zoom where the chart
        // fades (ChartFade); its points of interest are off (ChartMap).
        canReplaceMapContent = false
        tileSize = CGSize(width: ChartTileOverlay.side, height: ChartTileOverlay.side)
        minimumZ = max(0, minZoom - 1)
        maximumZ = maxZoom - 1
    }

    /// The composed tile's side in points, and the pyramid's tiles' in pixels.
    static let side = 512
    static let childSide = 256

    override func url(forTilePath path: MKTileOverlayPath) -> URL {
        // The pyramid's own address of the top-left child, for anything
        // that asks (MapKit does not: loadTile answers every tile here).
        template.url(z: path.z + 1, x: path.x * 2, y: path.y * 2)
    }

    override func loadTile(at path: MKTileOverlayPath, result: @escaping (Data?, (any Error)?) -> Void) {
        let (z, x, y) = (path.z, path.x, path.y)
        let key = TileCache.key(cycle: template.cycle, kind: template.kind + (lift ? "+lift" : ""), z: z, x: x, y: y, scale: template.scale)
        let signpostID = signposter.makeSignpostID()
        let interval = signposter.beginInterval("tile", id: signpostID, "\(z)/\(x)/\(y)")
        if let kept = cache.read(key) {
            signposter.endInterval("tile", interval, "memory")
            result(kept, nil)
            if let onTile { Task { @MainActor in onTile() } }
            return
        }
        // Only the first asker loads; the rest are answered with it.
        let first = inFlight.withLockUnchecked { waiting -> Bool in
            if waiting[key] != nil {
                waiting[key]!.append(result)
                return false
            }
            waiting[key] = [result]
            return true
        }
        guard first else { return }
        let template = template, store = store, cache = cache, session = session, signposter = signposter, lift = lift
        let inFlight = inFlight, onTile = onTile
        Task.detached(priority: .userInitiated) {
            var fromNetwork = false
            // The four pyramid tiles one level finer, in reading order:
            // top-left, top-right, bottom-left, bottom-right.
            let children = [(2 * x, 2 * y), (2 * x + 1, 2 * y), (2 * x, 2 * y + 1), (2 * x + 1, 2 * y + 1)]
            var images: [UIImage?] = Array(repeating: nil, count: 4)
            await withTaskGroup(of: (Int, Data?, Bool).self) { group in
                for (i, (cx, cy)) in children.enumerated() {
                    group.addTask {
                        if let kept = store.read(cycle: template.cycle, kind: template.kind, z: z + 1, x: cx, y: cy, scale: template.scale) {
                            return (i, kept, false)
                        }
                        guard let (data, response) = try? await session.data(from: template.url(z: z + 1, x: cx, y: cy)),
                              (response as? HTTPURLResponse)?.statusCode == 200 else {
                            // A tile the chart has none of (the sea, past the
                            // country's edge) stays blank: no error on the map.
                            return (i, nil, true)
                        }
                        store.write(data, cycle: template.cycle, kind: template.kind, z: z + 1, x: cx, y: cy, scale: template.scale)
                        return (i, data, true)
                    }
                }
                for await (i, data, fetched) in group {
                    if fetched { fromNetwork = true }
                    if let data { images[i] = UIImage(data: data) }
                }
            }
            let composed = images.contains(where: { $0 != nil }) ? ChartTileOverlay.compose(images, scale: template.scale, lift: lift) : nil
            if let composed { cache.write(composed, for: key) }
            // Where the tile came from, as a value: a signpost's message is
            // an OSLogMessage, which a ternary of literals cannot build.
            let source = fromNetwork ? "network" : (composed == nil ? "none" : "disk")
            signposter.endInterval("tile", interval, "\(source, privacy: .public)")
            let waiting = inFlight.withLockUnchecked { waiting -> [(Data?, (any Error)?) -> Void] in
                waiting.removeValue(forKey: key) ?? []
            }
            for answer in waiting { answer(composed, nil) }
            if composed != nil, let onTile { await MainActor.run { onTile() } }
        }
    }

    /// One 512-point tile from its four children, each in its quadrant;
    /// a child missing leaves its quadrant clear. Drawn with UIKit's
    /// renderer at scale 1, so a pixel of the pyramid is a pixel here --
    /// 512 of them on a side, or 1024 from the 512-pixel children of
    /// `scale` 2 -- and encoded as PNG, which MapKit decodes as it does a
    /// fetched tile, laying it out in the overlay's 512 points. With
    /// `lift`, the day's contrast and colour (ChartLift) put on it.
    nonisolated static func compose(_ children: [UIImage?], scale: Int = 1, lift: Bool = false) -> Data? {
        let side = CGFloat(ChartTileOverlay.side * scale), half = CGFloat(ChartTileOverlay.childSide * scale)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = false
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: side, height: side), format: format)
        let image = renderer.image { _ in
            let places = [CGPoint(x: 0, y: 0), CGPoint(x: half, y: 0), CGPoint(x: 0, y: half), CGPoint(x: half, y: half)]
            for (child, place) in zip(children, places) {
                child?.draw(in: CGRect(origin: place, size: CGSize(width: half, height: half)))
            }
        }
        return ((lift ? ChartLift.apply(image) : nil) ?? image).pngData()
    }
}

/// The day chart's lift, the web map's (glStyle.ts chartPaint, DAY_CONTRAST
/// and DAY_SATURATION 0.1): MapLibre's raster-contrast c scales each
/// channel about the middle grey by 1 / (1 - c), and its raster-saturation
/// s moves each away from the pixel's grey by 1 / (1 - s); Core Image's
/// colour controls do both, the grey by luminance rather than the plain
/// mean, a difference under a step of the eye on the chart's inks.
enum ChartLift {
    static let contrast = 1 / (1 - 0.1)
    static let saturation = 1 / (1 - 0.1)
    /// One context for every tile, as Core Image asks: making one is the
    /// costly part.
    private static let context = CIContext(options: [.cacheIntermediates: false])

    nonisolated static func apply(_ image: UIImage) -> UIImage? {
        guard let input = image.cgImage.map({ CIImage(cgImage: $0) }),
              let filter = CIFilter(name: "CIColorControls") else { return nil }
        filter.setValue(input, forKey: kCIInputImageKey)
        filter.setValue(contrast, forKey: kCIInputContrastKey)
        filter.setValue(saturation, forKey: kCIInputSaturationKey)
        guard let output = filter.outputImage, let drawn = context.createCGImage(output, from: input.extent) else { return nil }
        return UIImage(cgImage: drawn)
    }
}

/// How much of the chart shows at a zoom (the web map's, in Leaflet's
/// levels as MapExtras.zoom gives them): all of it to 13, where the
/// chart's own last level is already enlarged and its runways under a
/// pixel or two, then less over one level, to none from 14, where Apple's
/// map under it and the FAA runways (RunwaySurface) are the map, as the
/// web map's street map fades in over the chart from MapLibre's 12 to 13
/// (glOverlays' RUNWAYS_FROM; MapLibre's levels are Leaflet's less one).
enum ChartFade {
    static let from = 13.0
    static let to = 14.0

    static func alpha(zoom: Double) -> CGFloat {
        CGFloat(min(1, max(0, (to - zoom) / (to - from))))
    }
}
