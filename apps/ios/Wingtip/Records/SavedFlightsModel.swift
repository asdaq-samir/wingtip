import Foundation
import Observation

/// The Saved Flights screen's state and its calls: the pilot's flights
/// from the gateway, one at a time named and noted in its own row (Edit,
/// then Return or Save sends PATCH /api/flights/{id}), and a delete held
/// back, with the system's Undo, until the list is left (docs/navigation.md),
/// and kept on the phone till then (PendingDeletes), so one made just before
/// the app is closed is sent at the next launch.
@MainActor
@Observable
final class SavedFlightsModel {
    /// The gateway's calls, a test's own in their place.
    struct Calls: Sendable {
        var list: @Sendable () async throws -> [SavedFlight]
        var save: @Sendable (SaveFlightRequest) async throws -> Void
        var update: @Sendable (Int, GWUpdateFlightRequest) async throws -> SavedFlight
        var delete: @Sendable (Int) async throws -> Void
        /// Shared by link, its N-number with it or not (POST /api/flights/{id}/share).
        var share: @Sendable (Int, Bool) async throws -> GWFlightShareDto = { try await Gateway.shareFlight($0, includeTail: $1) }
        /// No longer shared (DELETE /api/flights/{id}/share).
        var stopSharing: @Sendable (Int) async throws -> Void = { try await Gateway.stopSharing($0) }

        static let gateway = Calls(list: { try await Gateway.flights() }, save: { try await Gateway.save($0) },
                                   update: { try await Gateway.updateFlight($0, $1) }, delete: { try await Gateway.deleteFlight($0) })
    }

    /// The gateway's own limits on the two (UpdateFlightRequest), said in
    /// the row before it is asked.
    static let nameLimit = 80
    static let notesLimit = 2000

    /// Each change handed to the widgets' settings (Next Flight's choice of
    /// flight, WidgetFeed.saved).
    private(set) var flights: [SavedFlight] = [] {
        didSet { if flights != oldValue { WidgetFeed.shared.saved(flights) } }
    }
    /// Why the list could not be had or the plan saved, under the list.
    private(set) var problem: String?
    private(set) var saving = false
    /// The flights deleted while the list is open and where each was, the
    /// last last: kept back from the gateway while their Undo stands.
    private(set) var removed: [(flight: SavedFlight, at: Int)] = []
    /// The flight being named, and what is written in its row.
    private(set) var editingID: Int?
    var name = ""
    var notes = ""
    /// Why the name and notes were not kept, said in their row.
    private(set) var rowProblem: String?
    private(set) var sending = false
    @ObservationIgnored private let calls: Calls
    @ObservationIgnored private let pending: PendingDeletes

    init(calls: Calls = .gateway, pending: PendingDeletes = PendingDeletes()) {
        self.calls = calls
        self.pending = pending
    }

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
            // A flight whose Undo still stands, or whose delete is still to
            // be sent from an earlier launch, stays off the list.
            let held = pending.ids(.flight)
            flights = try await calls.list().filter { !held.contains($0.id) }
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

    /// Taken off the list at once, deleted on the gateway once the list
    /// is left (keepRemoved): the window's UndoManager puts it back with
    /// nothing asked of the gateway, and shake, Command-Z and the bar's
    /// Undo all do it.
    func delete(_ flight: SavedFlight, undo: UndoManager? = nil) {
        guard let at = flights.firstIndex(where: { $0.id == flight.id }) else { return }
        if editingID == flight.id { cancelEdit() }
        flights.remove(at: at)
        removed.append((flight, at))
        pending.hold(.flight, flight.id)
        undo?.register(self, named: "Delete Flight") { $0.undoDelete(undo: undo) }
    }

    /// The last flight deleted put back where it was; its redo deletes it again.
    func undoDelete(undo: UndoManager? = nil) {
        guard let last = removed.popLast() else { return }
        pending.release(.flight, last.flight.id)
        flights.insert(last.flight, at: min(last.at, flights.count))
        undo?.register(self, named: "Delete Flight") { $0.delete(last.flight, undo: undo) }
    }

    /// The deletes sent, the list left: nothing is held back after it.
    func keepRemoved() async {
        let sending = removed
        removed = []
        for (flight, _) in sending {
            do { try await calls.delete(flight.id) } catch {
                problem = "\(Self.title(flight)) could not be deleted: \(error.localizedDescription)"
            }
            pending.release(.flight, flight.id)
        }
    }

    /// Shared by link (the same link while it stays shared), the N-number
    /// with it only where the pilot chose: the link, for the share sheet
    /// that asked for it (ShareLink, SharedLink). Why it could not be had
    /// is said under the list, and thrown so the sheet sends nothing.
    func link(_ flight: SavedFlight, includeTail: Bool) async throws -> URL {
        do {
            let share = try await calls.share(flight.id, includeTail)
            if let at = flights.firstIndex(where: { $0.id == flight.id }) { flights[at].share = share }
            guard let url = URL(string: share.url) else { throw URLError(.badURL) }
            problem = nil
            return url
        } catch {
            problem = "\(Self.title(flight)) could not be shared: \(error.localizedDescription)"
            throw error
        }
    }

    /// No longer shared: its link says so to everyone it went to.
    func stopSharing(_ flight: SavedFlight) async {
        do {
            try await calls.stopSharing(flight.id)
            if let at = flights.firstIndex(where: { $0.id == flight.id }) { flights[at].share = nil }
            problem = nil
        } catch {
            problem = "\(Self.title(flight)) is still shared: \(error.localizedDescription)"
        }
    }
}
