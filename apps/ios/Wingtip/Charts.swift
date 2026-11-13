import Foundation
import Observation

/// Which chart the map draws (/api/chart): its cycle, its layers and
/// where its tiles are. Kept from the last answer, so the map draws from
/// its tile store with no connection at all.
@MainActor
@Observable
final class Charts {
    private(set) var info: ChartInfo?
    private(set) var problem: String?
    /// The chart picked on the Map card (Sectional, IFR Low, IFR High; the
    /// web's preference `base`), kept on this device; the sectional until
    /// one is picked.
    var picked: String = UserDefaults.standard.string(forKey: Charts.pickedKey) ?? "sec" {
        didSet { UserDefaults.standard.set(picked, forKey: Self.pickedKey) }
    }
    nonisolated static let pickedKey = "base"

    private nonisolated static let kept = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        .appending(path: "chart.json")

    /// The chart kept from the last answer, read off the main actor, as
    /// it is at launch, before the first frames are drawn.
    private nonisolated static func readKept() async -> ChartInfo? {
        await Task.detached(priority: .userInitiated) {
            guard let data = try? Data(contentsOf: kept) else { return nil }
            return try? JSONDecoder().decode(ChartInfo.self, from: data)
        }.value
    }

    func load() async {
        if info == nil, let last = await Self.readKept(), info == nil {
            info = last
        }
        do {
            let fresh = try await Planner.chart()
            info = fresh
            problem = nil
            Task.detached(priority: .utility) {
                try? FileManager.default.createDirectory(at: Self.kept.deletingLastPathComponent(), withIntermediateDirectories: true)
                try? JSONEncoder().encode(fresh).write(to: Self.kept, options: .atomic)
            }
            TileStore.shared.keepOnly(cycle: fresh.chartCycle)
            // The airspace kept for the air, fetched again where the FAA's
            // cycle has turned since it was.
            Task.detached { await CyclePacks.shared.refresh() }
        } catch {
            problem = info == nil ? "The chart could not be fetched: \(error.localizedDescription)" : nil
            Log.map.error("the chart could not be fetched (\(self.info == nil ? "none kept" : "the kept one stands", privacy: .public)): \(error.localizedDescription, privacy: .public)")
        }
    }

    /// The chart the map draws: the one picked, else the sectional, else
    /// the first base layer (apps/web/src/lib/map/tiles.ts chartPair).
    var base: ChartLayer? {
        guard let layers = info?.chartLayers else { return nil }
        return layers.first { $0.kind == picked && $0.base } ?? layers.first { $0.kind == "sec" } ?? layers.first { $0.base }
    }

    /// The charts the Map card offers as pictures: the base layers the
    /// planner has, in the web's order (BASE_CHARTS).
    var choices: [ChartLayer] {
        let order = ["sec", "ifr_low", "ifr_high"]
        return (info?.chartLayers ?? []).filter { $0.base && order.contains($0.kind) }
            .sorted { order.firstIndex(of: $0.kind) ?? 0 < order.firstIndex(of: $1.kind) ?? 0 }
    }

    /// The base chart's tiles, from the 512-pixel @2x pyramid where the
    /// layer was drawn at it (/api/chart's chart_layers[].scales, [1, 2]
    /// for every kind since #510), else the 256-pixel one. The app's own
    /// renderer (ChartTileRenderer) draws a tile's every pixel into its
    /// map rect, whatever its size; MapKit's tile overlay, before it, laid
    /// a picture one pixel to a point, and could not use them (#549).
    var template: TileTemplate? {
        guard let info, let base else { return nil }
        let scale = (base.scales ?? [1]).contains(2) ? 2 : 1
        return TileTemplate(cycle: info.chartCycle, revision: info.chartRevision ?? 0, tilesBase: info.chartTilesBase, kind: base.kind, scale: scale)
    }
}
