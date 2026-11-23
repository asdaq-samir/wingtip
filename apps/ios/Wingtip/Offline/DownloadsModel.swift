import Foundation
import Observation
import UIKit

/// The Downloads screen's state (Setup → Downloads): what the planner can
/// cut (/api/offline-charts), the chart kinds and density picked, the
/// regions kept on the phone and how far each has come, and the calls
/// that keep, update and delete them; and the states' plates offered
/// (/api/plates/states) and kept (StatePlates). The view draws it.
@MainActor
@Observable
final class DownloadsModel {
    /// The chart kinds a download holds, in the map's order, with the
    /// app's names for them.
    static let kinds: [(key: String, label: String)] = [
        ("sec", "Sectional"), ("tac", "Terminal Area"), ("ifr_low", "IFR Low"), ("ifr_high", "IFR High"), ("ifr_area", "IFR Area"),
    ]

    private(set) var catalog: APIOfflineCatalog?
    private(set) var kept: [OfflineKept] = []
    private(set) var problem: String?
    private(set) var busy: Set<String> = []
    private(set) var storageUsed: Int64 = 0
    private(set) var storageFree: Int64?
    /// The states whose plates can be kept, with their cycle and sizes.
    private(set) var plateStates: APIPlateStates?
    private(set) var platesProblem: String?

    var picked: Set<String> {
        didSet { defaults.set(Array(picked), forKey: Self.kindsKey) }
    }
    /// 2 for the 512-pixel tiles, sharp on the phone's 2x and 3x screens;
    /// 1 for the 256-pixel ones at about a third of the size.
    var scale: Int {
        didSet { defaults.set(scale, forKey: Self.scaleKey) }
    }

    private let store: OfflineStore
    private let downloads: OfflineDownloads
    private let defaults: UserDefaults
    /// The states' plates kept on the phone, the app's (`attach`).
    private(set) var plates: StatePlates?
    static let kindsKey = "offline.kinds", scaleKey = "offline.scale"

    init(store: OfflineStore = .shared, downloads: OfflineDownloads = .shared, defaults: UserDefaults = .standard) {
        self.store = store
        self.downloads = downloads
        self.defaults = defaults
        picked = Set(defaults.stringArray(forKey: Self.kindsKey) ?? ["sec", "tac"])
        let kept = defaults.integer(forKey: Self.scaleKey)
        scale = kept == 0 ? (UITraitCollection.current.displayScale >= 2 ? 2 : 1) : kept
    }

    var regions: [APIOfflineRegion] { catalog?.regions ?? [] }

    /// The archive names the picks give ("sec@2x", "tac@2x").
    var archives: [String] {
        Self.kinds.map(\.key).filter(picked.contains).map { OfflineStore.archive(kind: $0, scale: scale) }
    }

    func load() async {
        refresh()
        // The states' plates asked beside the regions, not after them.
        async let states: Void = loadPlates()
        do {
            catalog = try await Planner.call { try await $0.offlineCatalog().ok.body.json }
            problem = nil
        } catch {
            problem = Problems.say("The regions could not be listed", error)
        }
        await states
    }

    /// The states' plates offered; where the FAA's index could not be had
    /// the planner names no cycle, and that is said.
    func loadPlates() async {
        guard let plates else { return }
        do {
            let states = try await plates.offered()
            plateStates = states
            platesProblem = states.cycle == nil ? "The FAA's list of plates couldn't be fetched. Try again later." : nil
        } catch {
            platesProblem = "The states' plates could not be listed: \(error.localizedDescription)"
        }
    }

    /// The app's kept states, from the screen's environment.
    func attach(_ plates: StatePlates) { self.plates = plates }

    /// A state's plates of the cycle offered kept.
    func keepPlates(_ id: String) {
        guard let cycle = plateStates?.cycle else { return }
        plates?.start(id, cycle: cycle)
    }

    /// The kept list and the storage figures read again.
    func refresh() {
        kept = store.all()
        storageUsed = store.bytes() + Int64((plates?.kept ?? []).reduce(0) { $0 + $1.bytes })
        storageFree = (try? URL.applicationSupportDirectory.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey]))?
            .volumeAvailableCapacityForImportantUsage
    }

    /// A region's size with the picks, where every archive's is known; an
    /// archive the region has no tiles of counts nothing once the catalog
    /// has sized the region at all.
    func size(of region: APIOfflineRegion) -> Int? {
        guard !region.sizes.additionalProperties.isEmpty else { return nil }
        return archives.reduce(0) { $0 + Self.sized(region.sizes.additionalProperties, $1) }
    }

    /// The planner's sizes are keyed by archive name, which the snake-case
    /// decoder turns into camel case ("ifr_low@2x" to "ifrLow@2x").
    nonisolated static func sized(_ sizes: [String: Int], _ archive: String) -> Int {
        sizes[archive] ?? sizes[camel(archive)] ?? 0
    }

    nonisolated static func camel(_ name: String) -> String {
        let parts = name.split(separator: "_")
        return parts.enumerated().map { $0.offset == 0 ? String($0.element) : $0.element.prefix(1).uppercased() + $0.element.dropFirst() }.joined()
    }

    /// A region of the catalog's cycle kept: its files listed, the picked
    /// archives it has tiles of fetched in the background, its cycle packs
    /// fetched with it.
    func download(_ regionID: String, cycle: String? = nil) async {
        guard let cycle = cycle ?? catalog?.cycle else { return }
        busy.insert(regionID)
        defer { busy.remove(regionID) }
        do {
            let files = try await Planner.call { try await $0.offlineRegion(path: .init(cycle: cycle, region: regionID)).ok.body.json }
            let chosen = files.archives.filter { archives.contains($0.archive) }
            guard !chosen.isEmpty else {
                problem = "\(files.region.name) has none of the charts picked in \(cycle)."
                return
            }
            var entry = OfflineKept(region: files.region.id, name: files.region.name, cycle: files.cycle, expires: files.expires,
                                    boxes: files.region.boxes, wanted: Dictionary(uniqueKeysWithValues: chosen.map { ($0.archive, $0.bytes) }),
                                    packs: files.packs.map(\.name))
            if let old = store.all().first(where: { $0.id == entry.id }) { entry.done = old.done.filter { entry.wanted[$0] != nil } }
            let saved = entry
            store.update(saved.id) { $0 = saved }
            let urls = Dictionary(uniqueKeysWithValues: chosen.map {
                ($0.archive, Config.gateway.appending(path: Config.plannerPath($0.url)))
            })
            downloads.fetch(saved, urls: urls)
            let packs = Set(saved.packs)
            Task { await CyclePacks.shared.keep(regions: packs) }
            problem = nil
        } catch {
            problem = Problems.say("The region could not be fetched", error)
        }
        refresh()
    }

    /// The same region kept again for the newest cycle the planner has
    /// (the next one, where it is here ahead of its date); the old copy
    /// goes once the new one is whole and the old has expired (sweep).
    func update(_ kept: OfflineKept) async {
        guard let cycle = newestCycle, cycle != kept.cycle else { return }
        await keep(kept, cycle: cycle)
    }

    /// A kept region's same kinds and density fetched for `cycle`: its
    /// update, or its own cycle again after a download stopped.
    func keep(_ kept: OfflineKept, cycle: String) async {
        let before = picked, beforeScale = scale
        picked = Set(kept.wanted.keys.map { String($0.split(separator: "@")[0]) })
        scale = kept.wanted.keys.contains { $0.hasSuffix("@2x") } ? 2 : 1
        if cycle == kept.cycle { store.update(kept.id) { $0?.failed = nil } }
        await download(kept.region, cycle: cycle)
        picked = before
        scale = beforeScale
    }

    /// The newest cycle to keep: the next one where the planner has it.
    var newestCycle: String? { catalog?.nextCycle ?? catalog?.cycle }

    /// Whether a kept region has a newer cycle to update to, not kept yet.
    func updatable(_ kept: OfflineKept) -> Bool {
        guard let newest = newestCycle, newest.reversedDate > kept.cycle.reversedDate else { return false }
        return !self.kept.contains { $0.region == kept.region && $0.cycle == newest }
    }

    func delete(_ kept: OfflineKept) {
        downloads.cancel(kept)
        store.update(kept.id) { $0 = nil }
        refresh()
    }

    /// The region id of a box on the map (/api/offline-box, snapped to
    /// the half degree), to download as a region of its own.
    func boxID(west: Double, south: Double, east: Double, north: Double) async -> String? {
        guard let box = try? await Planner.call(.usual, { try await $0.offlineBox(query: .init(west: west, south: south, east: east, north: north)).ok.body.json })
        else { return nil }
        return box.id
    }
}
