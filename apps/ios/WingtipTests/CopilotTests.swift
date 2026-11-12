import CoreLocation
import Foundation
import Testing
@testable import Wingtip

private final class CopilotFixtureBundle {}

/// The in-flight copilot: the planner's answer round the airplane handed
/// to the engine's copilot_watch, held to the shared fixture
/// (apps/web/src/lib/fixtures/copilot.json, the engine's and the web's
/// cases), and the rest of the route as /api/copilot/around takes it.
@MainActor
struct CopilotTests {
    private func base() throws -> [String: Any] {
        let url = try #require(Bundle(for: CopilotFixtureBundle.self).url(forResource: "copilot", withExtension: "json"))
        let all = try #require(try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
        return try #require(all["base"] as? [String: Any])
    }

    @Test func oshkoshGoingIfrNamesFondDuLac() throws {
        let base = try base()
        // The fixture's fields as the planner sends them: with the bearing
        // and distance /api/copilot/around adds, and Oshkosh's SPECI of
        // the case "Oshkosh goes IFR".
        var fields = try #require(base["fields"] as? [[String: Any]])
        var firstSeen: [String: String?] = [:]
        for i in fields.indices {
            fields[i]["bearing_deg"] = 0
            fields[i]["distance_nm"] = 0
            firstSeen[fields[i]["ident"] as! String] = .some(fields[i]["planned_category"] as? String)
            if fields[i]["ident"] as? String == "KOSH" {
                fields[i]["metar"] = ["raw": "SPECI KOSH 091712Z 34012KT 2SM BR OVC008 08/07 A2992", "flight_category": "IFR"]
            }
        }
        let aroundData = try JSONSerialization.data(withJSONObject: ["areas": [], "at": 1_794_243_600, "fields": fields, "itws": [], "unavailable": []])
        let around = try Planner.json.decode(APICopilotAround.self, from: aroundData)
        let fix = OwnShip.Fix(coordinate: CLLocationCoordinate2D(latitude: 43.6, longitude: -88.4), altitudeFt: 3500, trackDeg: 340, groundspeedKt: 105,
                              accuracyM: 5, at: Date(timeIntervalSince1970: 1_794_243_600))
        let flight = Copilot.Flight(dest: "KOSH", line: [[42.6, -88.0], [43.9844, -88.557]], plannedGsKt: 110, tasKt: 110, burnGph: 9, fuelGal: 20)
        let input = try Copilot.input(fix: fix, flight: flight, around: around, ahead: [], minimums: PersonalMinimums(),
                                      remainingNm: 24, startedAt: fix.at, firstSeen: firstSeen)
        #expect(input.fields.first { $0.ident == "KOSH" }?.plannedCategory == "VFR")
        #expect(input.fuelGal == 20)
        var asked = input
        asked.passengers = false
        asked.nightCurrent = true
        // The typed field keeps the SPECI as sent, which the engine reads.
        #expect(input.fields.first { $0.ident == "KOSH" }?.metar?.raw?.hasPrefix("SPECI KOSH") == true)
        let answer = try Copilot.watch(asked)
        let first = try #require(answer.messages.first)
        #expect(first.kind == "weather" && first.level == "caution")
        #expect(first.title.contains("KOSH just went IFR"))
        #expect(first.alternative?.ident == "KFLD")
    }

    @Test func theRestOfTheRouteFromTheAirplane() {
        let line = [[42.6, -88.0], [43.2, -88.2], [43.9844, -88.557]]
        let rest = Copilot.restOfRoute(CLLocationCoordinate2D(latitude: 42.9012, longitude: -88.1033), line: line, leg: 0)
        #expect(rest == "42.900,-88.105;43.200,-88.200;43.985,-88.555")
        #expect(Copilot.Mode.allCases.map(\.label) == ["Off", "On", "Spoken"])
    }
}
