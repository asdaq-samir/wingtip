import Foundation
import Testing
@testable import Wingtip

/// The engine's one "... ago" (Format.ago) and the SIDs and STARs typed
/// among a route's words (TypedRoute), held to the shared fixtures the
/// engine, the web and Android read too (apps/web/src/lib/fixtures
/// timeAgo.json and routeProcedures.json).
struct TimeAgoTests {
    private final class FixtureBundle {}

    private struct Ago: Decodable {
        struct Case: Decodable {
            struct Input: Decodable { let seconds: Double }
            let why: String
            let input: Input
            let expected: String
        }
        let cases: [Case]
    }

    private struct Procedures: Decodable {
        struct Case: Decodable {
            struct Input: Decodable { let words: [String] }
            struct Named: Decodable, Equatable { let name: String; let before: String?; let after: String? }
            let why: String
            let input: Input
            let expected: [Named]
        }
        let cases: [Case]
    }

    private func fixture<T: Decodable>(_ name: String) throws -> T {
        let url = try #require(Bundle(for: FixtureBundle.self).url(forResource: name, withExtension: "json"))
        return try JSONDecoder().decode(T.self, from: Data(contentsOf: url))
    }

    @Test func agoIsTheEnginesAsTheWebWritesIt() throws {
        let ago: Ago = try fixture("timeAgo")
        #expect(!ago.cases.isEmpty)
        for example in ago.cases {
            #expect(Format.ago(example.input.seconds) == example.expected, "\(example.why)")
        }
    }

    @Test func typedProceduresAreTheEnginesAsTheWebReadsThem() throws {
        let procedures: Procedures = try fixture("routeProcedures")
        for example in procedures.cases {
            let found = try Engine.routeProcedures(words: example.input.words)
            #expect(found.map { Procedures.Case.Named(name: $0.name, before: $0.before, after: $0.after) } == example.expected, "\(example.why)")
        }
    }

    @Test func aRouteTypedWithASidAndAStarKeepsThemOutOfItsPoints() throws {
        let read = try #require(try TypedRoute.read("KMSP BAEE1 BAE V191 OSH OSHH2 KATW"))
        #expect(read.dep == "KMSP")
        #expect(read.dest == "KATW")
        #expect(read.stops == ["BAE", "V191", "OSH"])
        #expect(read.procedures.map(\.name) == ["BAEE1", "OSHH2"])
    }
}
