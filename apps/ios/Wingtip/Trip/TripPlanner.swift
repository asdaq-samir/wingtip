import Foundation
import Observation
import os

typealias TripLeg = ASTripLeg
typealias TripMessage = ASTripMessage

/// The trip planner, as the web's (features/tripPlanner) has it: a trip in
/// the pilot's own words ("VFR to Oshkosh Saturday morning, stay out of
/// the Chicago Class B, back by 5") sent to the assistant's POST
/// /api/trip-plan (the gateway's /api/planner proxy) with the plan the app
/// has and this phone's time zone, its stream read as it comes: the tool
/// in use as a passing line, the reason, then the proposal and its
/// sources. Every figure in it is the planner's; nothing is applied until
/// the pilot taps Use.
@MainActor @Observable
final class TripPlanner {
    private(set) var asked = ""
    private(set) var status: String?
    private(set) var words = ""
    private(set) var proposal: ASTripProposal?
    private(set) var sources: [AssistantSource] = []
    private(set) var problem: String?
    private(set) var busy = false
    /// The legs loaded, by kind.
    private(set) var used: [String] = []
    private var running: Task<Void, Never>?

    /// One line of the stream folded in (the web's step): the document's
    /// lines, told apart by their `type`.
    func take(_ m: TripMessage) {
        switch m {
        case .tool(let tool): status = tool.label
        case .text(let text): status = nil; words += text.text
        case .plan(let planned): proposal = planned.proposal
        case .sources(let found): sources = found.sources
        case .error(let error): status = nil; problem = error.words; busy = false
        case .done: status = nil; busy = false
        }
    }

    /// `context` is the plan as the Ask sends it; the trip's ask takes no
    /// airplane picked as "", and the rules as the assistant's default.
    func plan(_ text: String, context: AssistantContext) {
        let text = text.trimmingCharacters(in: .whitespacesAndNewlines)
        // Claude's, so never asked while the server's Claude features are
        // off (ServerFeatures); Ask offers no way here then.
        guard !text.isEmpty, ServerFeatures.claudeOnNow else { return }
        stop()
        reset()
        asked = text; busy = true; status = "Reading the trip"
        var context = context
        context.aircraft = context.aircraft ?? ""
        context.rules = "vfr"
        let ask = ASTripAsk(context: context, text: text, timeZone: TimeZone.current.identifier)
        running = Task { [weak self] in
            do {
                for try await m in Self.stream(ask) { self?.take(m) }
            } catch is CancellationError {
            } catch {
                if (error as? URLError)?.code != .cancelled { self?.problem = Self.words(for: error) }
            }
            self?.busy = false; self?.status = nil
        }
    }

    func use(_ leg: TripLeg) { used.append(leg.kind) }

    func stop() {
        running?.cancel()
        running = nil
        busy = false; status = nil
    }

    func clear() {
        stop()
        reset()
    }

    private func reset() {
        asked = ""; words = ""; proposal = nil; sources = []; problem = nil; used = []
    }

    /// The web's words where the call itself fails.
    nonisolated static func words(for error: any Error) -> String {
        if let failure = error as? Planner.Failure {
            return failure.status == 401 ? "Sign in to plan a trip" : failure.localizedDescription
        }
        return "The trip planner cannot be reached: \(error.localizedDescription)"
    }

    /// The proposal's lines as the assistant writes them, through its
    /// generated client; the stream ends with its "done" or "error".
    nonisolated static func stream(_ ask: ASTripAsk) -> AsyncThrowingStream<TripMessage, any Error> {
        // A line of a kind this app does not know yet is skipped.
        Planner.lines({ try await Planner.ask { try await $0.tripPlan(body: .json(ask)).ok.body.applicationXNdjson } }) {
            try? Planner.json.decode(TripMessage.self, from: $0)
        }
    }
}
