import Foundation
import Observation

/// The logbook's flights as the Logbook screen lists them: one at a time
/// opened in its own row to change (Edit, then Save sends PUT
/// /api/logbook/{id}), and a delete held back, with the system's Undo,
/// until the logbook is left (docs/navigation.md), rather than a form and
/// a "can't be undone" question.
@MainActor
@Observable
final class LogbookEntriesModel {
    /// The gateway's calls, a test's own in their place.
    struct Calls: Sendable {
        var update: @Sendable (Int, LogbookEntryRequest) async throws -> Void
        var delete: @Sendable (Int) async throws -> Void

        static let gateway = Calls(update: { try await Gateway.updateLogbookEntry($0, $1) },
                                   delete: { try await Gateway.deleteLogbookEntry($0) })
    }

    /// The flights, newest first as the gateway sends them; nil until fetched.
    var entries: [LogbookEntry]?
    /// The flight open in its row, and its columns as changed so far.
    private(set) var editingID: Int?
    var draft = LogbookEntryRequest.blank(aircraft: nil)
    /// Why the change was not kept, said in the row.
    private(set) var rowProblem: String?
    private(set) var sending = false
    /// The flights deleted while the logbook is open and where each was,
    /// the last last: kept back from the gateway while their Undo stands.
    private(set) var removed: [(entry: LogbookEntry, at: Int)] = []
    @ObservationIgnored private let calls: Calls

    init(calls: Calls = .gateway) { self.calls = calls }

    /// "28 Oct 2026 · KDLH KHIB": the row's words.
    static func title(_ e: LogbookEntry) -> String {
        Day.said(e.flownOn) + (e.route.map { $0.isEmpty ? "" : " · \($0)" } ?? "")
    }

    /// The flight's row opened to change; one already open is left as it was.
    func edit(_ e: LogbookEntry) {
        editingID = e.id
        draft = LogbookEntryRequest(e)
        rowProblem = nil
    }

    func cancelEdit() {
        editingID = nil
        rowProblem = nil
    }

    /// The row's columns kept: true once the gateway has them (the
    /// screen then fetches the logbook and the currency again), the row
    /// left open with why where it refused.
    func commitEdit() async -> Bool {
        guard let id = editingID else { return false }
        sending = true
        defer { sending = false }
        do {
            try await calls.update(id, draft)
            if editingID == id { cancelEdit() }
            return true
        } catch {
            rowProblem = "Not kept: \(error.localizedDescription)"
            return false
        }
    }

    /// Taken off the list at once, deleted on the gateway once the
    /// logbook is left (keepRemoved): the window's UndoManager puts it back
    /// with nothing asked of the gateway, and shake, Command-Z and the
    /// bar's Undo all do it.
    func delete(_ e: LogbookEntry, undo: UndoManager? = nil) {
        guard let at = entries?.firstIndex(where: { $0.id == e.id }) else { return }
        if editingID == e.id { cancelEdit() }
        entries?.remove(at: at)
        removed.append((e, at))
        undo?.register(self, named: "Delete Flight") { $0.undoDelete(undo: undo) }
    }

    /// The last flight deleted put back where it was; its redo deletes it again.
    func undoDelete(undo: UndoManager? = nil) {
        guard let last = removed.popLast() else { return }
        // The place worked out before the insert: read inside the insert's
        // own argument, `entries` is read while it is being modified, which
        // Swift's exclusivity check stops the app for.
        if let count = entries?.count { entries?.insert(last.entry, at: min(last.at, count)) }
        undo?.register(self, named: "Delete Flight") { $0.delete(last.entry, undo: undo) }
    }

    /// The deletes sent, the logbook left; nil once they are, else why not.
    func keepRemoved() async -> String? {
        let sending = removed
        removed = []
        var why: String?
        for (e, _) in sending {
            do { try await calls.delete(e.id) } catch {
                why = "\(Self.title(e)) could not be deleted: \(error.localizedDescription)"
            }
        }
        return why
    }
}
