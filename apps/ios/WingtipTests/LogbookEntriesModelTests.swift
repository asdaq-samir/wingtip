import Foundation
import Testing
@testable import Wingtip

/// The Logbook's flights edited in their own rows: the row opens with the
/// flight's columns, Save sends them and closes it, a refusal stays in
/// the row, and a delete is sent only once its Undo is gone.
@MainActor
struct LogbookEntriesModelTests {
    actor Asked {
        var updates: [(Int, LogbookEntryRequest)] = []
        var deletes: [Int] = []
        func update(_ id: Int, _ r: LogbookEntryRequest) { updates.append((id, r)) }
        func delete(_ id: Int) { deletes.append(id) }
    }

    struct Refused: Error, LocalizedError { var errorDescription: String? { "Invalid request: totalHours must be at least 0" } }

    static func entry(_ id: Int, route: String? = "KDLH KHIB") -> LogbookEntry {
        LogbookEntry(aircraft: "N3429J", aircraftType: "P28A", airHours: 1.1, approaches: 0, crossCountryHours: 1.2, dayLandings: 2,
                     distanceNm: 62.4, dualHours: 0, flownOn: "2026-10-28", fromTrack: false, holding: false, id: id,
                     instrumentHours: 0, longestLegNm: 62.4, nightHours: 0, nightLandings: 0, route: route, soloHours: 0,
                     totalHours: 1.2, touchAndGoes: 0, toweredLandings: 1, tracking: false)
    }

    static func model(_ asked: Asked, refuse: Bool = false) -> LogbookEntriesModel {
        let model = LogbookEntriesModel(calls: .init(
            update: { id, r in
                await asked.update(id, r)
                if refuse { throw Refused() }
            },
            delete: { await asked.delete($0) }))
        model.entries = [entry(1), entry(2, route: nil)]
        return model
    }

    @Test func aRowOpensWithItsFlightsColumns() {
        let model = Self.model(Asked())
        model.edit(Self.entry(1))
        #expect(model.editingID == 1)
        #expect(model.draft == LogbookEntryRequest(Self.entry(1)))
        model.cancelEdit()
        #expect(model.editingID == nil)
    }

    @Test func savedTheRowCloses() async {
        let asked = Asked()
        let model = Self.model(asked)
        model.edit(Self.entry(1))
        model.draft.nightHours = 0.5
        #expect(await model.commitEdit())
        let updates = await asked.updates
        #expect(updates.count == 1 && updates[0].0 == 1 && updates[0].1.nightHours == 0.5)
        #expect(model.editingID == nil && model.rowProblem == nil)
    }

    @Test func refusedTheRowStaysOpenWithWhy() async {
        let model = Self.model(Asked(), refuse: true)
        model.edit(Self.entry(1))
        #expect(await model.commitEdit() == false)
        #expect(model.editingID == 1)
        #expect(model.rowProblem == "Not kept: Invalid request: totalHours must be at least 0")
    }

    @Test func aDeleteWaitsForItsUndo() async {
        let asked = Asked()
        let model = Self.model(asked)
        #expect(model.delete(Self.entry(1)) == nil)
        #expect(model.entries?.map(\.id) == [2] && model.removed?.entry.id == 1)
        model.undo()
        #expect(model.entries?.map(\.id) == [1, 2] && model.removed == nil)

        _ = model.delete(Self.entry(1))
        // A second delete hands back the first, for its delete to be sent.
        #expect(model.delete(Self.entry(2))?.id == 1)
        #expect(await model.keep(Self.entry(1)) == nil)
        #expect(await asked.deletes == [1])
        #expect(model.removed?.entry.id == 2)
    }

    @Test func theRowsWordsAreTheDayAndTheRoute() {
        #expect(LogbookEntriesModel.title(Self.entry(1)).hasSuffix(" · KDLH KHIB"))
        #expect(!LogbookEntriesModel.title(Self.entry(2, route: nil)).contains("·"))
    }
}
