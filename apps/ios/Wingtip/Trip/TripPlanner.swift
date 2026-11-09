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

    /// One line of the stream folded in (the web's step).
    func take(_ m: TripMessage) {
        switch m.type {
        case "tool": status = m.label
        case "text": status = nil; words += m.text ?? ""
        case "plan": proposal = m.proposal
        case "sources": sources = m.sources ?? []
        case "error": status = nil; problem = m.words; busy = false
        default: status = nil; busy = false
        }
    }

    /// `context` is the plan as the Ask sends it; the trip's ask takes no
    /// airplane picked as "", and the rules as the assistant's default.
    func plan(_ text: String, context: AssistantContext) {
        let text = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
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

    nonisolated static func stream(_ ask: ASTripAsk) -> AsyncThrowingStream<TripMessage, any Error> {
        AsyncThrowingStream { continuation in
            let task = Task {
                do {
                    let request = try await Planner.request("POST", "/api/trip-plan", json: ask, csrf: true)
                    let (bytes, response) = try await Gateway.session.bytes(for: request)
                    let status = (response as? HTTPURLResponse)?.statusCode ?? 0
                    guard status == 200 else {
                        var body = Data()
                        for try await byte in bytes { body.append(byte) }
                        Log.planner.error("the trip planner answered \(status)")
                        throw Planner.Failure(status: status, detail: Planner.detail(of: body))
                    }
                    for try await line in bytes.lines where !line.isEmpty {
                        let message = try Planner.snakeCase.decode(TripMessage.self, from: Data(line.utf8))
                        continuation.yield(message)
                        if message.type == "done" || message.type == "error" { break }
                    }
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }
}
