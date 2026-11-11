import Foundation
import Testing
@testable import Wingtip

/// The checklists kept on the device per airplane (LocalChecklists), the
/// phases' headings they can start from (ChecklistPhases), and the
/// screen's model over them (ChecklistModel).
@MainActor
struct ChecklistsTests {
    private func defaults() throws -> UserDefaults {
        try #require(UserDefaults(suiteName: "wingtip-checklists-\(UUID().uuidString)"))
    }

    @Test func emptyUntilWrittenAndKeptPerAirplaneAndKind() throws {
        let d = try defaults()
        #expect(LocalChecklists.text(for: "N3429J", .normal, in: d) == "")
        #expect(LocalChecklists.text(for: "N3429J", .emergency, in: d) == "")
        LocalChecklists.save("# Before takeoff\nFuel selector -- Both\n", for: "n3429j", .normal, in: d)
        LocalChecklists.save("# Engine fire in flight\nMixture -- Idle cutoff\n", for: "N3429J", .emergency, in: d)
        // The N-number's case does not matter; another airplane has its own.
        #expect(LocalChecklists.text(for: "N3429J", .normal, in: d) == "# Before takeoff\nFuel selector -- Both\n")
        #expect(LocalChecklists.text(for: "N3429J", .emergency, in: d).hasPrefix("# Engine fire in flight"))
        #expect(LocalChecklists.text(for: "N12345", .normal, in: d) == "")
        // Saved blank, it is gone.
        LocalChecklists.save("  \n", for: "N3429J", .normal, in: d)
        #expect(d.string(forKey: LocalChecklists.key("N3429J", .normal)) == nil)
    }

    @Test func signingOutForgetsThem() throws {
        let d = try defaults()
        LocalChecklists.save("# Engine fire in flight\nMixture -- Idle cutoff\n", for: "N3429J", .emergency, in: d)
        d.set("kept", forKey: "unrelated")
        Session.forgetPilot(d)
        #expect(LocalChecklists.text(for: "N3429J", .emergency, in: d) == "")
        #expect(d.string(forKey: "unrelated") == "kept")
    }

    @Test func theAirplaneIsItsNNumberElseItsType() throws {
        let plan = Plan()
        #expect(LocalChecklists.airplane(of: plan) == "")
        plan.aircraft = "c172"
        #expect(LocalChecklists.airplane(of: plan) == "C172")
        plan.tail = "N3429J"
        #expect(LocalChecklists.airplane(of: plan) == "N3429J")
    }

    @Test func thePhasesAreHeadingsOnlyInTheHandbooksOrder() throws {
        let normal = try ChecklistPhases.normal.get(), emergency = try ChecklistPhases.emergency.get()
        #expect(normal.first == "Preflight inspection" && normal.last == "Securing the airplane")
        #expect(normal.count == 13 && emergency.count == 12)
        #expect(emergency.first == "Engine failure on the takeoff roll" && emergency.last == "Inadvertent icing")
        let text = try ChecklistPhases.text(.emergency)
        let lines = text.split(separator: "\n").map(String.init)
        // Every line a heading: no item, no manufacturer's words.
        #expect(lines.allSatisfy { $0.hasPrefix("# ") })
        #expect(lines.map { String($0.dropFirst(2)) } == emergency)
        // A heading with nothing under it is no section when read.
        #expect(try ChecklistText.parse(text).sections.isEmpty)
    }

    @Test func theModelWritesRunsAndStartsOver() throws {
        let d = try defaults()
        let model = ChecklistModel(airplane: "n3429j", kind: .normal, defaults: d)
        #expect(model.text.isEmpty && model.checklist.sections.isEmpty && model.title == "N3429J Checklist")
        model.edit()
        model.startFromPhases()
        #expect(model.writing == (try ChecklistPhases.text(.normal)))
        // Not over what is written.
        model.writing = "# Before takeoff\nFuel selector -- Both\nDoors -- Closed\n"
        model.startFromPhases()
        #expect(model.writing?.hasPrefix("# Before takeoff") == true)
        model.save()
        #expect(model.writing == nil && model.checklist.sections.map(\.title) == ["Before takeoff"])
        model.toggle(0, 1)
        #expect(model.done(in: 0) == 1 && model.isTicked(0, 1))
        model.startOver()
        #expect(model.done(in: 0) == 0)
        // Opened again, it is there.
        let again = ChecklistModel(airplane: "N3429J", kind: .normal, defaults: d)
        #expect(again.checklist.sections.first?.items.count == 2)
        #expect(ChecklistModel(airplane: "N3429J", kind: .emergency, defaults: d).text.isEmpty)
    }
}
