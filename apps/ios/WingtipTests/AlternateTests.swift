import Foundation
import Testing
@testable import Wingtip

/// Under IFR, the alternate as the web files and checks it: sent to the
/// nav log and the Go / No-Go only under IFR, asked of the planner only
/// with an ETA and an airplane, and the planner's answer (the engine's
/// 91.169 rules) shown in its own words.
@MainActor
struct AlternateTests {
    @Test func theAlternateGoesToThePlannerOnlyUnderIfr() throws {
        var extras = RouteExtras()
        extras.alternate = "KRFD"
        var ifr = NavLogQuery(dep: "C81", dest: "KMSN")
        var vfr = ifr
        try extras.apply(to: &ifr, procedures: [], rules: .ifr)
        try extras.apply(to: &vfr, procedures: [], rules: .vfr)
        #expect(ifr.alternate == "KRFD")
        #expect(vfr.alternate == nil)
        extras.alternate = ""
        #expect(extras.filedAlternate(rules: .ifr) == nil)
    }

    @Test func itIsAskedOnlyUnderIfrWithAnEta() {
        let plan = Plan()
        plan.dep = "KDPA"; plan.dest = "KMSN"
        guard case .failure(.vfr) = AlternateCheck.ask(for: plan, rules: .vfr) else { Issue.record("VFR asked"); return }
        // No nav log yet: no ETA to check the destination's TAF round.
        guard case .failure(.noEta) = AlternateCheck.ask(for: plan, rules: .ifr) else { Issue.record("asked with no ETA"); return }
        #expect(AlternateCheck.Waiting.vfr.words == nil)
        #expect(AlternateCheck.Waiting.noAirplane.words?.contains("Pick an airplane") == true)
    }

    @Test func thePlannersAnswerIsReadAndShownInItsWords() throws {
        let json = #"""
        {"destination":{"ident":"KMSN","approach":true,"required":true,"ceiling_ft":1500,"visibility_sm":3,
          "reasons":["The TAF does not cover the hour either side of the ETA: an alternate is required (14 CFR 91.169(b))."],"taf":"TAF KMSN ..."},
         "alternate":{"ident":"KRFD","approach":true,"precision":true,"good":false,"ceiling_ft":500,"visibility_sm":1,
          "minimums":{"ceiling_ft":600,"visibility_sm":2},"reasons":[],"distance_nm":61.2},
         "suggestions":[{"ident":"KJVL","approach":true,"precision":false,"good":true,"ceiling_ft":3000,"visibility_sm":6,"distance_nm":44.0}]}
        """#
        let answer = try Planner.json.decode(APIAlternates.self, from: Data(json.utf8))
        #expect(answer.destination.required && answer.destination.reasons?.first?.contains("does not cover") == true)
        let filed = try #require(answer.alternate)
        #expect(AlternateSection.standing(filed) == "Under its minimums")
        #expect(AlternateSection.description(filed).contains("an ILS"))
        var good = filed; good.good = true
        #expect(AlternateSection.standing(good) == "Meets 600-2")
        var unsure = filed; unsure.good = nil; unsure.reasons = ["It publishes its own alternate minimums: check them."]
        #expect(AlternateSection.standing(unsure) == "Check it")
        #expect(AlternateSection.description(unsure) == "It publishes its own alternate minimums: check them.")
        #expect(AlternateSection.ceilingAndVisibility(nil, 2) == "no ceiling · 2 SM")
    }

    @Test func noReportOfTheAlternateNoArrow() {
        let atEta = [EngineContract.WorseField(ident: "KRFD", ceilingFt: 500, visibilitySm: 1, ceilingUnknown: nil, arrival: true)]
        #expect(FieldWeatherMarks.worse(alternates: atEta, reports: [:]).isEmpty)
    }
}
