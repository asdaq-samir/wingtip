import CoreLocation
import Foundation
import Testing
@testable import Wingtip

/// Ready to fly's facts as the phone gathers them, and its answer drawn
/// as the engine gives it: no airplane is passed as none, never a type
/// assumed (docs/decisions/0011), and the actions shown are the engine's
/// own, checked against the shared fixture the web reads too
/// (apps/web/src/lib/fixtures/readyToFly.json).
@MainActor
struct ReadyToFlyTests {
    private final class FixtureBundle {}

    private struct Fixture: Decodable {
        struct Expected: Decodable {
            let finding: String
            let actions: [String]
            let line: String?
            let nextCycle: String?
            let briefingAgeMin: Double?

            enum CodingKeys: String, CodingKey {
                case finding, actions, line
                case nextCycle = "next_cycle"
                case briefingAgeMin = "briefing_age_min"
            }
        }

        struct Case: Decodable {
            let why: String
            let input: EngineContract.ReadyToFlyInput
            let expected: Expected
        }

        let cases: [Case]
    }

    @Test func noAirplanePickedIsPassedAsNone() {
        let plan = Plan()
        plan.dep = "KOSH"; plan.dest = "KMSN"
        let facts = ReadyFacts.plan(plan)
        #expect(facts.route == true && facts.airplane == nil && facts.altitudeFt == nil)
        plan.aircraft = "pa28"
        #expect(ReadyFacts.plan(plan).airplane == "PA28")
        plan.tail = "N123AB"
        #expect(ReadyFacts.plan(plan).airplane == "N123AB")
        plan.flyNoAirplane()
        #expect(ReadyFacts.plan(plan).airplane == nil)
    }

    @Test func theActionsShownAreTheEngines() throws {
        let url = try #require(Bundle(for: FixtureBundle.self).url(forResource: "readyToFly", withExtension: "json"))
        let fixture = try JSONDecoder().decode(Fixture.self, from: Data(contentsOf: url))
        for example in fixture.cases {
            let model = ReadyToFly()
            model.ask(example.input)
            let answer = try #require(model.answer, "\(example.why): \(model.problem ?? "")")
            #expect(answer.finding == example.expected.finding, "\(example.why)")
            #expect(answer.actions.map(\.key) == example.expected.actions, "\(example.why)")
            #expect(answer.actions.count <= 3)
            if let line = example.expected.line { #expect(answer.line == line, "\(example.why)") }
            if let next = example.expected.nextCycle { #expect(answer.nextCycle == next) }
            if let age = example.expected.briefingAgeMin { #expect(answer.briefingAgeMin == age) }
        }
    }

    @Test func eachFieldsReportIsReadFromTheBriefing() throws {
        let json = #"{"airports":{},"forecast":{"stations":[{"icaoId":"KOSH","ceiling_ft":null,"visibility_sm":null,"raw":"TAF KOSH 091720Z"}]},"hazards":[],"metars":{"KOSH":{"observed_at":"2026-11-09T17:53:00Z"},"C81":null},"weather_unavailable":[]}"#
        let briefing = try Planner.json.decode(Briefing.self, from: Data(json.utf8))
        let fields = try #require(ReadyFacts.fields(dep: "OSH", dest: "C81", briefing: briefing))
        #expect(fields.map(\.ident) == ["OSH", "C81"] && fields.map(\.role) == ["departure", "destination"])
        #expect(fields[0].metarObserved == 1_794_246_780 && fields[0].taf == true)
        #expect(fields[1].metarObserved == nil && fields[1].taf == false)
        #expect(ReadyFacts.fields(dep: "OSH", dest: "C81", briefing: nil) == nil)
    }

    @Test func theFactsAreTheSystemsAsTheyAre() {
        #expect(ReadyFacts.isoDay("10-29-2026") == "2026-10-29")
        #expect(ReadyFacts.isoDay("2026-10-29") == "2026-10-29")
        #expect(ReadyFacts.isoDay("2611") == nil && ReadyFacts.isoDay(nil) == nil)
        #expect(ReadyFacts.location(.authorizedWhenInUse) == "granted")
        #expect(ReadyFacts.location(.denied) == "denied" && ReadyFacts.location(.notDetermined) == "prompt")
        // The simulator's unknown battery leaves the item out.
        let unknown = ReadyFacts.battery(level: -1, state: .unknown)
        #expect(unknown.pct == nil && unknown.charging == nil)
        let low = ReadyFacts.battery(level: 0.3, state: .unplugged)
        #expect(low.pct == 30 && low.charging == false)
        // No receiver for a pilot who has never had one.
        #expect(ReadyFacts.receiver(used: false, listening: true, live: false) == nil)
        #expect(ReadyFacts.receiver(used: true, listening: true, live: false)?.connected == false)
        #expect(ReadyFacts.dayWords("2026-11-26") == "26 Nov")
    }

    @Test func aPlanIsSavedOnlyWhenItsNavLogIsKept() {
        let at = Date(timeIntervalSince1970: 1_800_000_000)
        let kept = Kept(dep: "KOSH", dest: "KMSN", stops: [], aircraft: "none", totals: Totals.preview(distanceNm: 60, eteMin: 40), plannedAt: at)
        #expect(ReadyFacts.saved(dep: "KOSH", dest: "KMSN", stops: [], kept: kept))
        #expect(!ReadyFacts.saved(dep: "KOSH", dest: "KDLH", stops: [], kept: kept))
        #expect(!ReadyFacts.saved(dep: "KOSH", dest: "KMSN", stops: [], kept: nil))
    }
}
