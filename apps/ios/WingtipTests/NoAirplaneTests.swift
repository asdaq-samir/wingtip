import Foundation
import Testing
@testable import Wingtip

/// With no airplane picked, no airplane is assumed (docs/decisions/0011):
/// the plan starts with none, a plan kept on the stock profile with no
/// N-number comes back with none, and the Brief leaves out the findings
/// that need an airplane's figures.
@MainActor
struct NoAirplaneTests {
    @Test func aPlanStartsWithNoAirplaneAndTheChipAsksForOne() {
        let plan = Plan()
        #expect(plan.aircraft == "none" && !plan.airplaneChosen && plan.airplaneName == nil)
        plan.aircraft = "pa28"
        #expect(plan.airplaneChosen && plan.airplaneName == "PA28")
        plan.tail = "N3429J"
        #expect(plan.airplaneName == "N3429J")
        plan.flyNoAirplane()
        #expect(plan.aircraft == "none" && plan.tail == nil && plan.figures == Figures())
    }

    @Test func aPlanKeptOnTheStockProfileUnaskedComesBackWithNone() {
        let at = Date(timeIntervalSince1970: 1_800_000_000)
        let unasked = Kept(dep: "C81", dest: "KDLH", stops: [], aircraft: "c172", plannedAt: at)
        #expect(Plan.airplane(kept: unasked) == ("none", nil))
        let byTail = Kept(dep: "C81", dest: "KDLH", stops: [], aircraft: "c172", tail: "N12345", plannedAt: at)
        #expect(Plan.airplane(kept: byTail) == ("c172", "N12345"))
        let other = Kept(dep: "C81", dest: "KDLH", stops: [], aircraft: "pa28", plannedAt: at)
        #expect(Plan.airplane(kept: other) == ("pa28", nil))
    }

    @Test func theBriefLeavesOutWhatNeedsAnAirplane() throws {
        let json = #"{"line":{"finding":"caution","words":"Go, with cautions"},"items":[{"key":"weather","label":"Weather","finding":"ok","detail":"VFR","tab":"brief"},{"key":"fuel","label":"Fuel","finding":"caution","detail":"8.4 gal at landing","tab":"navlog"},{"key":"runways","label":"Runways","finding":"ok","detail":"Long enough","tab":"arrive"},{"key":"balance","label":"Weight & balance","finding":"ok","detail":"Within","tab":"preflight"}],"self_checks":[]}"#
        let answer = try JSONDecoder().decode(GoNoGoAnswer.self, from: Data(json.utf8))
        #expect(Verdict.shown(answer, airplane: true) == answer)
        let none = Verdict.shown(answer, airplane: false)
        #expect(none.items.map(\.key) == ["weather"] && none.loading == nil && none.balance == nil)
        #expect(none.line == answer.line)
    }
}
