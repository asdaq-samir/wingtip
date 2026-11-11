import CoreLocation
import Foundation
import Testing
@testable import Wingtip

/// What Keep for the Air keeps and how its age is said: the engine's
/// `kept_age` against the shared fixture the web and Android read too
/// (apps/web/src/lib/fixtures/keptAge.json), the store's round trip,
/// Ready to fly's `kept` facts, and sign-out leaving the public data.
@MainActor
struct KeptForAirTests {
    private final class FixtureBundle {}

    private struct Fixture: Decodable {
        struct Expected: Decodable {
            let line: String?
            let finding: String?
            let ageMin: Double?
            let detail: String?

            enum CodingKeys: String, CodingKey {
                case line, finding, detail
                case ageMin = "age_min"
            }
        }

        struct Input: Decodable {
            let now: Double
            let fetchedAt: Double
            let kind: String

            enum CodingKeys: String, CodingKey {
                case now, kind
                case fetchedAt = "fetched_at"
            }
        }

        struct Case: Decodable {
            let why: String
            let input: Input
            let expected: Expected
        }

        let cases: [Case]
    }

    private func folder() -> URL {
        FileManager.default.temporaryDirectory.appending(path: "kept-for-air-\(UUID().uuidString)", directoryHint: .isDirectory)
    }

    @Test func eachAgeIsTheEngines() throws {
        let url = try #require(Bundle(for: FixtureBundle.self).url(forResource: "keptAge", withExtension: "json"))
        let fixture = try JSONDecoder().decode(Fixture.self, from: Data(contentsOf: url))
        #expect(!fixture.cases.isEmpty)
        for example in fixture.cases {
            let age = try Engine.keptAge(now: example.input.now, fetchedAt: example.input.fetchedAt, kind: example.input.kind)
            if let line = example.expected.line { #expect(age.line == line, "\(example.why)") }
            if let finding = example.expected.finding { #expect(age.finding == finding, "\(example.why)") }
            if let minutes = example.expected.ageMin { #expect(age.ageMin == minutes, "\(example.why)") }
            if let detail = example.expected.detail { #expect(age.detail == detail, "\(example.why)") }
        }
    }

    @Test func everyKindIsOneTheEngineKnows() throws {
        for kind in KeptForAir.Kind.allCases {
            #expect(try Engine.keptAge(now: 1_794_247_200, fetchedAt: 1_794_247_000, kind: kind.rawValue).kind == kind.rawValue)
        }
    }

    @Test func anAnswerKeptIsReadBackWithItsTime() throws {
        let root = folder()
        defer { try? FileManager.default.removeItem(at: root) }
        let at = Date(timeIntervalSince1970: 1_794_246_000)
        KeptForAir.write(["KOSH", "KMSN"], .notams, key: "KOSH KMSN", at: at, in: root)
        let kept = try #require(KeptForAir.read([String].self, .notams, key: "KOSH KMSN", in: root))
        #expect(kept.value == ["KOSH", "KMSN"] && kept.fetchedAt == at)
        #expect(KeptForAir.has(.notams, key: "KOSH KMSN", in: root))
        #expect(KeptForAir.read([String].self, .notams, key: "KOSH KDLH", in: root) == nil)
        // A chart's long address is a file name all the same.
        let long = String(repeating: "https://aeronav.faa.gov/d-tpp/2611/", count: 20)
        KeptForAir.writePicture(Data([1, 2, 3]), path: long, in: root)
        #expect(KeptForAir.picture(long, in: root) == Data([1, 2, 3]))
    }

    @Test func signingOutForgetsThePilotsOwnAndKeepsThePublicData() {
        let root = folder()
        defer { try? FileManager.default.removeItem(at: root) }
        KeptForAir.write("go", .goNoGo, key: "KOSH KMSN", in: root)
        KeptForAir.write("card", .airports, key: "KOSH", in: root)
        KeptForAir.writeManifest(KeptForAir.Manifest(kinds: ["airports"], bytes: 10, at: Date()), route: "KOSH KMSN", in: root)
        Session.forgetPilot(UserDefaults(suiteName: "kept-for-air-tests")!, kept: root)
        #expect(!KeptForAir.has(.goNoGo, key: "KOSH KMSN", in: root))
        #expect(KeptForAir.manifest(route: "KOSH KMSN", in: root) == nil)
        #expect(KeptForAir.has(.airports, key: "KOSH", in: root))
    }

    @Test func readyToFlyIsToldWhatIsOnBoard() {
        let none = ReadyFacts.kept(manifest: nil, saved: false, briefed: false, notams: false, goNoGo: false)
        #expect(none.onBoard == [] && none.missing?.count == KeptForAir.Kind.allCases.count && none.sizeMb == nil)
        let manifest = KeptForAir.Manifest(kinds: ["airports", "plates", "weather_loop"], bytes: 3_400_000, at: Date())
        let all = ReadyFacts.kept(manifest: manifest, saved: true, briefed: true, notams: true, goNoGo: true)
        #expect(all.missing == [] && all.onBoard?.count == 8 && all.sizeMb == 3.4)
        let answer = try? Engine.readyToFly(now: 1_794_247_200, plan: EngineContract.ReadyToFlyInputPlan(route: true, airplane: "N1", altitudeFt: 3500),
                                            kept: ReadyFacts.kept(manifest: nil, saved: true, briefed: true, notams: false, goNoGo: false))
        #expect(answer?.items.first { $0.key == "kept" }?.fix == "keep_for_air")
    }

    @Test func theButtonSaysTheSize() {
        #expect(KeepForAirLabel.megabytes(0.42) == "0.4 MB")
        #expect(KeepForAirLabel.megabytes(12.6) == "13 MB")
    }

    @Test func theFieldsNotamsAreKeptUnderTheKeyTheCardReads() {
        // The card asks KeptForAir.answer(.notams, key: fieldNotamsKey(ident)),
        // and so does Keep for the Air: one key, not the flight's.
        #expect(KeptForAir.fieldNotamsKey("kosh") == "field:KOSH")
        #expect(KeptForAir.pdfKey("https://aeronav.faa.gov/d-tpp/2611/00045ad.pdf") == "pdf:https://aeronav.faa.gov/d-tpp/2611/00045ad.pdf")
    }

    @Test func theRadarKeptAlongARouteIsCapped() throws {
        // Campbell (C81) to Duluth: about 300 nm, a corridor 25 nm wide each way.
        let line = [CLLocationCoordinate2D(latitude: 42.3246, longitude: -88.0741), CLLocationCoordinate2D(latitude: 46.842, longitude: -92.194)]
        let tiles = try KeepRadar.tiles(along: line)
        #expect(!tiles.isEmpty && tiles.count <= KeepRadar.most)
        #expect(tiles.allSatisfy { (KeepRadar.minZoom...KeepRadar.maxZoom).contains($0.z) })
        // The coarsest first, so a cap cuts the finest.
        #expect(tiles.first?.z == KeepRadar.minZoom)
    }
}
