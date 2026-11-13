import Foundation
import Testing
@testable import Wingtip

/// The Coach screen's model: the planner's plan read as it sends it, the
/// status words, and the ask the certificate makes.
@MainActor
struct CoachModelTests {
    nonisolated static let plan = #"""
    {"today":"2026-11-09",
     "due":[
      {"key":"night_passengers","id":"due:night_passengers","label":"Passengers at night","rule":"14 CFR 61.57(b)","until":"2026-11-18","from":null,"days_left":9,"status":"due_soon","detail":"3 of 3 night landings"},
      {"key":"flight_review","id":"due:flight_review","label":"Flight review","rule":"14 CFR 61.56(c)","until":"2027-05-31","from":null,"days_left":203,"status":"current","detail":"Done 2025-05-12"},
      {"key":"instrument","id":"due:instrument","label":"Instrument currency","rule":"14 CFR 61.57(c)","until":null,"from":null,"days_left":null,"status":"lapsed","detail":"2 of 6 approaches"},
      {"key":"medical","id":"due:medical","label":"Medical","rule":"14 CFR 61.23","until":null,"from":null,"days_left":null,"status":"unknown","detail":"Not given"}],
     "reminders":[{"key":"night_passengers","text":"Night passenger currency runs out in 9 days","until":"2026-11-18","days_left":9}],
     "evidence":[{"id":"ev:1","flown_on":"2026-10-20","place":"KMSN","area":"unstable_approach","text":"Below the glidepath at 400 ft above the field"}],
     "weak_areas":[{"key":"unstable_approach","label":"Stabilized approaches","acs":["IR.VI.B"],"evidence":["ev:1"]}],
     "sessions":[
      {"id":"session:1","key":"night_passengers","practise":"Three takeoffs and landings to a full stop at night","why":["due:night_passengers"],"place":{"ident":"KMSN","name":"Dane County Rgnl","distance_nm":0,"approach":null},"minutes":60,"instructor":false,"wings":null},
      {"id":"session:2","key":"unstable_approach","practise":"Stabilized approaches","why":["ev:1"],"place":{"ident":"KMSN","name":"Dane County Rgnl","distance_nm":0,"approach":"ILS OR LOC RWY 36"},"minutes":90,"instructor":true,"wings":{"area":"Approach and landing","acs":"IR.VI.B","note":"May count toward WINGS"}}]}
    """#

    static func entry(approaches: Int = 0) throws -> LogbookEntry {
        let json = #"{"id":4,"flownOn":"2026-10-12","aircraft":"N3429J","aircraftType":"P28A","route":"KDLH KHIB","remarks":"","totalHours":1.4,"nightHours":0,"crossCountryHours":1.4,"dualHours":1.4,"soloHours":0,"instrumentHours":0.3,"dayLandings":2,"nightLandings":0,"toweredLandings":1,"distanceNm":62,"longestLegNm":62,"approaches":\#(approaches),"holding":true,"tracking":false,"airHours":1.3,"touchAndGoes":1,"fromTrack":true,"flightId":40}"#
        return try JSONDecoder().decode(LogbookEntry.self, from: Data(json.utf8))
    }

    static func training(endorsed: Bool) throws -> Training {
        let endorsements = endorsed ? #"[{"code":"A.6","endorsedOn":"2026-09-01"}]"# : "[]"
        let json = #"{"endorsements":\#(endorsements),"experience":[],"fullName":null,"instructors":[],"kinds":[],"knowledgeTestCodes":[],"lessons":[],"reviews":[],"signed":[]}"#
        return try JSONDecoder().decode(Training.self, from: Data(json.utf8))
    }

    /// A model answered by stubs, its choice kept in a store of its own.
    static func model(pilot: CoachPilot) -> CoachModel {
        let calls = CoachCalls(plan: { _ in try Planner.json.decode(ProficiencyPlan.self, from: Data(Self.plan.utf8)) })
        let defaults = UserDefaults(suiteName: "coach-tests-\(UUID().uuidString)")!
        return CoachModel(calls: calls, fetchPilot: { pilot }, fetchDebriefs: { [] }, defaults: defaults)
    }

    @Test func thePlanShowsWithEachSessionsDetail() async throws {
        let model = Self.model(pilot: CoachPilot(entries: [try Self.entry()]))
        await model.load()
        await model.make(home: "kmsn")
        let plan = try #require(model.plan)
        #expect(plan.sessions.count == 2 && plan.weakAreas.first?.evidence == ["ev:1"])
        #expect(model.problem == nil)
        #expect(CoachModel.sessionDetail(plan.sessions[1]) == "KMSN, ILS OR LOC RWY 36 · About 90 min · With an instructor")
        #expect(CoachModel.sessionDetail(plan.sessions[0]) == "KMSN · About 60 min")
    }

    @Test func anApproachsEvidenceNamesItsProcedureAndAFlightsItsRouteAlone() throws {
        let approach = APICoachEvidence(area: "unstable_approach", flownOn: "2026-11-02", id: "ev:1", place: "KMSN", procedure: "ILS Y RWY 08", text: "Below the glidepath")
        #expect(CoachModel.evidenceLine(approach) == "2 Nov 2026 at KMSN, ILS Y RWY 08: Below the glidepath")
        let flight = APICoachEvidence(area: "pattern_altitude", flownOn: "2026-11-02", id: "ev:2", place: "KMSN-KJVL", procedure: nil, text: "Downwind 300 ft low")
        #expect(CoachModel.evidenceLine(flight) == "2 Nov 2026 at KMSN-KJVL: Downwind 300 ft low")
    }

    @Test func theStatusWordsAreTheEnginesStatus() throws {
        let plan = try Planner.json.decode(ProficiencyPlan.self, from: Data(Self.plan.utf8))
        #expect(plan.due.map(CoachModel.statusWords) == ["9 days left", "To 31 May 2027", "Lapsed", "Not on record"])
        var pending = plan.due[2]
        pending.status = "pending"
        pending.from = "2026-12-01"
        #expect(CoachModel.statusWords(pending) == "From 1 Dec 2026")
    }

    @Test func aStudentsAskCarriesTheEndorsementsHeld() async throws {
        let model = Self.model(pilot: CoachPilot(entries: [try Self.entry()], training: try Self.training(endorsed: true)))
        await model.load()
        // Guessed from the endorsements until the pilot picks.
        #expect(model.certificate == .student)
        let ask = model.ask(home: "kmsn", today: "2026-11-09")
        #expect(ask.ratings == ["student"] && ask.home == "KMSN" && ask.today == "2026-11-09")
        #expect(ask.held == [APICoachEndorsement(code: "A.6", on: "2026-09-01")])
        #expect(ask.entries.first?.flownOn == "2026-10-12" && ask.debriefs == [])
    }

    @Test func anInstrumentPilotsAskCarriesBothRatingsAndNoEndorsements() async throws {
        let model = Self.model(pilot: CoachPilot(entries: [try Self.entry(approaches: 2)], training: try Self.training(endorsed: true)))
        await model.load()
        model.certificate = .instrument
        let ask = model.ask(home: nil)
        #expect(model.certificate == .instrument)
        #expect(ask.ratings == ["private", "instrument"] && ask.held == [] && ask.home == nil)
    }

    @Test func theAskIsCamelCaseButItsDebriefsSnakeCase() throws {
        var ask = CoachAsk(entries: [], flightReviewOn: "2025-05-12", today: "2026-11-09")
        ask.debriefs = [CoachDebrief(elevationFt: 887, flownOn: "2026-10-20", kind: "approach", place: "KMSN",
                                     profile: [APICoachProfilePoint(altFt: 1300, off: true, toGoNm: 1.2)])]
        let body = try #require(String(data: try JSONEncoder().encode(ask), encoding: .utf8))
        #expect(body.contains(#""flightReviewOn":"2025-05-12""#))
        #expect(body.contains(#""elevation_ft":887"#) && body.contains(#""flown_on":"2026-10-20""#) && body.contains(#""to_go_nm":1.2"#))
        #expect(!body.contains("flownOn"))
    }
}
