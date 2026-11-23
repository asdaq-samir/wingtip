import ImageIO
import MapKit
import os
import UIKit
import UniformTypeIdentifiers

/// The engine's two lines the ground is coloured against, ft MSL
/// (hazard_view's warning_from_ft and caution_from_ft).
nonisolated struct HazardBands: Equatable, Sendable {
    let warningFt: Double
    let cautionFt: Double
}

/// The ground's colours for the engine's lines, drawn on the phone since
/// MapKit has no colour relief (the web's is MapLibre's color-relief layer
/// on the same tiles, hazard.ts): clear under the amber line, amber from
/// it, red over the red line, as the engine levels an obstacle's top
/// (exactly the clearance kept is amber; the shared fixture
/// hazardView.json). Drawing, not a rule: the lines are the engine's.
nonisolated enum HazardPaint {
    enum Shade: Equatable { case clear, caution, warning }

    /// The chart's caution and warning, half and three fifths strong as
    /// the web's (hazard.ts AMBER and RED), so the chart reads through.
    static let cautionAlpha: CGFloat = 0.5, warningAlpha: CGFloat = 0.6

    /// A height in metres against the lines, in metres.
    static func shade(_ m: Float, cautionM: Float, warningM: Float) -> Shade {
        if m > warningM { return .warning }
        return m >= cautionM ? .caution : .clear
    }

    /// A terrarium pixel's height in metres (Mapzen's terrarium encoding,
    /// as the AWS Terrain Tiles give it: R·256 + G + B/256 − 32768).
    static func metres(r: UInt8, g: UInt8, b: UInt8) -> Float {
        Float(r) * 256 + Float(g) + Float(b) / 256 - 32768
    }

    /// The lines in metres, from feet (Foundation's exact foot, Units.swift).
    static func metres(_ bands: HazardBands) -> (cautionM: Float, warningM: Float) {
        let m = { (ft: Double) in Float(Measurement(value: ft, unit: UnitLength.feet).converted(to: .meters).value) }
        return (m(bands.cautionFt), m(bands.warningFt))
    }

    /// A terrarium tile's PNG read into heights, row by row from the top;
    /// nil where it does not decode. Drawn into a bitmap in the picture's
    /// own colour space, so no colour matching changes the encoded heights.
    static func heights(png data: Data) -> (side: Int, metres: [Float])? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil),
              let image = CGImageSourceCreateImageAtIndex(source, 0, nil), image.width == image.height else { return nil }
        let side = image.width
        var bytes = [UInt8](repeating: 0, count: side * side * 4)
        let space = image.colorSpace ?? CGColorSpaceCreateDeviceRGB()
        let drawn = bytes.withUnsafeMutableBytes { raw -> Bool in
            guard let context = CGContext(data: raw.baseAddress, width: side, height: side, bitsPerComponent: 8, bytesPerRow: side * 4,
                                          space: space, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else { return false }
            context.draw(image, in: CGRect(x: 0, y: 0, width: side, height: side))
            return true
        }
        guard drawn else { return nil }
        var metres = [Float](repeating: 0, count: side * side)
        for i in 0..<(side * side) { metres[i] = Self.metres(r: bytes[i * 4], g: bytes[i * 4 + 1], b: bytes[i * 4 + 2]) }
        return (side, metres)
    }

    /// The colours, premultiplied RGBA, for each height against the lines.
    /// Written straight into the buffer, a pixel's four bytes as one
    /// 32-bit store: 65,536 a tile, every tile in view each time the lines
    /// move, so no array is made or replaced per pixel.
    static func pixels(_ heights: [Float], bands: HazardBands) -> [UInt8] {
        let (cautionM, warningM) = Self.metres(bands)
        let amber = word(rgba(WingtipColor.Chart.caution, alpha: cautionAlpha))
        let red = word(rgba(WingtipColor.Chart.warning, alpha: warningAlpha))
        var out = [UInt8](repeating: 0, count: heights.count * 4)
        out.withUnsafeMutableBytes { raw in
            let words = raw.bindMemory(to: UInt32.self)
            heights.withUnsafeBufferPointer { metres in
                for i in metres.indices {
                    switch shade(metres[i], cautionM: cautionM, warningM: warningM) {
                    case .clear: continue
                    case .caution: words[i] = amber
                    case .warning: words[i] = red
                    }
                }
            }
        }
        return out
    }

    /// Four bytes in memory order as the one word that stores them.
    private static func word(_ bytes: [UInt8]) -> UInt32 {
        bytes.withUnsafeBytes { $0.loadUnaligned(as: UInt32.self) }
    }

    /// The tile's colours as the PNG MapKit's tile renderer draws.
    static func png(_ heights: [Float], side: Int, bands: HazardBands) -> Data? {
        var bytes = pixels(heights, bands: bands)
        let image: CGImage? = bytes.withUnsafeMutableBytes { raw in
            CGContext(data: raw.baseAddress, width: side, height: side, bitsPerComponent: 8, bytesPerRow: side * 4,
                      space: CGColorSpace(name: CGColorSpace.sRGB) ?? CGColorSpaceCreateDeviceRGB(),
                      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)?.makeImage()
        }
        guard let image else { return nil }
        let out = NSMutableData()
        guard let sink = CGImageDestinationCreateWithData(out, UTType.png.identifier as CFString, 1, nil) else { return nil }
        CGImageDestinationAddImage(sink, image, nil)
        return CGImageDestinationFinalize(sink) ? out as Data : nil
    }

    /// A colour token's premultiplied bytes at an alpha.
    private static func rgba(_ colour: UIColor, alpha: CGFloat) -> [UInt8] {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        colour.getRed(&r, green: &g, blue: &b, alpha: &a)
        let byte = { (v: CGFloat) in UInt8((v * alpha * 255).rounded()) }
        return [byte(r), byte(g), byte(b), UInt8((alpha * 255).rounded())]
    }
}

/// The ground coloured against the engine's lines: each tile the planner's
/// terrain tile (Planner.terrainTile, the ground the relief and the
/// altitudes are planned from), its heights decoded once and kept, then
/// coloured off the main thread for the lines now. MapKit's stock tile
/// renderer keeps the coloured tiles; the map's hazard layer has it
/// reload them only when the lines move (HazardLayer). Held off the map in
/// 3D with the chart (RaisedMapView.isGround).
/// Unchecked: MKTileOverlay is not Sendable, and MapKit loads its tiles
/// on its own threads; its lines are in a lock, its heights in an NSCache.
final nonisolated class HazardTileOverlay: MKTileOverlay, @unchecked Sendable {
    /// The planner's terrain levels (wingtip.terrain_view, the web's
    /// dem.ts): past its 13th the 13th is enlarged.
    static let minLevel = 3, maxLevel = 13

    private final nonisolated class Heights: Sendable {
        let side: Int
        let metres: [Float]
        init(side: Int, metres: [Float]) { self.side = side; self.metres = metres }
    }

    private let lines = OSAllocatedUnfairLock<HazardBands?>(initialState: nil)
    /// A tile's heights are 256 KB: 128 tiles, about three screens.
    private let kept: NSCache<NSString, Heights> = {
        let cache = NSCache<NSString, Heights>()
        cache.totalCostLimit = 32 << 20
        return cache
    }()

    /// The tiles' heights being fetched, by tile: a second load of a tile
    /// under way waits on the first, not the planner again.
    private let running = OSAllocatedUnfairLock<[String: Task<Heights?, Never>]>(initialState: [:])

    var bands: HazardBands? {
        get { lines.withLock { $0 } }
        set { lines.withLock { $0 = newValue } }
    }

    init() {
        super.init(urlTemplate: nil)
        canReplaceMapContent = false
        minimumZ = Self.minLevel
        maximumZ = Self.maxLevel
    }

    override func loadTile(at path: MKTileOverlayPath, result: @escaping @Sendable (Data?, (any Error)?) -> Void) {
        guard bands != nil else { return result(nil, nil) }
        let (z, x, y) = (path.z, path.x, path.y)
        Task.detached(priority: .utility) { [self] in
            // A tile the planner has none of stays clear: no error on the
            // map. Coloured with the lines as they are once its heights
            // come, not as they were when it was asked.
            guard let heights = await heights(z: z, x: x, y: y), let bands else { return result(nil, nil) }
            result(HazardPaint.png(heights.metres, side: heights.side, bands: bands), nil)
        }
    }

    /// A tile's heights: kept, else fetched once however many loads ask.
    private func heights(z: Int, x: Int, y: Int) async -> Heights? {
        let key = "\(z)/\(x)/\(y)"
        if let made = kept.object(forKey: key as NSString) { return made }
        let task = running.withLock { running in
            if let task = running[key] { return task }
            let task = Task.detached(priority: .utility) { () -> Heights? in
                guard let data = try? await Planner.terrainTile(z: z, x: x, y: y), let read = HazardPaint.heights(png: data) else { return nil }
                return Heights(side: read.side, metres: read.metres)
            }
            running[key] = task
            return task
        }
        let made = await task.value
        running.withLock { $0[key] = nil }
        if let made { kept.setObject(made, forKey: key as NSString, cost: made.metres.count * 4) }
        return made
    }
}
