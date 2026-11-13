import Foundation

/// A region's charts kept on the phone (Setup → Downloads): which region
/// of which cycle, the archives wanted and those on disk whole, and the
/// cycle packs fetched with it.
struct OfflineKept: Codable, Equatable, Sendable, Identifiable {
    var id: String { "\(cycle)/\(region)" }
    let region: String
    let name: String
    let cycle: String
    /// The ISO day the cycle is replaced (the planner's, from the engine's
    /// data_cycle on the FAA's 56-day chart schedule).
    let expires: String?
    let boxes: [[Double]]
    /// Each archive wanted ("sec@2x") and its size as the planner gave it.
    var wanted: [String: Int]
    /// The archives on disk whole.
    var done: [String] = []
    var packs: [String] = []
    var failed: String?

    var complete: Bool { Set(done) == Set(wanted.keys) }
    var bytes: Int { wanted.values.reduce(0, +) }

    /// Past its date: an edition is replaced at 0901Z on the next one's
    /// effective day (the FAA's 28 and 56 Day Product Schedule, as the
    /// planner's wingtip.data_cycles.in_force_day has it). Said on the
    /// list, never removed for it alone (warn, never limit; docs/decisions/0008).
    func expired(now: Date = .now) -> Bool {
        guard let day = expires.flatMap(Self.utcDay) else { return false }
        return now >= day.addingTimeInterval(9 * 3600 + 60)
    }

    /// "2026-12-24" as that day's 0000Z.
    static func utcDay(_ text: String) -> Date? {
        let parts = text.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        return calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
    }
}

/// The downloaded regions on disk: one PMTiles archive per chart kind and
/// density of each (<root>/<cycle>/<region>/<archive>.pmtiles), and the
/// list of them (manifest.json). Under Application Support and kept out
/// of the backup: iOS never clears them for space, as it may the tiles
/// the map fetched as it went (TileStore, under Caches), and the planner
/// can always cut them again. The map reads a tile here first
/// (TileStore.read), then its own store, then the network.
final class OfflineStore: @unchecked Sendable {
    static let shared = OfflineStore()

    let root: URL
    private let lock = NSLock()
    private var kept: [OfflineKept]?
    private var readers: [URL: PMTilesReader] = [:]

    init(root: URL? = nil) {
        self.root = root ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appending(path: "offline-charts", directoryHint: .isDirectory)
    }

    private var manifest: URL { root.appending(path: "manifest.json") }

    func path(cycle: String, region: String, archive: String) -> URL {
        root.appending(path: "\(cycle)/\(region)/\(archive).pmtiles")
    }

    /// Every region kept, newest cycle first, by name.
    func all() -> [OfflineKept] {
        lock.withLock { loaded() }.sorted { ($0.cycle.reversedDate, $0.name) > ($1.cycle.reversedDate, $1.name) }
    }

    private func loaded() -> [OfflineKept] {
        if let kept { return kept }
        let read = (try? Data(contentsOf: manifest)).flatMap { try? JSONDecoder().decode([OfflineKept].self, from: $0) } ?? []
        kept = read
        return read
    }

    /// One region changed, added, or (nil) removed with its files.
    func update(_ id: String, _ change: (inout OfflineKept?) -> Void) {
        lock.withLock {
            var list = loaded()
            var entry = list.first { $0.id == id }
            let before = entry
            change(&entry)
            list.removeAll { $0.id == id }
            if let entry { list.append(entry) }
            if entry == nil, let gone = before {
                let folder = root.appending(path: "\(gone.cycle)/\(gone.region)")
                readers = readers.filter { !$0.key.path.hasPrefix(folder.path) }
                try? FileManager.default.removeItem(at: folder)
            }
            kept = list
            try? FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
            var folder = root
            var values = URLResourceValues()
            values.isExcludedFromBackup = true
            try? folder.setResourceValues(values)
            try? JSONEncoder().encode(list).write(to: manifest, options: .atomic)
        }
    }

    /// A downloaded file moved into its place, and its archive marked done.
    func finish(cycle: String, region: String, archive: String, file: URL) throws {
        let target = path(cycle: cycle, region: region, archive: archive)
        try FileManager.default.createDirectory(at: target.deletingLastPathComponent(), withIntermediateDirectories: true)
        try? FileManager.default.removeItem(at: target)
        try FileManager.default.moveItem(at: file, to: target)
        update("\(cycle)/\(region)") { entry in
            guard entry != nil, !(entry!.done.contains(archive)) else { return }
            entry!.done.append(archive)
            entry!.failed = nil
        }
    }

    /// A tile of the cycle from a downloaded region: the density asked for
    /// first, else the other (a 256-pixel tile drawn over the same map
    /// rect, ChartTileRenderer). nil where no region kept holds it.
    func tile(cycle: String, kind: String, z: Int, x: Int, y: Int, scale: Int) -> Data? {
        let names = [Self.archive(kind: kind, scale: scale), Self.archive(kind: kind, scale: scale == 1 ? 2 : 1)]
        let (lat, lon) = Self.centre(z: z, x: x, y: y)
        let regions = lock.withLock { loaded() }.filter { $0.cycle == cycle && $0.covers(lat: lat, lon: lon, z: z) }
        for name in names {
            for region in regions where region.done.contains(name) {
                if let data = reader(path(cycle: cycle, region: region.region, archive: name))?.tile(z: z, x: x, y: y) {
                    return data
                }
            }
        }
        return nil
    }

    private func reader(_ url: URL) -> PMTilesReader? {
        lock.withLock {
            if let kept = readers[url] { return kept }
            guard let opened = try? PMTilesReader(url: url) else { return nil }
            readers[url] = opened
            return opened
        }
    }

    /// The bytes on disk, for the list's Storage Used.
    func bytes() -> Int64 {
        guard let files = FileManager.default.enumerator(at: root, includingPropertiesForKeys: [.fileSizeKey]) else { return 0 }
        var total: Int64 = 0
        for case let file as URL in files {
            total += Int64((try? file.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0)
        }
        return total
    }

    /// A cycle gone by removed where the same region of a newer cycle is
    /// whole on the phone: the update replaces it. One not yet updated is
    /// kept and said to be expired (OfflineKept.expired), so a pilot with
    /// no signal on the changeover day still has a chart.
    func sweep(now: Date = .now) {
        let list = all()
        for old in list where old.expired(now: now) {
            let replaced = list.contains { $0.region == old.region && $0.complete && $0.cycle.reversedDate > old.cycle.reversedDate }
            if replaced { update(old.id) { $0 = nil } }
        }
    }

    static func archive(kind: String, scale: Int) -> String { scale == 1 ? kind : "\(kind)@\(scale)x" }

    static func centre(z: Int, x: Int, y: Int) -> (Double, Double) {
        let c = TileMath.centre(z: z, x: x, y: y)
        return (c.lat, c.lon)
    }
}

extension OfflineKept {
    /// Whether a tile centred here may be in the region's archives: inside
    /// a box, or near one by a tile's width (the cut keeps every tile its
    /// boxes touch).
    func covers(lat: Double, lon: Double, z: Int) -> Bool {
        let pad = 360 / pow(2.0, Double(z))
        return boxes.contains { b in
            b.count == 4 && lon >= b[0] - pad && lon <= b[2] + pad && lat >= b[1] - pad && lat <= b[3] + pad
        }
    }
}

extension String {
    /// A chart cycle's name ("10-29-2026") as a sortable "2026-10-29".
    var reversedDate: String {
        let parts = split(separator: "-")
        return parts.count == 3 ? "\(parts[2])-\(parts[0])-\(parts[1])" : self
    }
}
