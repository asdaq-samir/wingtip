import CoreGraphics
import Foundation

/// The decoded tiles drawn, in memory, so a tile scrolled back into view
/// is drawn at once rather than read from disk and decoded again: the
/// first level of the three (memory, the disk store, the network). An
/// NSCache: safe from MapKit's drawing threads, and iOS trims it under
/// memory pressure. It holds decoded bitmaps, the cost of each its bytes
/// (a 512-pixel tile is 1 MB): 96 MB is about three screens of a 3x
/// phone at the levels ChartTileMath picks, enough for a pan back and a
/// zoom out and in again.
///
/// Unchecked: NSCache is thread-safe (Apple's documentation) but not
/// marked Sendable, and it is the one stored property.
final class TileCache: @unchecked Sendable {
    static let shared = TileCache()

    private final class Box {
        let image: CGImage
        init(_ image: CGImage) { self.image = image }
    }

    private let cache = NSCache<AnyObject, Box>()

    /// A tile's key in the cache: its edition, kind and density (`prefix`,
    /// made once for each chart) and the tile, compared without making a
    /// string for each tile drawn.
    final class Key: NSObject {
        let prefix: String
        let tile: ChartTile
        private let hashed: Int

        init(prefix: String, tile: ChartTile) {
            (self.prefix, self.tile) = (prefix, tile)
            var hasher = Hasher()
            hasher.combine(prefix)
            hasher.combine(tile)
            hashed = hasher.finalize()
        }

        override var hash: Int { hashed }

        override func isEqual(_ object: Any?) -> Bool {
            guard let other = object as? Key else { return false }
            return other.tile == tile && other.prefix == prefix
        }
    }

    init(bytes: Int = 96 * 1024 * 1024) {
        cache.totalCostLimit = bytes
    }

    /// A chart's part of its tiles' keys: the edition, the kind (and
    /// whether the day's lift is on it) and the density, so none stands in
    /// for another.
    static func prefix(cycle: String, kind: String, scale: Int = 1) -> String {
        "\(cycle)/\(kind)@\(scale)x"
    }

    static func key(cycle: String, kind: String, z: Int, x: Int, y: Int, scale: Int = 1) -> Key {
        Key(prefix: prefix(cycle: cycle, kind: kind, scale: scale), tile: ChartTile(z: z, x: x, y: y))
    }

    static func cost(of image: CGImage) -> Int {
        image.bytesPerRow * image.height
    }

    func image(_ key: Key) -> CGImage? {
        cache.object(forKey: key)?.image
    }

    func keep(_ image: CGImage, for key: Key) {
        cache.setObject(Box(image), forKey: key, cost: Self.cost(of: image))
    }

    func removeAll() {
        cache.removeAllObjects()
    }
}
