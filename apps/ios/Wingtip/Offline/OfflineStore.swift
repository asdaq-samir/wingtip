import Foundation
import Synchronization

/// A region's charts kept on the phone (Setup → Downloads): which region
/// of which cycle, the archives wanted and those on disk whole, and the
/// cycle packs fetched with it.
nonisolated struct OfflineKept: Codable, Equatable, Sendable, Identifiable {
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

    /// Past its date: the engine's `data_cycle` on the FAA's 56-day chart
    /// schedule, asked at the minute, as an edition is replaced at 0901Z on
    /// the next one's date ("Effective 0901 UTC"). The rule was worked out
    /// here as `expires` plus nine hours and a minute. Said on the list,
    /// never removed for it alone (warn, never limit; docs/decisions/0008).
    func expired(now: Date = .now) -> Bool {
        guard let effective = Self.isoDay(cycle),
              let answer = try? Engine.dataCycle(kind: "chart", effective: effective, on: Self.utcTime(now)) else { return false }
        return answer.state == "expired"
    }

    /// Whether a kept cycle has taken over by `now`: in force, or since
    /// replaced (the engine's `data_cycle`, 0901Z on its date). A region of
    /// the next cycle kept ahead is drawn from then on (`keptInForce`).
    static func begun(_ cycle: String, now: Date = .now) -> Bool {
        guard let effective = isoDay(cycle),
              let answer = try? Engine.dataCycle(kind: "chart", effective: effective, on: utcTime(now)) else { return false }
        return answer.state == "in_force" || answer.state == "expired"
    }

    /// A chart cycle's name, "10-29-2026" as the FAA's links write it, as
    /// "2026-10-29"; nil where it is no such name.
    static func isoDay(_ cycle: String) -> String? {
        let parts = cycle.split(separator: "-")
        guard parts.count == 3, parts.allSatisfy({ Int($0) != nil }) else { return nil }
        return "\(parts[2])-\(parts[0])-\(parts[1])"
    }

    /// A moment as the engine reads it, "2026-12-24T09:01:00Z".
    static func utcTime(_ date: Date) -> String {
        date.formatted(.iso8601)
    }
}

/// The downloaded regions on disk: one PMTiles archive per chart kind and
/// density of each (<root>/<cycle>/<region>/<archive>.pmtiles), and the
/// list of them (manifest.json). Under Application Support and kept out
/// of the backup: iOS never clears them for space, as it may the tiles
/// the map fetched as it went (TileStore, under Caches), and the planner
/// can always cut them again. The map reads a tile here first
/// (TileStore.read), then its own store, then the network.
///
/// What changes (the list, the open archives, the cycles begun) is one
/// `State` behind one mutex, which the map's tile loads take; no file is
/// read, written or removed while it is held, so a tile never waits on a
/// manifest write or a region's folder being deleted.
final nonisolated class OfflineStore: Sendable {
    static let shared = OfflineStore()

    let root: URL
    private nonisolated struct State {
        var kept: [OfflineKept]?
        var readers: [URL: PMTilesReader] = [:]
        /// Kept cycles known to have begun: once begun, always.
        var begun: Set<String> = []
        /// Bumped by each change, so the manifest last written is the newest.
        var version = 0
    }
    private let state = Mutex(State())

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
        loaded().sorted { ($0.cycle.reversedDate, $0.name) > ($1.cycle.reversedDate, $1.name) }
    }

    /// The list, read from the manifest the first time (outside the lock).
    private func loaded() -> [OfflineKept] {
        if let kept = state.withLock({ $0.kept }) { return kept }
        let read = (try? Data(contentsOf: manifest)).flatMap { try? JSONDecoder().decode([OfflineKept].self, from: $0) } ?? []
        return state.withLock { s in
            if let kept = s.kept { return kept }
            s.kept = read
            return read
        }
    }

    /// One region changed, added, or (nil) removed with its files.
    func update(_ id: String, _ change: (inout OfflineKept?) -> Void) {
        _ = loaded()
        let gone: OfflineKept? = state.withLock { s in
            var list = s.kept ?? []
            var entry = list.first { $0.id == id }
            let before = entry
            change(&entry)
            list.removeAll { $0.id == id }
            if let entry { list.append(entry) }
            s.kept = list
            s.version += 1
            guard entry == nil, let before else { return nil }
            let folder = root.appending(path: "\(before.cycle)/\(before.region)").path
            s.readers = s.readers.filter { !$0.key.path.hasPrefix(folder) }
            return before
        }
        if let gone { try? FileManager.default.removeItem(at: root.appending(path: "\(gone.cycle)/\(gone.region)")) }
        writeManifest()
    }

    /// The list as it is now, written; again where it changed meanwhile,
    /// so whichever of two writes ends last, the file is the newest list.
    private func writeManifest() {
        try? FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        var folder = root
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try? folder.setResourceValues(values)
        var written = -1
        while true {
            let (list, version) = state.withLock { ($0.kept ?? [], $0.version) }
            guard version != written else { return }
            try? JSONEncoder().encode(list).write(to: manifest, options: .atomic)
            written = version
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

    /// The newest kept cycle later than `cycle` that has taken over by
    /// `now`, nil where none has: the phone offline across a changeover,
    /// its chart answer still the old cycle's, draws the next cycle where
    /// a region of it is kept, from 0901Z on its date (the data-cycles
    /// audit's 14, the owner's word 2026-11-21). Past the region the old
    /// chart stays, and Ready to Fly says it is out of date.
    func keptInForce(after cycle: String, now: Date = .now) -> String? {
        let later = Set(all().map(\.cycle).filter { $0.reversedDate > cycle.reversedDate }).sorted { $0.reversedDate > $1.reversedDate }
        return later.first { kept in
            if state.withLock({ $0.begun.contains(kept) }) { return true }
            guard OfflineKept.begun(kept, now: now) else { return false }
            _ = state.withLock { $0.begun.insert(kept) }
            return true
        }
    }

    /// A tile of the cycle from a downloaded region: of the kept cycle in
    /// force where one later than `cycle` covers it (`keptInForce`), else
    /// of `cycle`; the density asked for first, else the other (a 256-pixel
    /// tile drawn over the same map rect, ChartTileRenderer). nil where no
    /// region kept holds it.
    func tile(cycle: String, kind: String, z: Int, x: Int, y: Int, scale: Int, now: Date = .now) -> Data? {
        let names = [Self.archive(kind: kind, scale: scale), Self.archive(kind: kind, scale: scale == 1 ? 2 : 1)]
        let (lat, lon) = Self.centre(z: z, x: x, y: y)
        let cycles = [keptInForce(after: cycle, now: now), cycle].compactMap { $0 }
        let covering = loaded().filter { $0.covers(lat: lat, lon: lon, z: z) }
        for drawn in cycles {
            for name in names {
                for region in covering where region.cycle == drawn && region.done.contains(name) {
                    if let data = reader(path(cycle: drawn, region: region.region, archive: name))?.tile(z: z, x: x, y: y) {
                        return data
                    }
                }
            }
        }
        return nil
    }

    /// The archive, opened once (outside the lock) and kept.
    private func reader(_ url: URL) -> PMTilesReader? {
        if let kept = state.withLock({ $0.readers[url] }) { return kept }
        guard let opened = try? PMTilesReader(url: url) else { return nil }
        return state.withLock { s in
            if let kept = s.readers[url] { return kept }
            s.readers[url] = opened
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

nonisolated extension OfflineKept {
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

nonisolated extension String {
    /// A chart cycle's name ("10-29-2026") as a sortable "2026-10-29".
    var reversedDate: String {
        let parts = split(separator: "-")
        return parts.count == 3 ? "\(parts[2])-\(parts[0])-\(parts[1])" : self
    }
}
