import Foundation
import Testing
@testable import Wingtip

/// What the Saved Flights screen's model sends and shows: a flight named
/// and noted in its row (only what changed sent, blank to clear, the
/// gateway's limits said in the row), and a delete held back behind the
/// system's Undo and sent only once the list is left.
@MainActor
struct SavedFlightsModelTests {
    /// What the fake gateway was asked.
    actor Asked {
        var updates: [(Int, GWUpdateFlightRequest)] = []
        var deletes: [Int] = []
        func update(_ id: Int, _ change: GWUpdateFlightRequest) { updates.append((id, change)) }
        func delete(_ id: Int) { deletes.append(id) }
    }

    struct Refused: Error, LocalizedError { var errorDescription: String? { "The server answered 400." } }

    nonisolated static func flight(_ id: Int, name: String? = nil, notes: String? = nil) -> SavedFlight {
        SavedFlight(createdAt: "2026-11-01T12:00:00Z", departureIdent: "KDLH", destinationIdent: "KHIB", id: id,
                    name: name, notes: notes, stops: id == 2 ? ["KGPZ"] : [])
    }

    /// Pending deletes kept apart from the app's own, one store a test.
    static func pending() -> PendingDeletes { PendingDeletes(defaults: UserDefaults(suiteName: "test-\(UUID().uuidString)")!) }

    static func model(_ asked: Asked, flights: [SavedFlight], refuse: Bool = false,
                      pending: PendingDeletes = pending()) async -> SavedFlightsModel {
        let model = SavedFlightsModel(calls: .init(
            list: { flights },
            save: { _ in },
            update: { id, change in
                await asked.update(id, change)
                if refuse { throw Refused() }
                var now = flights.first { $0.id == id } ?? flight(id)
                if let name = change.name { now.name = name.isEmpty ? nil : name }
                if let notes = change.notes { now.notes = notes.isEmpty ? nil : notes }
                return now
            },
            delete: { await asked.delete($0) }), pending: pending)
        await model.load()
        return model
    }

    @Test func aFlightIsTitledByItsNameElseItsRoute() {
        #expect(SavedFlightsModel.title(Self.flight(1)) == "KDLH → KHIB")
        #expect(SavedFlightsModel.title(Self.flight(2)) == "KDLH → KGPZ → KHIB")
        #expect(SavedFlightsModel.title(Self.flight(1, name: "  ")) == "KDLH → KHIB")
        #expect(SavedFlightsModel.title(Self.flight(1, name: "Lunch at Hibbing")) == "Lunch at Hibbing")
    }

    @Test func onlyWhatChangedIsSentAndABlankClears() {
        let named = Self.flight(1, name: "Lunch", notes: "Fuel at KHIB")
        #expect(SavedFlightsModel.change(of: named, name: "Lunch ", notes: "Fuel at KHIB") == nil)
        #expect(SavedFlightsModel.change(of: named, name: "Dinner", notes: "Fuel at KHIB") == GWUpdateFlightRequest(name: "Dinner", notes: nil))
        #expect(SavedFlightsModel.change(of: named, name: "", notes: "Fuel at KHIB") == GWUpdateFlightRequest(name: "", notes: nil))
        #expect(SavedFlightsModel.change(of: Self.flight(1), name: "", notes: "") == nil)
        #expect(SavedFlightsModel.change(of: Self.flight(1), name: "", notes: "Long field") == GWUpdateFlightRequest(name: nil, notes: "Long field"))
    }

    @Test func aRowEditedIsKeptAndClosed() async {
        let asked = Asked()
        let model = await Self.model(asked, flights: [Self.flight(1), Self.flight(2)])
        model.edit(model.flights[0])
        #expect(model.editingID == 1)
        model.name = "Lunch at Hibbing"
        await model.commitEdit()
        let updates = await asked.updates
        #expect(updates.count == 1 && updates[0].0 == 1 && updates[0].1 == GWUpdateFlightRequest(name: "Lunch at Hibbing", notes: nil))
        #expect(model.editingID == nil && model.rowProblem == nil)
        #expect(model.flights[0].name == "Lunch at Hibbing")
    }

    @Test func aRefusalStaysInTheRowWithItsWords() async {
        let asked = Asked()
        let model = await Self.model(asked, flights: [Self.flight(1)], refuse: true)
        model.edit(model.flights[0])
        model.notes = "Fuel at KHIB"
        await model.commitEdit()
        #expect(model.editingID == 1)
        #expect(model.rowProblem == "Not kept: The server answered 400.")
    }

    @Test func aNameOverTheLimitIsSaidBeforeAsking() async {
        let asked = Asked()
        let model = await Self.model(asked, flights: [Self.flight(1)])
        model.edit(model.flights[0])
        model.name = String(repeating: "A", count: SavedFlightsModel.nameLimit + 1)
        await model.commitEdit()
        #expect(await asked.updates.isEmpty)
        #expect(model.rowProblem == "A name is at most 80 characters.")
    }

    @Test func aDeleteWaitsForTheListToBeLeft() async {
        let asked = Asked()
        let model = await Self.model(asked, flights: [Self.flight(1), Self.flight(2)])
        let undo = UndoManager()
        undo.groupsByEvent = false
        undo.beginUndoGrouping()
        model.delete(model.flights[0], undo: undo)
        undo.endUndoGrouping()
        #expect(model.flights.map(\.id) == [2] && model.removed.map(\.flight.id) == [1])
        #expect(undo.undoActionName == "Delete Flight")
        undo.undo()
        #expect(model.flights.map(\.id) == [1, 2] && model.removed.isEmpty)
        #expect(await asked.deletes.isEmpty)

        model.delete(model.flights[1])
        await model.keepRemoved()
        #expect(await asked.deletes == [2])
        #expect(model.removed.isEmpty && model.flights.map(\.id) == [1])
    }

    @Test func aDeleteLeftUnsentWhenTheAppClosedIsSentAtTheNextLaunchAndStaysOffTheList() async {
        let asked = Asked()
        let pending = Self.pending()
        let model = await Self.model(asked, flights: [Self.flight(1), Self.flight(2)], pending: pending)
        model.delete(model.flights[0])
        // The app closed here: the list never left, nothing sent, the delete kept.
        #expect(await asked.deletes.isEmpty)
        #expect(pending.ids(.flight) == [1])
        // The next launch's list leaves it out while it is sent.
        let next = await Self.model(asked, flights: [Self.flight(1), Self.flight(2)], pending: pending)
        #expect(next.flights.map(\.id) == [2])
        // Held in this launch, it is not sent at this launch's start; the
        // next launch sends it and lets it go.
        #expect(await pending.sendLeftOver { _, id in await asked.delete(id) } == 0)
        #expect(await asked.deletes.isEmpty)
        let nextLaunch = PendingDeletes(defaults: pending.defaults, launch: "next")
        #expect(await nextLaunch.sendLeftOver { _, id in await asked.delete(id) } == 1)
        #expect(await asked.deletes == [1])
        #expect(nextLaunch.ids(.flight).isEmpty)
    }
}
