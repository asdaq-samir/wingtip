import Foundation
import Observation

/// Keep for the Air, one tap on FPL (or Ready to fly's fix): the chart
/// along the route (KeepRoute) and the cycle packs of the regions it
/// crosses (CyclePacks), then everything else the flight needs with no
/// signal -- the briefing with its METARs and TAFs and the plan with its
/// nav log and the route's profile (Kept), the ranked NOTAMs and each
/// field's own, the route's airport cards, diagrams and diagram PDFs, the
/// plates the flight may need (KeepPlates: every field's on the route, the
/// alternate's and those within diversion range), the Go / No-Go, the weather loop's
/// frames and the newest radar frame's tiles along the route (KeptForAir,
/// KeepRadar) -- and the size it all comes to,
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
    /// The flight's plates and their size as the planner names them, said
    /// before the keep (KeepPlates.line); nil before an answer.
    private(set) var flightPlates: APIFlightPlates?
    private var platesAsked: KeepPlates.Ask?
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
            let manifest = KeptForAir.Manifest(kinds: answers.kinds, bytes: answers.bytes + tileBytes, at: Date(),
                                               files: answers.files.map { KeptForAir.relative($0) }.sorted())
            KeptForAir.writeManifest(manifest, route: route)
            self.sizeMb = Double(manifest.bytes) / 1_000_000
            self.task = nil
            await ReadyToFly.shared.refresh()
        }
    }

    /// The flight's plates sized for the plan as it is now, asked again
    /// only where the question changed (its fields, line, alternate, ETA
    /// or airplane); nothing without a route.
    func sizePlates(plan: Plan) async {
        guard plan.course != nil else {
            flightPlates = nil
            platesAsked = nil
            return
        }
        let ask = KeepPlates.ask(for: plan)
        guard ask != platesAsked else { return }
        platesAsked = ask
        flightPlates = nil
        do {
            let plates = try await KeepPlates.flightPlates(ask)
            // Only the answer to the question still asked is said.
            if platesAsked == ask { flightPlates = plates }
        } catch {
            // No size to say then, and asked again next time; the keep
            // asks for itself.
            if platesAsked == ask { platesAsked = nil }
            Log.planner.notice("the flight's plates could not be sized: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// Everything but the chart, asked of the planner now so the answers
    /// are kept: the kinds that are on the phone after, their bytes and files.
    static func keepAnswers(plan: Plan, verdict: Verdict?, signedIn: Bool, route: String) async -> (kinds: [String], bytes: Int, files: Set<URL>) {
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
        // Each field's card and diagram.
        var cards = 0
        var pictures: [String] = []
        for ident in plan.idents {
            guard let place = try? await KeptForAir.answer(.airports, key: ident, fetch: { try await Planner.place(ident) }).value else { continue }
            cards += 1
            files.append(KeptForAir.file(KeptForAir.Kind.airports.rawValue, ident))
            // The field's own NOTAMs under the key its card reads, and the
            // FAA's diagram PDF the own-ship diagram draws on.
            let notamsKey = KeptForAir.fieldNotamsKey(ident)
            if (try? await KeptForAir.answer(.notams, key: notamsKey, fetch: { try await Planner.notams(ident) })) != nil {
                files.append(KeptForAir.file(KeptForAir.Kind.notams.rawValue, notamsKey))
            }
            if let pdf = place.airportDiagramUrl, let address = URL(string: pdf),
               let (data, response) = try? await URLSession.shared.data(from: address), (response as? HTTPURLResponse)?.statusCode == 200 {
                KeptForAir.writePicture(data, path: KeptForAir.pdfKey(pdf))
                files.append(KeptForAir.file("pictures", KeptForAir.pdfKey(pdf), ext: "img"))
            }
            if let cycle = place.airportDiagramCycle {
                pictures.append(Planner.diagramPath(ident: ident, cycle: cycle))
                // The runways' crop only where the planner has one to give.
                if place.airportDiagramRunways != false { pictures.append(Planner.diagramPath(ident: ident, cycle: cycle, runwaysOnly: true)) }
            }
        }
        if cards == plan.idents.count { kinds.append(KeptForAir.Kind.airports.rawValue) }
        // The plates a flight may need, as the planner names them
        // (KeepPlates), every chart kept; on board only when every one is.
        if let wanted = try? await KeepPlates.flightPlates(KeepPlates.ask(for: plan)) {
            var whole = true
            await KeepPlates.keepAll(KeepPlates.jobs(wanted.fields.map { ($0.ident, $0.charts) })) { _, kept in
                if let kept { files += kept } else { whole = false }
            }
            if whole { kinds.append(KeptForAir.Kind.plates.rawValue) }
        }
        for path in pictures {
            // Kept by the address the pictures' loader asks (KeptPictureLoader).
            let address = Planner.address(of: path).absoluteString
            if let data = try? await Planner.picture(path) { KeptForAir.writePicture(data, path: address) }
            files.append(KeptForAir.file("pictures", address, ext: "img"))
        }
        // The weather loop's frames, of the loop picked (the radar where
        // none is), and the newest radar frame's tiles along the route.
        let loop = WeatherLoop.shared.kind == .off ? LoopKind.radar : WeatherLoop.shared.kind
        if let frames = try? await KeptForAir.answer(.weatherLoop, key: loop.rawValue, fetch: {
            try await Planner.call { try await $0.weatherLoopFrames(query: .init(kind: loop.rawValue)).ok.body.json }
        }).value {
            kinds.append(KeptForAir.Kind.weatherLoop.rawValue)
            files.append(KeptForAir.file(KeptForAir.Kind.weatherLoop.rawValue, loop.rawValue))
            if let course = plan.course { files += await KeepRadar.keep(frames, along: course.coordinates) }
        }
        // The ground and airspace under the route, for the profile, where
        // the plan's own fetch of it had not come.
        if await plan.keepProfile() { files.append(Kept.file) }
        let kept = Set(files)
        return (kinds, kept.reduce(0) { $0 + KeptForAir.size(of: $1) }, kept)
    }
}
