import Foundation
import Observation

/// Keep for the Air, one tap on FPL (or Ready to fly's fix): the chart
/// along the route (KeepRoute) and the cycle packs of the regions it
/// crosses (CyclePacks), then everything else the flight needs with no
/// signal -- the briefing with its METARs and TAFs and the plan with its
/// nav log (Kept), the ranked NOTAMs, the route's airport cards and
/// diagrams, the destination's approach plates, the Go / No-Go and the
/// weather loop's frames (KeptForAir) -- and the size it all comes to,
/// said on the button and to Ready to fly (its `kept` row).
@MainActor
@Observable
final class KeepForAir {
    static let shared = KeepForAir()

    /// The chart's tiles kept of the tiles wanted; nil when not keeping.
    private(set) var keeping: (kept: Int, wanted: Int)?
    /// Megabytes the route's keep came to, once it is whole; nil while it
    /// is under way or none has run.
    private(set) var sizeMb: Double?
    private var task: Task<Void, Never>?

    /// The tiles are in and the rest is being kept.
    var keepingAnswers: Bool { keeping.map { $0.kept >= $0.wanted } == true && sizeMb == nil && task != nil }

    /// Keeps the route for the air, cancelling any keep before it.
    func keep(plan: Plan, template: TileTemplate, minZoom: Int, verdict: Verdict?, signedIn: Bool) {
        guard let course = plan.course else { return }
        task?.cancel()
        // The corridor's miles are the engine's; where it cannot say them
        // nothing is kept, and Ready to Fly goes on saying the chart is not.
        let tiles: Set<KeepRoute.Tile>, regions: Set<String>
        do {
            tiles = try KeepRoute.tiles(along: course.coordinates, minZoom: max(minZoom, 6), maxZoom: 10)
            regions = try CyclePacks.regions(along: course.coordinates)
        } catch {
            Log.engine.error("distance_nm: \(error.localizedDescription, privacy: .public)")
            return
        }
        let route = ReadyToFly.flightKey(plan)
        keeping = (0, tiles.count)
        sizeMb = nil
        task = Task { [weak self] in
            await CyclePacks.shared.keep(regions: regions)
            await KeepRoute.keep(tiles, template: template) { kept, wanted in
                Task { @MainActor in self?.keeping = (kept, wanted) }
            }
            guard let self, !Task.isCancelled else { return }
            let answers = await Self.keepAnswers(plan: plan, verdict: verdict, signedIn: signedIn, route: route)
            let tileBytes = await KeepRoute.bytes(tiles, template: template)
            guard !Task.isCancelled else { return }
            let manifest = KeptForAir.Manifest(kinds: answers.kinds, bytes: answers.bytes + tileBytes, at: Date())
            KeptForAir.writeManifest(manifest, route: route)
            self.sizeMb = Double(manifest.bytes) / 1_000_000
            self.task = nil
            await ReadyToFly.shared.refresh()
        }
    }

    /// Everything but the chart, asked of the planner now so the answers
    /// are kept: the kinds that are on the phone after, and their bytes.
    static func keepAnswers(plan: Plan, verdict: Verdict?, signedIn: Bool, route: String) async -> (kinds: [String], bytes: Int) {
        var kinds: [String] = []
        var files: [URL] = []
        // The briefing, fresh, and the plan with its nav log, as Kept holds them.
        await plan.brief(dep: plan.dep, dest: plan.dest, stops: plan.stops, eteMin: plan.totals?.eteMin)
        plan.keep()
        if let kept = Kept.load(), ReadyFacts.saved(dep: plan.dep, dest: plan.dest, stops: plan.stops, kept: kept) {
            kinds.append(KeptForAir.Kind.plan.rawValue)
            if kept.briefing != nil { kinds += [KeptForAir.Kind.briefing.rawValue, KeptForAir.Kind.weather.rawValue] }
            files.append(Kept.file)
        }
        await ReadyToFly.shared.fetchNotams(force: true)
        if let verdict { await verdict.refresh(plan: plan, signedIn: signedIn) }
        for kind in [KeptForAir.Kind.notams, .goNoGo] where KeptForAir.has(kind, key: route) {
            kinds.append(kind.rawValue)
            files.append(KeptForAir.file(kind.rawValue, route))
        }
        // Each field's card and diagram; the destination's approach plates,
        // every page of each.
        var cards = 0
        var pictures: [String] = []
        for ident in plan.idents {
            guard let place = try? await KeptForAir.answer(.airports, key: ident, fetch: { try await Planner.place(ident) }).value else { continue }
            cards += 1
            files.append(KeptForAir.file(KeptForAir.Kind.airports.rawValue, ident))
            if let cycle = place.airportDiagramCycle {
                pictures += [Planner.diagramPath(ident: ident, cycle: cycle), Planner.diagramPath(ident: ident, cycle: cycle, runwaysOnly: true)]
            }
            guard ident == plan.dest else { continue }
            var plates = true
            for chart in place.procedures ?? [] where chart.kind == "IAP" {
                let key = "\(ident)|\(chart.url)"
                guard let pages = try? await KeptForAir.answer(.plates, key: key, fetch: { try await Planner.faaChart(url: chart.url, airport: ident) }).value else {
                    plates = false
                    continue
                }
                files.append(KeptForAir.file(KeptForAir.Kind.plates.rawValue, key))
                pictures += pages.map(\.path)
            }
            if plates { kinds.append(KeptForAir.Kind.plates.rawValue) }
        }
        if cards == plan.idents.count { kinds.append(KeptForAir.Kind.airports.rawValue) }
        for path in pictures {
            if let data = try? await Planner.picture(path) { KeptForAir.writePicture(data, path: path) }
            files.append(KeptForAir.file("pictures", path, ext: "img"))
        }
        // The weather loop's frames, of the loop picked (the radar where none is).
        let loop = WeatherLoop.shared.kind == .off ? LoopKind.radar : WeatherLoop.shared.kind
        if (try? await KeptForAir.answer(.weatherLoop, key: loop.rawValue, fetch: {
            try await Planner.fetch(APIWeatherLoop.self, "/api/weather/loop", ["kind": loop.rawValue])
        })) != nil {
            kinds.append(KeptForAir.Kind.weatherLoop.rawValue)
            files.append(KeptForAir.file(KeptForAir.Kind.weatherLoop.rawValue, loop.rawValue))
        }
        return (kinds, Set(files).reduce(0) { $0 + KeptForAir.size(of: $1) })
    }
}
