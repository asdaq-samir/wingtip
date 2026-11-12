import Foundation
import Observation
import os

/// Whether this pilot may have the features Claude writes on the server
/// (the assistant, the words, the checkpoint descriptions, the trip
/// planner, a photographed page read): the gateway's own switch,
/// app.claude-features, read from GET /api/auth/capabilities.
///
/// Off unless the gateway says on. The owner, 2026-11-10: "To keep the
/// cost low, we only add the claude feature later when we decide about
/// subscription model. For now just the free siri and gemini." (the
/// decision record is in docs/decisions). So the server's default is OFF,
/// and this app fails closed: not yet asked, offline, or an answer it
/// cannot read is off too, and every answer then stops at Apple's models
/// and the engine on this iPhone. The gateway refuses each Claude route
/// with a 404 while off as well; this keeps the app from asking at all.
enum ClaudeGate {
    /// On for EVERYONE signed in, or for DEVELOPERS when the pilot is one;
    /// where nobody can sign in (OPEN, one's own machine) the gateway
    /// opens what the switch opens to anyone. Anything else is off.
    static func on(claudeFeatures: String?, access: String?, signedIn: Bool, developer: Bool) -> Bool {
        let open = access == "OPEN"
        switch claudeFeatures {
        case "EVERYONE": return signedIn || open
        case "DEVELOPERS": return developer || open
        default: return false
        }
    }
}

/// The app's one copy of that answer: observed by the screens that hide
/// what has no free path while off, and readable from any thread by the
/// calls that choose a route (AskRouter, WordsFor, CoachCalls, ...).
@MainActor
@Observable
final class ServerFeatures {
    static let shared = ServerFeatures()

    /// Whether the server's Claude features are this pilot's now.
    private(set) var claudeOn = false

    /// The same, for code off the main actor: set with `claudeOn`.
    private nonisolated static let snapshot = OSAllocatedUnfairLock(initialState: false)

    nonisolated static var claudeOnNow: Bool { snapshot.withLock { $0 } }

    /// Asks the gateway again: at launch and after any sign-in or
    /// sign-out (Session.refresh), as who the pilot is can change it.
    /// A failure leaves it off, never on.
    func refresh(signedIn: Bool, developer: Bool) async {
        do {
            let capabilities = try await Gateway.call { try await $0.capabilities().ok.body.json }
            set(ClaudeGate.on(claudeFeatures: capabilities.claudeFeatures, access: capabilities.access,
                              signedIn: signedIn, developer: developer))
        } catch {
            Log.app.notice("the server's features could not be asked: \(error.localizedDescription, privacy: .public)")
            set(false)
        }
    }

    /// Set here only, and in a test.
    func set(_ on: Bool) {
        claudeOn = on
        Self.snapshot.withLock { $0 = on }
    }
}
