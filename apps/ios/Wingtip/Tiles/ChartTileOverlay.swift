import CoreImage
import Foundation
import ImageIO
import MapKit
import OSLog
import UIKit

/// The FAA chart as the map's ground: an overlay over Apple's map, drawn
/// by a renderer of the app's own (ChartTileRenderer) rather than
/// MapKit's tile overlay. MKTileOverlayRenderer lays a tile's picture one
/// pixel to a point whatever its size or density, so on a 3x screen the
/// chart was at best a third of the screen's pixels, and the pyramid's
/// 512-pixel @2x tiles (#510) could not be used at all: a tile of them
/// was drawn twice too large from its corner, Beloit's chart under
/// O'Hare's position (#549, the simulator, 2026-11-08). Drawing each
/// tile's image into its own map rect with Core Graphics puts all its
/// pixels on the screen, as sharp as ForeFlight's chart.
///
/// Close in, past the chart's own last level, it fades out over a level
/// (ChartFade) into the USGS's aerial imagery under it (CloseImagery), as
/// the web map's does, Apple's map under both (canReplaceMapContent off)
/// where the USGS has none: the runways (RunwaySurface) lie on the real ones.
final class ChartTileOverlay: NSObject, MKOverlay, @unchecked Sendable {
    let template: TileTemplate
    /// The day's lift (ChartLift) put on each tile as it is decoded.
    let lift: Bool
    /// The pyramid's levels: none is drawn coarser than a level above the
    /// first, and past the last the last is enlarged.
    let minZoom: Int
    let maxZoom: Int
    let store: TileStore
    let cache: TileCache
    /// Told on the main queue as each tile is answered with a picture: the
    /// map shows itself once the chart is drawn (ChartMap's reveal).
    var onTile: (@MainActor @Sendable () -> Void)?

    // The whole world: the renderer works out the tiles a rect needs.
    let coordinate = CLLocationCoordinate2D(latitude: 0, longitude: 0)
    let boundingMapRect = MKMapRect.world
    // Apple's map under the chart and the imagery, where the USGS has
    // none close in (CloseImagery); its points of interest are off (ChartMap).
    func canReplaceMapContent() -> Bool { false }

    init(template: TileTemplate, minZoom: Int, maxZoom: Int, lift: Bool = true, store: TileStore = .shared, cache: TileCache = .shared) {
        self.template = template
        self.lift = lift
        self.minZoom = minZoom
        self.maxZoom = maxZoom
        self.store = store
        self.cache = cache
    }
}

/// A tile of the pyramid: its level, column and row, as the web map and
/// the planner address them ({z}/{x}/{y}, KeepRoute.tile).
struct ChartTile: Hashable, Sendable {
    let z: Int
    let x: Int
    let y: Int
}

/// The arithmetic between MapKit's map and the pyramid. MapKit's world is
/// a Web Mercator square MKMapSize.world.width (2^28) map points wide;
/// the pyramid's level z cuts the same square into 2^z tiles a side, so a
/// tile's map rect is exact and the chart lies where the position dot
/// and the airspace (both MKMapPoints) say.
enum ChartTileMath {
    /// The most a tile's pixel is stretched over the screen's pixels
    /// before a level finer is drawn: 1.5, so a 3x screen draws the
    /// 512-pixel tile from the moment it covers 768 of its pixels, never
    /// enlarged more than half again; a 2x screen a little over half a
    /// level later. A finer level from 1.0 would draw twice the tiles for
    /// a difference under the eye's.
    static let mostStretch = 1.5

    /// A tile's side in map points at level z.
    static func side(z: Int) -> Double {
        MKMapSize.world.width / pow(2, Double(z))
    }

    /// The level whose tiles' pixels best fill the screen at `zoomScale`
    /// (screen points to a map point), for a screen of `screenScale`
    /// pixels a point and tiles of 256 × `tileScale` pixels; nil where the
    /// view is wider than a level above the pyramid's first, the chart not
    /// drawn there (as the tile overlay's minimumZ had it); the pyramid's
    /// last past its end, enlarged.
    static func level(zoomScale: Double, screenScale: Double, tileScale: Int, minZoom: Int, maxZoom: Int) -> Int? {
        guard zoomScale > 0 else { return nil }
        // The level whose 256-point tiles are 256 points on the screen,
        // fractional: 20 + log2(zoomScale) on MapKit's 2^28 world.
        let natural = log2(MKMapSize.world.width * zoomScale / 256)
        guard natural >= Double(minZoom) - 1 else { return nil }
        // A tile at z is 256·2^(natural - z) points, screenScale times
        // that in pixels, over its 256·tileScale: its stretch is
        // (screenScale / tileScale)·2^(natural - z), at most mostStretch.
        // A hair under a whole level stays on it: no rounding error sends a
        // view at exactly a level's scale a level finer.
        let finest = natural + log2(screenScale / Double(max(1, tileScale)) / mostStretch)
        return min(max(Int((finest - 1e-6).rounded(.up)), minZoom), maxZoom)
    }

    /// The tiles of level z that a map rect touches, clamped to the world.
    static func tiles(in rect: MKMapRect, z: Int) -> [ChartTile] {
        let span = side(z: z), n = 1 << z
        let x0 = max(0, Int((rect.minX / span).rounded(.down))), x1 = min(n - 1, Int((rect.maxX / span).rounded(.up)) - 1)
        let y0 = max(0, Int((rect.minY / span).rounded(.down))), y1 = min(n - 1, Int((rect.maxY / span).rounded(.up)) - 1)
        guard x0 <= x1, y0 <= y1 else { return [] }
        var out: [ChartTile] = []
        out.reserveCapacity((x1 - x0 + 1) * (y1 - y0 + 1))
        for y in y0...y1 { for x in x0...x1 { out.append(ChartTile(z: z, x: x, y: y)) } }
        return out
    }

    /// A tile's square in MapKit's map points.
    static func mapRect(_ tile: ChartTile) -> MKMapRect {
        let span = side(z: tile.z)
        return MKMapRect(x: Double(tile.x) * span, y: Double(tile.y) * span, width: span, height: span)
    }

    /// The tile of level z a map point is in.
    static func tile(at point: MKMapPoint, z: Int) -> ChartTile {
        let span = side(z: z), n = 1 << z
        return ChartTile(z: z, x: min(max(Int((point.x / span).rounded(.down)), 0), n - 1),
                         y: min(max(Int((point.y / span).rounded(.down)), 0), n - 1))
    }

    /// The tile `levels` above, and the part of its picture (0 to 1 of its
    /// side, from the top left) that covers `tile`: what is drawn,
    /// enlarged, while the tile itself is on its way.
    static func ancestor(of tile: ChartTile, levels: Int) -> (tile: ChartTile, part: CGRect)? {
        guard levels > 0, tile.z - levels >= 0 else { return nil }
        let k = 1 << levels
        let parent = ChartTile(z: tile.z - levels, x: tile.x / k, y: tile.y / k)
        let unit = 1 / CGFloat(k)
        return (parent, CGRect(x: CGFloat(tile.x % k) * unit, y: CGFloat(tile.y % k) * unit, width: unit, height: unit))
    }
}

/// The decoded tiles drawn, in memory, so a tile scrolled back into view
/// is drawn at once rather than read from disk and decoded again: the
/// first level of the three (memory, the disk store, the network). An
/// NSCache: safe from MapKit's drawing threads, and iOS trims it under
/// memory pressure. It holds decoded bitmaps, the cost of each its bytes
/// (a 512-pixel tile is 1 MB): 96 MB is about three screens of a 3x
/// phone at the levels ChartTileMath picks, enough for a pan back and a
/// zoom out and in again.
final class TileCache: @unchecked Sendable {
    static let shared = TileCache()

    private final class Box {
        let image: CGImage
        init(_ image: CGImage) { self.image = image }
    }

    private let cache = NSCache<NSString, Box>()

    init(bytes: Int = 96 * 1024 * 1024) {
        cache.totalCostLimit = bytes
    }

    /// A tile's key: the edition, the kind (and whether the day's lift is
    /// on it), the tile and its density, so none stands in for another.
    static func key(cycle: String, kind: String, z: Int, x: Int, y: Int, scale: Int = 1) -> String {
        "\(cycle)/\(kind)/\(z)/\(x)/\(y)@\(scale)x"
    }

    static func cost(of image: CGImage) -> Int {
        image.bytesPerRow * image.height
    }

    func image(_ key: String) -> CGImage? {
        cache.object(forKey: key as NSString)?.image
    }

    func keep(_ image: CGImage, for key: String) {
        cache.setObject(Box(image), forKey: key as NSString, cost: Self.cost(of: image))
    }

    func removeAll() {
        cache.removeAllObjects()
    }
}

/// A tile's PNG made ready to draw: decoded once into a plain 32-bit
/// bitmap (the pyramid's tiles are 256-colour palette PNGs, #547, which
/// Core Graphics would otherwise expand at every draw), with the day's
/// lift (ChartLift) on it where asked.
enum ChartTileImage {
    nonisolated static func decode(_ data: Data, lift: Bool) -> CGImage? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
              let decoded = CGImageSourceCreateImageAtIndex(source, 0, [kCGImageSourceShouldCacheImmediately: true] as CFDictionary)
        else { return nil }
        if lift, let lifted = ChartLift.apply(decoded) { return lifted }
        let width = decoded.width, height = decoded.height
        guard let context = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
                                      space: CGColorSpace(name: CGColorSpace.sRGB) ?? CGColorSpaceCreateDeviceRGB(),
                                      bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue)
        else { return decoded }
        context.draw(decoded, in: CGRect(x: 0, y: 0, width: width, height: height))
        return context.makeImage() ?? decoded
    }
}

/// The chart's renderer: each tile of the level ChartTileMath picks drawn
/// into its own map rect at full resolution. A tile not in memory is
/// fetched (the disk store, else the network, kept on disk as it comes,
/// so the chart a pilot looked at is there in the air) while the nearest
/// level above that is in memory is drawn enlarged in its place, so a
/// zoom shows a softer chart for a moment rather than none. A tile asked
/// for twice while it loads is fetched once, and the loads of tiles that
/// have left the view are cancelled (keep). Each load is a signpost
/// interval ("tile") under the app's "tiles" log category.
///
/// At night the night's ground is laid over the chart at the setting's
/// shade, so the marks, the course and the sheets over it are untouched;
/// its alpha is the chart's fade close in (ChartFade), set as the view
/// moves.
final class ChartTileRenderer: MKOverlayRenderer, @unchecked Sendable {
    private let chart: ChartTileOverlay
    private let session: URLSession
    private let signposter = OSSignposter(subsystem: "app.wingtipmaps.ios", category: "tiles")

    /// The loads under way, by tile, and the tiles drawn with a stand-in
    /// that are not loading: asked again when they are back in view.
    private struct Loads {
        var running: [ChartTile: Task<Void, Never>] = [:]
        var standIn: Set<ChartTile> = []
    }
    private let loads = OSAllocatedUnfairLock(initialState: Loads())
    private let shadeLock = OSAllocatedUnfairLock(initialState: CGFloat(0))

    var shade: CGFloat {
        get { shadeLock.withLock { $0 } }
        set {
            let changed = shadeLock.withLock { old -> Bool in
                defer { old = newValue }
                return old != newValue
            }
            if changed { setNeedsDisplay() }
        }
    }

    init(chart: ChartTileOverlay, session: URLSession = .shared) {
        self.chart = chart
        self.session = session
        super.init(overlay: chart)
    }

    /// How many levels up a stand-in is looked for while a tile loads.
    static let standInLevels = 4

    private func key(_ tile: ChartTile) -> String {
        let t = chart.template
        return TileCache.key(cycle: t.cycle, kind: t.kind + (chart.lift ? "+lift" : ""), z: tile.z, x: tile.x, y: tile.y, scale: t.scale)
    }

    private func level(zoomScale: MKZoomScale) -> Int? {
        ChartTileMath.level(zoomScale: Double(zoomScale), screenScale: Double(contentScaleFactor), tileScale: chart.template.scale,
                            minZoom: chart.minZoom, maxZoom: chart.maxZoom)
    }

    override func draw(_ mapRect: MKMapRect, zoomScale: MKZoomScale, in context: CGContext) {
        let shade = self.shade
        defer {
            if shade > 0 {
                context.setFillColor(NightPalette.ground.withAlphaComponent(shade).cgColor)
                context.fill(rect(for: mapRect))
            }
        }
        guard let z = level(zoomScale: zoomScale) else { return }
        context.interpolationQuality = .high
        // Each tile's edges a device pixel over its neighbours', so no
        // hairline of the map under it shows between two tiles.
        let seam = 1 / (Double(zoomScale) * Double(max(1, contentScaleFactor)))
        for tile in ChartTileMath.tiles(in: mapRect, z: z) {
            let square = ChartTileMath.mapRect(tile)
            let target = rect(for: MKMapRect(x: square.minX, y: square.minY, width: square.width + seam, height: square.height + seam))
            if let image = chart.cache.image(key(tile)) {
                Self.put(image, in: target, context: context)
                continue
            }
            load(tile)
            for up in 1...Self.standInLevels {
                guard let (parent, part) = ChartTileMath.ancestor(of: tile, levels: up),
                      let image = chart.cache.image(key(parent)) else { continue }
                let crop = CGRect(x: part.minX * CGFloat(image.width), y: part.minY * CGFloat(image.height),
                                  width: part.width * CGFloat(image.width), height: part.height * CGFloat(image.height)).integral
                if let piece = image.cropping(to: crop) { Self.put(piece, in: target, context: context) }
                break
            }
        }
    }

    /// An image drawn into a rect of the renderer's space, whose y runs
    /// down the screen where Core Graphics' runs up.
    private static func put(_ image: CGImage, in rect: CGRect, context: CGContext) {
        context.saveGState()
        context.translateBy(x: rect.minX, y: rect.maxY)
        context.scaleBy(x: 1, y: -1)
        context.draw(image, in: CGRect(origin: .zero, size: rect.size))
        context.restoreGState()
    }

    /// A tile fetched into memory, once however often it is asked for
    /// while it loads; drawn again where it lies when it is in.
    private func load(_ tile: ChartTile) {
        loads.withLock { state in
            guard state.running[tile] == nil else { return }
            state.standIn.remove(tile)
            state.running[tile] = Task.detached(priority: .userInitiated) { [weak self] in
                await self?.fetch(tile)
            }
        }
    }

    private func fetch(_ tile: ChartTile) async {
        let chart = self.chart, template = chart.template
        let interval = signposter.beginInterval("tile", id: signposter.makeSignpostID(), "\(tile.z)/\(tile.x)/\(tile.y)")
        var source = "disk"
        var data = chart.store.read(cycle: template.cycle, kind: template.kind, z: tile.z, x: tile.x, y: tile.y, scale: template.scale)
        if data == nil, !Task.isCancelled {
            source = "network"
            if let (fetched, response) = try? await session.data(for: URLRequest(url: template.url(z: tile.z, x: tile.x, y: tile.y), timeoutInterval: Planner.read)),
               (response as? HTTPURLResponse)?.statusCode == 200 {
                chart.store.write(fetched, cycle: template.cycle, kind: template.kind, z: tile.z, x: tile.x, y: tile.y, scale: template.scale)
                data = fetched
            }
        }
        let cancelled = Task.isCancelled
        // A tile the chart has none of (the sea, past the country's edge)
        // stays clear: no error on the map.
        let image = data.flatMap { ChartTileImage.decode($0, lift: chart.lift) }
        if let image { chart.cache.keep(image, for: key(tile)) }
        signposter.endInterval("tile", interval, "\(cancelled ? "cancelled" : (image == nil ? "none" : source), privacy: .public)")
        loads.withLock { state in
            state.running[tile] = nil
            // Cancelled before it came: drawn with a stand-in, asked again
            // when it is back in view (keep).
            if image == nil, cancelled { state.standIn.insert(tile) }
        }
        guard image != nil else { return }
        let rect = ChartTileMath.mapRect(tile)
        await MainActor.run {
            self.setNeedsDisplay(rect)
            chart.onTile?()
        }
    }

    /// The loads of tiles no longer wanted cancelled -- out of the view and
    /// a tile's width round it, or of another level than the view's now --
    /// and the tiles drawn with a stand-in while theirs was cancelled
    /// asked again once they are in view. Called as the view moves.
    func keep(visible: MKMapRect, zoomScale: MKZoomScale) {
        guard let z = level(zoomScale: zoomScale) else {
            loads.withLock { state in
                for (tile, task) in state.running { task.cancel(); state.standIn.insert(tile) }
            }
            return
        }
        let span = ChartTileMath.side(z: z)
        let near = visible.insetBy(dx: -span, dy: -span)
        let back = loads.withLock { state -> [ChartTile] in
            for (tile, task) in state.running where tile.z != z || !ChartTileMath.mapRect(tile).intersects(near) {
                task.cancel()
            }
            let due = state.standIn.filter { $0.z == z && ChartTileMath.mapRect($0).intersects(visible) }
            return Array(due)
        }
        for tile in back { load(tile) }
    }

    /// Every load stopped: the overlay is off the map.
    func stop() {
        loads.withLock { state in
            for task in state.running.values { task.cancel() }
            state.running = [:]
            state.standIn = []
        }
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

    nonisolated static func apply(_ image: CGImage) -> CGImage? {
        let input = CIImage(cgImage: image)
        guard let filter = CIFilter(name: "CIColorControls") else { return nil }
        filter.setValue(input, forKey: kCIInputImageKey)
        filter.setValue(contrast, forKey: kCIInputContrastKey)
        filter.setValue(saturation, forKey: kCIInputSaturationKey)
        guard let output = filter.outputImage else { return nil }
        return context.createCGImage(output, from: input.extent, format: .BGRA8, colorSpace: CGColorSpace(name: CGColorSpace.sRGB))
    }
}
