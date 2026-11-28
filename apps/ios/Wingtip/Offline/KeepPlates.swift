import CoreLocation
import Foundation
import PlannerAPI

/// The FAA's charts kept on the phone as the airport card's Charts tab
/// shows them: a chart's pages from the planner (/api/faa-chart, of a
/// booklet the ones naming the field), kept as KeptForAir's plates answer,
/// and each page's picture under the address the pictures' loader asks
/// (KeptPictureLoader), so a plate opens in the air with no signal. Keep
/// for the Air keeps a flight's this way and Downloads a state's
/// (StatePlates), as the web's lib/kept/keepChart does.
///
/// Which plates a flight may need is the planner's (wingtip.plate_sets,
/// GET /api/plates/flight): the departure's, the destination's, each
/// stop's, the alternate's (the one filed, else the engine's pick, 14 CFR
/// 91.169(c)) and those of the fields within the airplane's diversion
/// range (the engine's diversion_range_nm, from its own cruise and fuel;
/// none with no airplane picked). This only asks and keeps.
enum KeepPlates {
    /// One chart to keep: the field it is kept for and its address.
    nonisolated struct Job: Hashable, Sendable {
        let ident: String
        let url: String
    }

    /// Keeps one chart; the files it is kept in, or nil where it could not be had.
    typealias Keeper = @Sendable (Job) async -> [URL]?

    /// The charts kept at once: a few, so a state of thousands does not
    /// flood the planner, nor one slow page hold up the rest.
    static let atOnce = 4

    /// The key a chart's pages are kept under: the one the card's Charts tab reads.
    nonisolated static func key(_ job: Job) -> String { "\(job.ident)|\(job.url)" }

    /// The files a chart is kept in, as far as the phone has them: its
    /// pages' answer and each kept page's picture. A chart's address names
    /// its cycle, so what is kept of one never changes. Nonisolated, as
    /// the plates' sweep reads them off the main actor (StatePlates.erase).
    nonisolated static func files(of job: Job, in folder: URL = KeptForAir.folder) -> [URL] {
        let key = key(job)
        let answer = KeptForAir.file(KeptForAir.Kind.plates.rawValue, key, in: folder)
        let pages = KeptForAir.read([ChartPage].self, .plates, key: key, in: folder)?.value ?? []
        return [answer] + pages.map { KeptForAir.file("pictures", pictureAddress($0), ext: "img", in: folder) }
    }

    /// A page's picture as KeptPictureLoader asks it: by its whole address.
    nonisolated static func pictureAddress(_ page: ChartPage) -> String { Planner.address(of: page.path).absoluteString }

    /// Whether a chart's every file is on the phone.
    nonisolated static func whole(_ job: Job, in folder: URL = KeptForAir.folder) -> Bool {
        let files = files(of: job, in: folder)
        return files.count > 1 && files.allSatisfy { FileManager.default.fileExists(atPath: $0.path) }
    }

    /// A chart kept from the planner; its files, or nil where its pages or
    /// a picture could not be had. A chart already whole on the phone (a
    /// stopped download going on) is not asked again. Off the main actor:
    /// a state's thousands of charts are as many file checks and writes,
    /// which would stutter the map and the lists there.
    @concurrent
    nonisolated static func keep(_ job: Job) async -> [URL]? {
        guard !whole(job) else { return files(of: job) }
        let key = key(job)
        guard let pages = try? await KeptForAir.answer(.plates, key: key, fetch: { try await Planner.faaChart(url: job.url, airport: job.ident) }).value
        else { return nil }
        for page in pages {
            let address = pictureAddress(page)
            guard !KeptForAir.hasPicture(address) else { continue }
            guard let data = try? await Planner.picture(page.path) else { return nil }
            KeptForAir.writePicture(data, path: address)
        }
        return files(of: job)
    }

    /// Every chart kept, `atOnce` at a time, each told to `each` as it is
    /// done (its files, or nil where it failed, and the bytes they come
    /// to, measured off the main actor); none started once the task is
    /// cancelled.
    @MainActor
    static func keepAll(_ jobs: [Job], keeper: @escaping Keeper = { await keep($0) }, each: (Job, [URL]?, _ bytes: Int) -> Void) async {
        await withTaskGroup(of: (Job, [URL]?, Int).self) { group in
            var next = jobs.makeIterator()
            for _ in 0..<atOnce {
                guard let job = next.next() else { break }
                group.addTask { await kept(job, keeper) }
            }
            while let (job, files, bytes) = await group.next() {
                each(job, files, bytes)
                guard !Task.isCancelled, let job = next.next() else { continue }
                group.addTask { await kept(job, keeper) }
            }
        }
    }

    /// One chart kept, and its files' bytes.
    @concurrent
    private nonisolated static func kept(_ job: Job, _ keeper: Keeper) async -> (Job, [URL]?, Int) {
        let files = await keeper(job)
        return (job, files, files?.reduce(0) { $0 + KeptForAir.size(of: $1) } ?? 0)
    }

    /// The charts of a flight's or a state's fields, in their order.
    nonisolated static func jobs(_ fields: [(ident: String, charts: [APITerminalChart])]) -> [Job] {
        fields.flatMap { field in field.charts.map { Job(ident: field.ident, url: $0.url) } }
    }

    // MARK: - A flight's plates

    typealias Ask = Operations.FlightPlates.Input.Query

    /// The route's points sent at most: a curving route's line thinned,
    /// the ends kept, so the address stays short (the web's MOST_FIXES).
    static let mostFixes = 60

    /// A line as the planner reads `fixes`: "lat,lon;lat,lon", to four places.
    static func fixes(_ line: [CLLocationCoordinate2D]) -> String {
        // The step spans the line's gaps over mostFixes - 1, as the web's
        // and Android's: from the points' count, the last kept besides made 61.
        let step = max(1, (line.count - 1 + mostFixes - 2) / (mostFixes - 1))
        let kept = line.indices.filter { $0 % step == 0 || $0 == line.count - 1 }.map { line[$0] }
        return kept.map { String(format: "%.4f,%.4f", $0.latitude, $0.longitude) }.joined(separator: ";")
    }

    /// The flight's ask: its fields in order, its line, the alternate filed,
    /// its arrival from the nav log, and the picked airplane's own cruise
    /// and fuel -- nothing with none picked, never a stock airplane's
    /// (docs/decisions/0011).
    @MainActor
    static func ask(for plan: Plan, rules: FlightRules = .saved()) -> Ask {
        let airplane = plan.airplaneChosen ? plan.altitude?.aircraft : nil
        // The iPhone's plan keeps no departure time, so the ETA is from when
        // it was planned, as AlternateCheck takes it; none while planning.
        var eta: String?
        if let at = plan.plannedAt, let ete = plan.totals?.eteMin { eta = at.addingTimeInterval(ete * 60).formatted(.iso8601) }
        return Ask(route: plan.idents.joined(separator: ","), fixes: plan.course.map { fixes($0.coordinates) },
                   alternate: plan.extras.filedAlternate(rules: rules), eta: eta,
                   tasKt: airplane?.cruiseTasKt, usableGal: airplane?.usableFuelGal, burnGph: airplane?.fuelBurnGph)
    }

    /// The plates the planner names for the flight, with their size.
    static func flightPlates(_ ask: Ask) async throws -> APIFlightPlates {
        try await Planner.call { try await $0.flightPlates(query: ask).ok.body.json }
    }

    /// A size as the app says one kept: "about 52 MB", "about 0.4 MB".
    static func aboutMb(_ bytes: Int) -> String {
        let mb = Double(bytes) / 1_000_000
        if mb >= 1 { return "about \(Int(mb.rounded())) MB" }
        return "about \(String(format: "%.1f", max(0.1, (mb * 10).rounded() / 10))) MB"
    }

    /// The line said before a keep: how much the flight's plates come to,
    /// and where no airplane is picked, that the diversions' need one.
    static func line(_ plates: APIFlightPlates?) -> String? {
        guard let plates else { return nil }
        let fields = plates.fields.count
        let size = "This flight's plates: \(aboutMb(plates.bytes)), \(fields) \(fields == 1 ? "field" : "fields")"
        if plates.basis == "no_airplane" { return "\(size). Pick an airplane to keep the fields within diversion range too." }
        return "\(size), within \(Int((plates.rangeNm ?? 0).rounded())) nm of the route."
    }
}
