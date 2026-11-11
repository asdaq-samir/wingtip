import Foundation

/// The chart's tiles on disk, by cycle and kind, so the chart a pilot has
/// looked at is there in the air with no connection -- what the web app's
/// service worker keeps (vite.config's chart-tiles cache). Two places:
/// the tiles Keep for the Air fetched along a route (`kept`), in
/// Application Support and left out of backups, which iOS never clears
/// under storage pressure, as it may Caches mid-trip (the offline audit's
/// gap 9); and the tiles the map fetched as it went (`seen`), under
/// Caches, which iOS may clear and the next look fetches again. The disk
/// holds the pyramid's own tiles as fetched; the map decodes them
/// (ChartTileRenderer) and keeps the decoded ones in memory (TileCache).
final class TileStore: Sendable {
    static let shared = TileStore()

    /// The map's own fetches: Caches.
    let root: URL
    /// Keep for the Air's: Application Support, not backed up.
    let keptRoot: URL

    init(root: URL? = nil, keptRoot: URL? = nil) {
        let seen = root ?? FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appending(path: "chart-tiles", directoryHint: .isDirectory)
        self.root = seen
        self.keptRoot = keptRoot ?? (root.map { $0.deletingLastPathComponent().appending(path: $0.lastPathComponent + "-kept", directoryHint: .isDirectory) }
            ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appending(path: "kept-chart-tiles", directoryHint: .isDirectory))
    }

    private static func file(in root: URL, cycle: String, kind: String, z: Int, x: Int, y: Int, scale: Int) -> URL {
        root.appending(path: "\(cycle)/\(kind)/\(z)/\(x)/\(y)\(scale == 1 ? "" : "@\(scale)x").png")
    }

    /// A kept tile's file, named as the pyramid names it: {y}@2x.png for the
    /// 512-pixel tile (TileTemplate.scale), so the two never stand in for
    /// each other. Keep for the Air's size and Ready to Fly look here.
    func path(cycle: String, kind: String, z: Int, x: Int, y: Int, scale: Int = 1) -> URL {
        Self.file(in: keptRoot, cycle: cycle, kind: kind, z: z, x: x, y: y, scale: scale)
    }

    /// A region downloaded for the air first (Setup → Downloads,
    /// OfflineStore), then a tile kept for the route, then one fetched as
    /// the map went.
    func read(cycle: String, kind: String, z: Int, x: Int, y: Int, scale: Int = 1) -> Data? {
        OfflineStore.shared.tile(cycle: cycle, kind: kind, z: z, x: x, y: y, scale: scale)
            ?? (try? Data(contentsOf: path(cycle: cycle, kind: kind, z: z, x: x, y: y, scale: scale)))
            ?? (try? Data(contentsOf: Self.file(in: root, cycle: cycle, kind: kind, z: z, x: x, y: y, scale: scale)))
    }

    /// Whether Keep for the Air holds this tile itself.
    func isKept(cycle: String, kind: String, z: Int, x: Int, y: Int, scale: Int = 1) -> Bool {
        FileManager.default.fileExists(atPath: path(cycle: cycle, kind: kind, z: z, x: x, y: y, scale: scale).path)
    }

    /// A tile written: to the kept place for Keep for the Air, to Caches
    /// for the map's own fetches.
    func write(_ data: Data, cycle: String, kind: String, z: Int, x: Int, y: Int, scale: Int = 1, kept: Bool = false) {
        let file = Self.file(in: kept ? keptRoot : root, cycle: cycle, kind: kind, z: z, x: x, y: y, scale: scale)
        try? FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
        try? data.write(to: file, options: .atomic)
        if kept { excludeFromBackup() }
    }

    /// The kept tiles are the FAA's, fetched again from the planner: no
    /// use in an iCloud backup (Apple's "Optimizing your app's data for
    /// iCloud backup": data that can be downloaded again is excluded).
    /// The flag is the folder's, which covers what is in it.
    private func excludeFromBackup() {
        var folder = keptRoot
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try? folder.setResourceValues(values)
    }

    /// Bytes on the phone, both places, for Setup's "Kept for the air" line.
    func bytes() -> Int64 {
        [root, keptRoot].reduce(0) { $0 + Self.bytes(under: $1) }
    }

    private static func bytes(under root: URL) -> Int64 {
        guard let files = FileManager.default.enumerator(at: root, includingPropertiesForKeys: [.fileSizeKey]) else { return 0 }
        var total: Int64 = 0
        for case let file as URL in files {
            total += Int64((try? file.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0)
        }
        return total
    }

    /// Everything but the cycle flown now, in both places: an edition gone
    /// by is no use.
    func keepOnly(cycle: String) {
        for place in [root, keptRoot] {
            guard let editions = try? FileManager.default.contentsOfDirectory(at: place, includingPropertiesForKeys: nil) else { continue }
            for edition in editions where edition.lastPathComponent != cycle {
                try? FileManager.default.removeItem(at: edition)
            }
        }
    }
}
