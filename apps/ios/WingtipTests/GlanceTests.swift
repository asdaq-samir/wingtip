import Foundation
import Testing
@testable import Wingtip

/// The Go / No-Go at a glance (Glance), the engine's gonogo_glance_lines:
/// the shared cases the web's glance.test.ts and the engine's own test
/// read (apps/web/src/lib/fixtures/goNoGoBrief.json) answered the same
/// through the iPhone's engine, and the planner's answer as GoNoGoTests
/// shapes it put into lines, its findings found again.
struct GlanceTests {
    private func answer(_ json: String = GoNoGoTests.answer) throws -> GoNoGoAnswer {
        try Planner.json.decode(GoNoGoAnswer.self, from: Data(json.utf8))
    }

    @Test func theEngineAnswersTheSharedCasesAsTheWebDoes() throws {
        let fixture = try EvalFixtures.load("goNoGoBrief")
        let cases = try #require(fixture["glance"] as? [[String: Any]])
        #expect(!cases.isEmpty)
        for each in cases {
            let input = try JSONDecoder().decode(EngineContract.GonogoGlanceLinesInput.self,
                                                 from: JSONSerialization.data(withJSONObject: try #require(each["input"])))
            let expected = try JSONDecoder().decode(EngineContract.GonogoGlanceLinesAnswer.self,
                                                    from: JSONSerialization.data(withJSONObject: try #require(each["answer"])))
            let got = try Engine.gonogoGlanceLines(items: input.items, fields: input.fields, raw: input.raw)
            #expect(got == expected, "\(each["name"] ?? "")")
        }
    }

    @Test func theStopsThenTheCautionsAtMostThreeEachOneSentence() throws {
        let glance = Glance(try answer())
        #expect(glance.lines.map(\.key) == ["balance", "weather", "risk"])
        #expect(glance.lines.map(\.finding) == ["stop", "caution", "caution"])
        #expect(glance.acted.map(\.key) == ["balance", "weather", "risk"])
        for line in glance.lines { #expect(line.words.count <= 140, "\(line.words)") }
        #expect(glance.lines[0].words == "The baggage, 170 lb in all, is over its 120 lb: move or leave some weight")
    }

    @Test func theRestIsOneRowWithTheEnginesWords() throws {
        let glance = Glance(try answer())
        // The runways, not worked out, are counted; the clear findings
        // follow in the planner's order.
        #expect(glance.rest.map(\.key) == ["airspace", "altitude", "fuel", "runways"])
        #expect(glance.restWords == "1 more to look at")
    }

    @Test func aClearFlightHasNoLinesAndOneRow() throws {
        let json = #"{"line":{"finding":"ok","words":"Go"},"items":[{"key":"weather","label":"Weather","finding":"ok","detail":"VFR","tab":"enroute"},{"key":"fuel","label":"Fuel","finding":"ok","detail":"Plenty","tab":"preflight"}],"self_checks":[]}"#
        let glance = Glance(try answer(json))
        #expect(glance.lines.isEmpty)
        #expect(glance.restWords == "Weather, fuel: nothing to fix")
        #expect(glance.restFinding == "ok")
    }
}
