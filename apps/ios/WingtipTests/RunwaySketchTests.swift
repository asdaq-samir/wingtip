import Foundation
import Testing
@testable import Wingtip

/// The airport card's runway sketch lays a field out as the engine does
/// (runway_sketch), held to the web's shared cases
/// (apps/web/src/lib/fixtures/runwaySketch.json): NASR's surveyed ends on
/// the engine's flat frame, else a guess along the first end's heading.
struct RunwaySketchTests {
    private final class FixtureBundle {}

    private struct Case: Decodable {
        let about: String
        let input: EngineContract.RunwaySketchInput
        let answer: EngineContract.RunwaySketchAnswer
    }

    private struct Fixture: Decodable { let cases: [Case] }

    private func data() throws -> Data {
        let url = try #require(Bundle(for: FixtureBundle.self).url(forResource: "runwaySketch", withExtension: "json"))
        return try Data(contentsOf: url)
    }

    @Test func theEngineLaysEachSharedCaseOut() throws {
        for c in try JSONDecoder().decode(Fixture.self, from: data()).cases {
            let got = try Engine.runwaySketch(lat: c.input.lat, lon: c.input.lon, runways: c.input.runways)
            #expect(got == c.answer, "\(c.about)")
        }
    }

    /// The card's runways, as the planner sends them, drawn where the
    /// engine lays them: north up, so the screen's y is the south.
    @Test func theSketchDrawsTheEnginesStripsNorthUp() throws {
        let raw = try #require(try JSONSerialization.jsonObject(with: data()) as? [String: Any])
        for c in try #require(raw["cases"] as? [[String: Any]]) {
            let input = try #require(c["input"] as? [String: Any]), answer = try #require(c["answer"] as? [String: Any])
            let planner = try #require(input["runways"] as? [[String: Any]]).map { $0.merging(["closed": false, "lighted": true, "turf": []]) { a, _ in a } }
            let runways = try Planner.json.decode([Runway].self, from: JSONSerialization.data(withJSONObject: planner))
            let lat = try #require(input["lat"] as? Double), lon = try #require(input["lon"] as? Double)
            let strips = RunwaySketch.strips(runways, lat: lat, lon: lon)
            let want = try #require(answer["strips"] as? [[String: Any]])
            #expect(strips.count == want.count, "\(c["about"] ?? "")")
            for (got, strip) in zip(strips, want) {
                let a = try #require(strip["a"] as? [Double]), b = try #require(strip["b"] as? [Double])
                #expect(got.a == CGPoint(x: a[0], y: -a[1]) && got.b == CGPoint(x: b[0], y: -b[1]), "\(c["about"] ?? "")")
            }
        }
    }
}
