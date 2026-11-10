import Foundation

/// Deletes held back while their Undo stands, kept on the phone until they
/// are sent. Saved Flights and the Logbook send a delete only once the list
/// is left (docs/navigation.md), so one made just before the app was
/// closed from the app switcher, or stopped by the system, was never sent
/// and the flight was back at the next launch. Kept here, a delete left
/// from an earlier launch is sent at this one (`sendLeftOver`, the app's
/// launch) and stays off its list meanwhile; one held in this launch waits
/// for its list to be left, its Undo still standing. As the web keeps its
/// own (lib/pendingDeletes).
@MainActor
struct PendingDeletes {
    /// What a delete is of, by the gateway's call that sends it.
    enum Kind: String, Codable, CaseIterable {
        /// DELETE /api/flights/{id}.
        case flight
        /// DELETE /api/logbook/{id}.
        case logbook
    }

    private struct Held: Codable, Equatable {
        let kind: Kind
        let id: Int
        /// The launch it was held in.
        let launch: String
    }

    /// This launch, to tell its own deletes from those left by another.
    static let thisLaunch = UUID().uuidString
    private static let key = "wingtip.pendingDeletes"

    let defaults: UserDefaults
    /// The launch it holds deletes for (a test's next launch its own).
    let launch: String

    init(defaults: UserDefaults = .standard, launch: String = PendingDeletes.thisLaunch) {
        self.defaults = defaults
        self.launch = launch
    }

    private var all: [Held] {
        get { defaults.data(forKey: Self.key).flatMap { try? JSONDecoder().decode([Held].self, from: $0) } ?? [] }
        nonmutating set {
            if newValue.isEmpty { defaults.removeObject(forKey: Self.key) } else { defaults.set(try? JSONEncoder().encode(newValue), forKey: Self.key) }
        }
    }

    /// Held while its Undo stands.
    func hold(_ kind: Kind, _ id: Int) {
        all = all.filter { $0.kind != kind || $0.id != id } + [Held(kind: kind, id: id, launch: launch)]
    }

    /// Undone, sent, or refused: no longer pending.
    func release(_ kind: Kind, _ id: Int) {
        all = all.filter { $0.kind != kind || $0.id != id }
    }

    /// The ids of `kind` not yet sent, for its list to leave out.
    func ids(_ kind: Kind) -> Set<Int> {
        Set(all.filter { $0.kind == kind }.map(\.id))
    }

    /// Every delete an earlier launch left, sent by its kind's call; one
    /// sent, or refused for good (gone already, not the pilot's), let go,
    /// and one that could not be sent yet (no connection, signed out, the
    /// server down) kept for the next launch. How many were let go.
    @discardableResult
    func sendLeftOver(_ send: (Kind, Int) async throws -> Void) async -> Int {
        var done = 0
        for held in all where held.launch != launch {
            do { try await send(held.kind, held.id) } catch let refusal as GatewayRefusal where refusal.status != 401 && refusal.status < 500 {
                // Refused for good: let go below.
            } catch {
                continue
            }
            release(held.kind, held.id)
            done += 1
        }
        return done
    }

    /// The gateway's own calls for each kind.
    static func gateway(_ kind: Kind, _ id: Int) async throws {
        switch kind {
        case .flight: try await Gateway.deleteFlight(id)
        case .logbook: try await Gateway.deleteLogbookEntry(id)
        }
    }
}
