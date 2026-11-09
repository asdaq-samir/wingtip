import Foundation
import Observation

/// The Saved Flights screen's state and its calls: the pilot's flights
/// from the gateway, one at a time named and noted in its own row (Edit,
/// then Return or Save sends PATCH /api/flights/{id}), and a delete held
/// back behind its Undo row until the Undo is gone (docs/navigation.md).
@MainActor
@Observable
final class SavedFlightsModel {
    /// The gateway's calls, a test's own in their place.
    struct Calls: Sendable {
        var list: @Sendable () async throws -> [SavedFlight]
        var save: @Sendable (SaveFlightRequest) async throws -> Void
        var update: @Sendable (Int, GWUpdateFlightRequest) async throws -> SavedFlight
        var delete: @Sendable (Int) async throws -> Void

        static let gateway = Calls(list: { try await Gateway.flights() }, save: { try await Gateway.save($0) },
                                   update: { try await Gateway.updateFlight($0, $1) }, delete: { try await Gateway.deleteFlight($0) })
    }

    /// The gateway's own limits on the two (UpdateFlightRequest), said in
    /// the row before it is asked.
    static let nameLimit = 80
    static let notesLimit = 2000

    private(set) var flights: [SavedFlight] = []
    /// Why the list could not be had or the plan saved, under the list.
    private(set) var problem: String?
    private(set) var saving = false
    /// The flight just deleted and where it was, kept back until its Undo is gone.
    private(set) var removed: (flight: SavedFlight, at: Int)?
    /// The flight being named, and what is written in its row.
    private(set) var editingID: Int?
    var name = ""
    var notes = ""
    /// Why the name and notes were not kept, said in their row.
    private(set) var rowProblem: String?
    private(set) var sending = false
    @ObservationIgnored private let calls: Calls

    init(calls: Calls = .gateway) { self.calls = calls }

    /// The flight's name where it has one, else its route.
    static func title(_ flight: SavedFlight) -> String {
        let named = flight.name?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return named.isEmpty ? route(flight) : named
    }

    static func route(_ flight: SavedFlight) -> String {
        ([flight.departureIdent] + flight.stops + [flight.destinationIdent]).joined(separator: " → ")
    }

    /// What PATCH is sent from what is written: only what changed (nil
    /// keeps it), a blank one sent blank so the gateway clears it; nil when
    /// nothing changed.
    static func change(of flight: SavedFlight, name: String, notes: String) -> GWUpdateFlightRequest? {
        let name = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let notes = notes.trimmingCharacters(in: .whitespacesAndNewlines)
        let request = GWUpdateFlightRequest(name: name == (flight.name ?? "") ? nil : name,
                                            notes: notes == (flight.notes ?? "") ? nil : notes)
        return request.name == nil && request.notes == nil ? nil : request
    }

    func load() async {
        do {
            flights = try await calls.list()
            problem = nil
        } catch {
            problem = "Your flights could not be fetched: \(error.localizedDescription)"
        }
    }

    /// The plan on the page saved, and the list fetched again with it.
    func save(_ request: SaveFlightRequest) async {
        saving = true
        defer { saving = false }
        do {
            try await calls.save(request)
            flights = try await calls.list()
            problem = nil
        } catch {
            problem = "This plan could not be saved: \(error.localizedDescription)"
        }
    }

    /// The flight's row opened for its name and notes; another left as it was.
    func edit(_ flight: SavedFlight) {
        editingID = flight.id
        name = flight.name ?? ""
        notes = flight.notes ?? ""
        rowProblem = nil
    }

    func cancelEdit() {
        editingID = nil
        rowProblem = nil
    }

    /// What is written, kept: the row closes once the gateway has it, and
    /// stays open with why where it refused.
    func commitEdit() async {
        guard let id = editingID, let flight = flights.first(where: { $0.id == id }) else { return }
        if name.trimmingCharacters(in: .whitespacesAndNewlines).count > Self.nameLimit {
            rowProblem = "A name is at most \(Self.nameLimit) characters."
            return
        }
        if notes.trimmingCharacters(in: .whitespacesAndNewlines).count > Self.notesLimit {
            rowProblem = "Notes are at most \(Self.notesLimit) characters."
            return
        }
        guard let change = Self.change(of: flight, name: name, notes: notes) else { return cancelEdit() }
        sending = true
        defer { sending = false }
        do {
            let now = try await calls.update(id, change)
            if let at = flights.firstIndex(where: { $0.id == id }) { flights[at] = now }
            if editingID == id { cancelEdit() }
        } catch {
            rowProblem = "Not kept: \(error.localizedDescription)"
        }
    }

    /// Taken off the list at once, deleted once its Undo is gone: an Undo
    /// puts it back with nothing asked of the gateway.
    func delete(_ flight: SavedFlight) {
        if let removed { Task { await keep(removed.flight) } }
        guard let at = flights.firstIndex(where: { $0.id == flight.id }) else { return }
        if editingID == flight.id { cancelEdit() }
        flights.remove(at: at)
        removed = (flight, at)
    }

    func undo() {
        guard let removed else { return }
        flights.insert(removed.flight, at: min(removed.at, flights.count))
        self.removed = nil
    }

    /// The delete sent, once its Undo is gone or the list is left.
    func keep(_ flight: SavedFlight) async {
        if removed?.flight.id == flight.id { removed = nil }
        do { try await calls.delete(flight.id) } catch {
            problem = "\(Self.title(flight)) could not be deleted: \(error.localizedDescription)"
        }
    }
}
