import Foundation
import Testing
@testable import Wingtip

/// The coach's debriefs from the saved flights: the planner's debrief
/// trimmed to what the engine's proficiency_plan reads, and only the last
/// half year's newest six flights asked for, as the web's coachDebriefs.
struct CoachDebriefsTests {
    @Test func aDebriefIsTrimmedToItsLegsAndPatterns() throws {
        let json = #"""
        {"debrief":{"flown_min":62,"has_altitude":true,"landing":2,"takeoff":1,"line":[],"notes":[],"passes":[],"planned":[],"profile":[],
          "legs":[{"from":"C81","to":"KMSN","ok":false,"altitude_within":0.4,"course_within":0.9}],
          "patterns":[{"ident":"KMSN","alt_ft":2400,"off_ft":-300,"ok":false,"pattern_ft":2700}]},
         "tolerances":{"altitude_ft":200,"course_deg":10,"eta_min":3,"off_route_nm":1,"pattern_ft":100,"pattern_nm":1}}
        """#
        let answer = try Planner.json.decode(DebriefAnswer.self, from: Data(json.utf8))
        let d = try #require(CoachDebriefs.trimmed(answer, place: "C81-KMSN", flownOn: "2026-10-20"))
        #expect(d.kind == "flight" && d.place == "C81-KMSN" && d.flownOn == "2026-10-20")
        #expect(d.legs == [APICoachLeg(altitudeWithin: 0.4, courseWithin: 0.9, from: "C81", ok: false, to: "KMSN")])
        #expect(d.patterns == [APICoachPattern(ident: "KMSN", offFt: -300, ok: false)])
    }

    @Test func aTrackThatNeverFlewIsNoDebrief() throws {
        let answer = try Planner.json.decode(DebriefAnswer.self, from: Data(#"{"debrief":null,"tolerances":{"altitude_ft":200,"course_deg":10,"eta_min":3,"off_route_nm":1,"pattern_ft":100,"pattern_nm":1}}"#.utf8))
        #expect(CoachDebriefs.trimmed(answer, place: "C81-KMSN", flownOn: "2026-10-20") == nil)
    }

    @Test func theFlightsAskedForAreTheHalfYearsNewestSix() {
        let now = ISO8601DateFormatter().date(from: "2026-11-09T12:00:00Z")!
        let flights = (0..<9).map { i in
            SavedFlight(createdAt: "2026-\(i < 8 ? "11" : "01")-0\(i < 8 ? i + 1 : 2)T12:00:00Z", departureIdent: "C81", destinationIdent: "KMSN", id: i, stops: [])
        }
        let picked = CoachDebriefs.recent(flights, now: now)
        #expect(picked.count == 6)
        #expect(picked.first?.id == 7 && !picked.contains { $0.id == 8 })
    }
}
