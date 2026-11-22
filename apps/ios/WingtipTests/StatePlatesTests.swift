import CoreLocation
import Foundation
import Testing
@testable import Wingtip

/// Downloads' plates by state (StatePlates) and Keep for the Air's flight
/// plates (KeepPlates), on fake planner answers: the kept record's
/// progress and failures, a delete that leaves the booklet another kept
/// state holds, the update to the next cycle at its 0901Z and not a minute
/// before, and the size line said before a keep.
@MainActor
struct StatePlatesTests {
    /// How many times the planner's list of states was asked.
    private actor Asked {
        var states = 0
        func bump() { states += 1 }
    }

    private struct Rig {
        let root: URL
        let kept: URL
        let model: StatePlates
        let asked: Asked
    }

    private static func chart(_ cycle: String, _ pdf: String) -> APITerminalChart {
        APITerminalChart(kind: "IAP", name: pdf, url: "https://aeronav.faa.gov/d-tpp/\(cycle)/\(pdf)")
    }

    private static func list(_ id: String, _ cycle: String, nextAt: String, _ fields: [String: [String]]) -> APIPlateStateCharts {
        APIPlateStateCharts(cycle: cycle, fields: fields.sorted { $0.key < $1.key }.map { field in
            APIPlateStateField(charts: field.value.map { chart(cycle, $0) }, ident: field.key)
        }, id: id, name: id == "CA" ? "California" : id, nextAt: nextAt)
    }

    /// A model on its own folders, its planner the lists given, a chart
    /// "kept" by writing its one page and picture, those in `failing` not.
    private func rig(_ lists: [APIPlateStateCharts], serving: String = "2612", failing: Set<String> = []) -> Rig {
        let root = FileManager.default.temporaryDirectory.appending(path: "state-plates-\(UUID().uuidString)", directoryHint: .isDirectory)
        let kept = root.appending(path: "kept", directoryHint: .isDirectory)
        let asked = Asked()
        let byKey = Dictionary(uniqueKeysWithValues: lists.map { ("\($0.cycle)/\($0.id)", $0) })
        let source = StatePlates.Source(
            states: {
                await asked.bump()
                return APIPlateStates(cycle: serving, nextAt: "2027-02-18T09:01:00Z", state: "current", states: [])
            },
            state: { cycle, id in
                guard let list = byKey["\(cycle)/\(id)"] else { throw Planner.Failure(status: 404, detail: nil) }
                return list
            },
            keeper: { job in
                guard !failing.contains(job.url) else { return nil }
                let pdf = String(job.url.split(separator: "/").last ?? "")
                let cycle = String(job.url.split(separator: "/").dropLast().last ?? "")
                let page = ChartPage(edition: cycle, height: 10, page: 1, pdf: pdf, source: "dtpp", width: 10)
                KeptForAir.write([page], .plates, key: KeepPlates.key(job), in: kept)
                KeptForAir.writePicture(Data(repeating: 1, count: 100), path: KeepPlates.pictureAddress(page), in: kept)
                return KeepPlates.files(of: job, in: kept)
            })
        return Rig(root: root, kept: kept, model: StatePlates(source: source, folder: root, keptFolder: kept), asked: asked)
    }

    private func exists(_ urls: [URL]) -> Bool { !urls.isEmpty && urls.allSatisfy { FileManager.default.fileExists(atPath: $0.path) } }

    private static let nextAt = "2026-12-24T09:01:00Z"

    @Test func aKeptStateCountsItsChartsAndFailuresAndIsKeptOnDisk() async throws {
        let rig = rig([Self.list("CA", "2611", nextAt: Self.nextAt, ["KMRY": ["A1.PDF", "A2.PDF"], "KSNS": ["B1.PDF"]])],
                      failing: ["https://aeronav.faa.gov/d-tpp/2611/B1.PDF"])
        defer { try? FileManager.default.removeItem(at: rig.root) }
        await rig.model.keep("CA", cycle: "2611")
        let kept = try #require(rig.model.kept.first)
        #expect(kept.name == "California" && kept.cycle == "2611" && kept.nextAt == Self.nextAt)
        #expect(kept.charts == 3 && kept.done == 3 && kept.failed == 1 && !kept.unfinished)
        #expect(kept.bytes > 200)
        #expect(rig.model.running.isEmpty)
        // The record is read back by the next launch's model.
        let again = StatePlates(source: .planner, folder: rig.root, keptFolder: rig.kept)
        #expect(again.kept == rig.model.kept)
    }

    @Test func aStateWhoseListCannotBeHadSaysSoAndKeepsNothing() async {
        let rig = rig([])
        defer { try? FileManager.default.removeItem(at: rig.root) }
        await rig.model.keep("CA", cycle: "2611")
        #expect(rig.model.kept.isEmpty)
        #expect(rig.model.problems["CA"] == "The plates couldn't be listed. Try again with a connection.")
    }

    @Test func deletingAStateLeavesTheBookletAnotherStateHolds() async {
        // A region's takeoff minimums (SW2TO) is in each of its states.
        let rig = rig([Self.list("CA", "2611", nextAt: Self.nextAt, ["KMRY": ["A1.PDF", "SW2TO.PDF"]]),
                       Self.list("NV", "2611", nextAt: Self.nextAt, ["KLAS": ["SW2TO.PDF"]])])
        defer { try? FileManager.default.removeItem(at: rig.root) }
        await rig.model.keep("CA", cycle: "2611")
        await rig.model.keep("NV", cycle: "2611")
        let own = KeepPlates.files(of: .init(ident: "KMRY", url: "https://aeronav.faa.gov/d-tpp/2611/A1.PDF"), in: rig.kept)
        let shared = KeepPlates.files(of: .init(ident: "KLAS", url: "https://aeronav.faa.gov/d-tpp/2611/SW2TO.PDF"), in: rig.kept)
        let caBooklet = KeptForAir.file(KeptForAir.Kind.plates.rawValue, "KMRY|https://aeronav.faa.gov/d-tpp/2611/SW2TO.PDF", in: rig.kept)
        #expect(exists(own) && exists(shared))
        await rig.model.delete("CA")
        #expect(rig.model.kept.map(\.id) == ["NV"])
        #expect(own.allSatisfy { !FileManager.default.fileExists(atPath: $0.path) })
        #expect(!FileManager.default.fileExists(atPath: caBooklet.path))
        // The booklet's page, and Nevada's own answer for it, stay.
        #expect(exists(shared))
    }

    @Test func deletingAStateLeavesThePlatesARouteKeptForTheAirHolds() async {
        let rig = rig([Self.list("CA", "2611", nextAt: Self.nextAt, ["KMRY": ["A1.PDF", "A2.PDF"]])])
        defer { try? FileManager.default.removeItem(at: rig.root) }
        await rig.model.keep("CA", cycle: "2611")
        let flown = KeepPlates.files(of: .init(ident: "KMRY", url: "https://aeronav.faa.gov/d-tpp/2611/A1.PDF"), in: rig.kept)
        let other = KeepPlates.files(of: .init(ident: "KMRY", url: "https://aeronav.faa.gov/d-tpp/2611/A2.PDF"), in: rig.kept)
        // Keep for the Air kept KSFO to KMRY with KMRY's A1 among its files.
        KeptForAir.writeManifest(KeptForAir.Manifest(kinds: ["plates"], bytes: 1, at: Date(), files: flown.map { KeptForAir.relative($0, in: rig.kept) }),
                                 route: "KSFO KMRY", in: rig.kept)
        await rig.model.delete("CA")
        #expect(exists(flown))
        #expect(other.allSatisfy { !FileManager.default.fileExists(atPath: $0.path) })
    }

    @Test func aKeptStateUpdatesAtTheNextCyclesTimeNotAMinuteBefore() async throws {
        let rig = rig([Self.list("CA", "2611", nextAt: Self.nextAt, ["KMRY": ["A1.PDF"]]),
                       Self.list("CA", "2612", nextAt: "2027-02-18T09:01:00Z", ["KMRY": ["A1.PDF"]])])
        defer { try? FileManager.default.removeItem(at: rig.root) }
        await rig.model.keep("CA", cycle: "2611")
        let old = KeepPlates.files(of: .init(ident: "KMRY", url: "https://aeronav.faa.gov/d-tpp/2611/A1.PDF"), in: rig.kept)
        let takesOver = try #require(ISO8601DateFormatter().date(from: Self.nextAt))
        await rig.model.refreshDue(now: takesOver.addingTimeInterval(-60))
        #expect(rig.model.kept.first?.cycle == "2611")
        #expect(await rig.asked.states == 0)
        #expect(exists(old))
        await rig.model.refreshDue(now: takesOver)
        #expect(await rig.asked.states == 1)
        let kept = try #require(rig.model.kept.first)
        #expect(kept.cycle == "2612" && kept.done == 1 && kept.nextAt == "2027-02-18T09:01:00Z")
        #expect(exists(KeepPlates.files(of: .init(ident: "KMRY", url: "https://aeronav.faa.gov/d-tpp/2612/A1.PDF"), in: rig.kept)))
        // The old cycle's files go once the new one is whole.
        #expect(old.allSatisfy { !FileManager.default.fileExists(atPath: $0.path) })
    }

    @Test func aStoppedDownloadGoesOn() async throws {
        let rig = rig([Self.list("CA", "2611", nextAt: Self.nextAt, ["KMRY": ["A1.PDF", "A2.PDF"]])])
        defer { try? FileManager.default.removeItem(at: rig.root) }
        // A record left at one of two charts, as an app closed mid-way leaves it.
        let stopped = [KeptPlateState(id: "CA", name: "California", cycle: "2611", nextAt: Self.nextAt, charts: 2, done: 1)]
        try FileManager.default.createDirectory(at: rig.root, withIntermediateDirectories: true)
        try JSONEncoder().encode(stopped).write(to: rig.root.appending(path: "kept.json"))
        let list = Self.list("CA", "2611", nextAt: Self.nextAt, ["KMRY": ["A1.PDF", "A2.PDF"]])
        let model = StatePlates(source: .init(states: { throw CancellationError() }, state: { _, _ in list }, keeper: { _ in [] }),
                                folder: rig.root, keptFolder: rig.kept)
        #expect(model.kept.first?.unfinished == true)
        await model.refreshDue(now: try #require(ISO8601DateFormatter().date(from: "2026-12-01T00:00:00Z")))
        #expect(model.kept.first?.done == 2 && model.kept.first?.unfinished == false)
    }

    // MARK: - Keep for the Air's flight plates

    private static func flight(basis: String, range: Double?, bytes: Int, fields: Int) -> APIFlightPlates {
        APIFlightPlates(alternate: nil, alternatePicked: false, basis: basis, bytes: bytes, charts: fields, cycle: "2611",
                        fields: (0..<fields).map { APIKeptPlateField(charts: [], ident: "K\($0)", offNm: nil, role: "diversion") },
                        nextAt: nextAt, rangeNm: range, reserveMin: 45, state: "current")
    }

    @Test func theSizeLineSaysTheRangeOrAsksForAnAirplane() {
        #expect(KeepPlates.line(Self.flight(basis: "reserve", range: 90, bytes: 41_600_000, fields: 6))
            == "This flight's plates: about 42 MB, 6 fields, within 90 nm of the route.")
        #expect(KeepPlates.line(Self.flight(basis: "tanks", range: 75.4, bytes: 400_000, fields: 1))
            == "This flight's plates: about 0.4 MB, 1 field, within 75 nm of the route.")
        #expect(KeepPlates.line(Self.flight(basis: "no_airplane", range: nil, bytes: 12_000_000, fields: 3))
            == "This flight's plates: about 12 MB, 3 fields. Pick an airplane to keep the fields within diversion range too.")
        #expect(KeepPlates.line(nil) == nil)
    }

    @Test func theRoutesLineIsThinnedToSixtyPointsWithItsEnds() {
        let line = (0..<200).map { CLLocationCoordinate2D(latitude: 37 + Double($0) / 100, longitude: -122) }
        let points = KeepPlates.fixes(line).split(separator: ";")
        #expect(points.count <= KeepPlates.mostFixes)
        // 120 points made 61 when the step was taken from the points' count.
        for count in 2...400 {
            let longer = (0..<count).map { CLLocationCoordinate2D(latitude: Double($0) / 100, longitude: 0) }
            #expect(KeepPlates.fixes(longer).split(separator: ";").count <= KeepPlates.mostFixes)
        }
        #expect(points.first == "37.0000,-122.0000" && points.last == "38.9900,-122.0000")
        #expect(KeepPlates.fixes(Array(line.prefix(3))) == "37.0000,-122.0000;37.0100,-122.0000;37.0200,-122.0000")
    }
}
