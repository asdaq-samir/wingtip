import Foundation
import Observation

/// A state's plates kept, or being kept: its d-TPP cycle, when the next
/// takes over, and how far its charts have come.
nonisolated struct KeptPlateState: Codable, Equatable, Identifiable, Sendable {
    let id: String
    var name: String
    var cycle: String
    /// When the next cycle takes over, ISO: 0901Z on its AIRAC date, as
    /// the planner gives it (the engine's data_cycle).
    var nextAt: String
    var charts: Int
    var done = 0
    var failed = 0
    var bytes = 0

    /// Whether the fetch stopped short of its every chart (the app closed).
    var unfinished: Bool { done < charts }

    /// Whether the cycle has been replaced at `now`: the planner's next_at
    /// has come. A plain comparison of the planner's moment with the
    /// clock; the cycle's dates are the engine's, not worked out here.
    func replaced(now: Date) -> Bool {
        guard let at = ISO8601DateFormatter().date(from: nextAt) else { return false }
        return at <= now
    }
}

/// The FAA's plates kept a state at a time (Setup → Downloads → Plates),
/// as Downloads keeps the charts' regions and as ForeFlight and Garmin
/// Pilot download plates (the market-gap audit's 3): the planner lists a
/// state's open fields and their charts of the d-TPP cycle in force
/// (wingtip.plate_sets), and each chart is kept as the card's Charts tab
/// shows it (KeepPlates), beside Keep for the Air's. Once a kept state's
/// cycle is replaced it is fetched again for the cycle the planner now
/// serves, and the old one's files deleted when the new one is whole
/// (`refreshDue`, asked each minute with the app active). The web's
/// features/statePlates is the same. Public data, so it outlives a
/// sign-out.
@MainActor
@Observable
final class StatePlates {
    /// The planner's answers, injectable for the tests.
    struct Source: Sendable {
        var states: @Sendable () async throws -> APIPlateStates
        var state: @Sendable (_ cycle: String, _ id: String) async throws -> APIPlateStateCharts
        var keeper: KeepPlates.Keeper

        static let planner = Source(
            states: { try await Planner.call { try await $0.plateStates().ok.body.json } },
            state: { cycle, id in try await Planner.call { try await $0.plateState(path: .init(cycle: cycle, state: id)).ok.body.json } },
            keeper: { await KeepPlates.keep($0) })
    }

    /// The states kept, by name.
    private(set) var kept: [KeptPlateState] = []
    /// The states being fetched now.
    private(set) var running: Set<String> = []
    /// The cycle a kept state is being updated to, while it is.
    private(set) var updating: [String: String] = [:]
    /// Why a state's list could not be had, said on its row.
    private(set) var problems: [String: String] = [:]

    private let source: Source
    /// Where the record and each kept state's list are (Application Support).
    private let folder: URL
    /// Where the charts' files are: Keep for the Air's.
    private let keptFolder: URL
    @ObservationIgnored private var tasks: [String: Task<Void, Never>] = [:]

    /// The record written every this many charts, not each one.
    static let writeEvery = 20

    init(source: Source = .planner, folder: URL? = nil, keptFolder: URL = KeptForAir.folder) {
        self.source = source
        self.folder = folder ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appending(path: "state-plates", directoryHint: .isDirectory)
        self.keptFolder = keptFolder
        kept = (try? Data(contentsOf: recordFile)).flatMap { try? JSONDecoder().decode([KeptPlateState].self, from: $0) } ?? []
    }

    private var recordFile: URL { folder.appending(path: "kept.json") }

    private nonisolated static func listFile(_ cycle: String, _ id: String, in folder: URL) -> URL {
        folder.appending(path: "lists", directoryHint: .isDirectory).appending(path: "\(cycle)-\(id).json")
    }

    private func put(_ record: KeptPlateState, write: Bool = true) {
        kept = (kept.filter { $0.id != record.id } + [record]).sorted { $0.name.localizedCompare($1.name) == .orderedAscending }
        if write { save() }
    }

    private func save() {
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        if let data = try? JSONEncoder().encode(kept) { try? data.write(to: recordFile, options: .atomic) }
    }

    func isKept(_ id: String) -> Bool { kept.contains { $0.id == id } }

    /// The states whose plates the planner can give, with their sizes.
    func offered() async throws -> APIPlateStates { try await source.states() }

    /// A state's plates of `cycle` kept in a task of its own, which Delete
    /// stops; the task, for a caller that waits on it.
    @discardableResult
    func start(_ id: String, cycle: String) -> Task<Void, Never> {
        if let task = tasks[id] { return task }
        let task = Task { [weak self] in
            await self?.keep(id, cycle: cycle)
            self?.tasks[id] = nil
        }
        tasks[id] = task
        return task
    }

    /// A state's plates of `cycle` kept, going on from a stop where it was
    /// kept before (a chart whole on the phone is not fetched again);
    /// where an older cycle of it was kept, that one shown until this one
    /// is whole, then its files deleted.
    func keep(_ id: String, cycle: String) async {
        guard !running.contains(id) else { return }
        running.insert(id)
        problems[id] = nil
        defer { running.remove(id); updating[id] = nil }
        let before = kept.first { $0.id == id }
        let list: APIPlateStateCharts
        do {
            list = try await source.state(cycle, id)
        } catch {
            // The list could not be had: said on the row, a cycle kept
            // before left as it was.
            if !Task.isCancelled { problems[id] = "The plates couldn't be listed. Try again with a connection." }
            return
        }
        guard !Task.isCancelled else { return }
        Self.write(list, in: folder)
        let jobs = KeepPlates.jobs(list.fields.map { ($0.ident, $0.charts) })
        var record = KeptPlateState(id: id, name: list.name, cycle: list.cycle, nextAt: list.nextAt, charts: jobs.count)
        let same = before == nil || before?.cycle == list.cycle
        if same { put(record) } else { updating[id] = list.cycle }
        await KeepPlates.keepAll(jobs, keeper: source.keeper) { _, files in
            guard !Task.isCancelled else { return }
            record.done += 1
            if let files { record.bytes += files.reduce(0) { $0 + KeptForAir.size(of: $1) } } else { record.failed += 1 }
            if same { put(record, write: record.done % Self.writeEvery == 0) }
        }
        guard !Task.isCancelled else { return }
        put(record)
        if let before, before.cycle != list.cycle { await forget([(before.cycle, id)]) }
    }

    /// A kept state deleted: its fetch stopped, its files gone but those
    /// another kept state also holds (a region's takeoff-minimums booklet
    /// is in each of its states) or a route kept for the air holds.
    func delete(_ id: String) async {
        tasks[id]?.cancel()
        tasks[id] = nil
        guard let record = kept.first(where: { $0.id == id }) else { return }
        let lists = [(record.cycle, id)] + (updating[id].map { [($0, id)] } ?? [])
        kept.removeAll { $0.id == id }
        save()
        await forget(lists)
    }

    /// The files of the lists named (cycle, state) deleted, those of every
    /// state still kept and of every route kept for the air (its manifest)
    /// left; and the lists with them. Read off the main actor, as a
    /// state's thousands of charts are a file each to read.
    private func forget(_ lists: [(String, String)]) async {
        await Self.erase(lists, keeping: kept.map { ($0.cycle, $0.id) }, in: folder, keptIn: keptFolder)
    }

    @concurrent
    private nonisolated static func erase(_ gone: [(String, String)], keeping keep: [(String, String)], in folder: URL, keptIn keptFolder: URL) async {
        // A route kept for the air holds its plates too (its manifest's files).
        let held = Set(keep.flatMap { files(cycle: $0.0, id: $0.1, in: folder, keptIn: keptFolder) }.map(\.standardizedFileURL))
            .union(KeptForAir.manifestFiles(in: keptFolder))
        for (cycle, id) in gone {
            for file in files(cycle: cycle, id: id, in: folder, keptIn: keptFolder) where !held.contains(file.standardizedFileURL) {
                try? FileManager.default.removeItem(at: file)
            }
            try? FileManager.default.removeItem(at: listFile(cycle, id, in: folder))
        }
    }

    private nonisolated static func write(_ list: APIPlateStateCharts, in folder: URL) {
        let file = listFile(list.cycle, list.id, in: folder)
        try? FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
        if let data = try? JSONEncoder().encode(list) { try? data.write(to: file, options: .atomic) }
    }

    /// Every file a kept state's list names on the phone.
    nonisolated static func files(cycle: String, id: String, in folder: URL, keptIn keptFolder: URL) -> [URL] {
        guard let data = try? Data(contentsOf: listFile(cycle, id, in: folder)),
              let list = try? JSONDecoder().decode(APIPlateStateCharts.self, from: data) else { return [] }
        return KeepPlates.jobs(list.fields.map { ($0.ident, $0.charts) }).flatMap { KeepPlates.files(of: $0, in: keptFolder) }
    }

    // MARK: - Kept current

    /// The kept states kept current at `now`: one whose fetch stopped goes
    /// on, and one whose cycle the planner's next_at says has been
    /// replaced is fetched for the cycle the planner now serves. Waits on
    /// the fetches it starts.
    func refreshDue(now: Date = .now) async {
        let due = kept.filter { !running.contains($0.id) && ($0.replaced(now: now) || $0.unfinished) }
        guard !due.isEmpty else { return }
        var latest: String?
        if due.contains(where: { $0.replaced(now: now) }) { latest = (try? await source.states())?.cycle }
        var started: [Task<Void, Never>] = []
        for state in due {
            let cycle = state.replaced(now: now) ? (latest ?? state.cycle) : state.cycle
            if cycle != state.cycle || state.unfinished { started.append(start(state.id, cycle: cycle)) }
        }
        for task in started { await task.value }
    }

    /// Asked at once and every minute while the app is active (its task is
    /// the scene's, so a return to the foreground asks again), as
    /// Charts.watchChangeover asks of the charts.
    func watch() async {
        while !Task.isCancelled {
            await refreshDue()
            try? await Task.sleep(for: .seconds(60))
        }
    }
}
