import Foundation
import Network

/// Where Ask's answers come from, the pilot's pick (Ask's menu): the
/// planner while it can be reached and this iPhone when not, the planner
/// only, or this iPhone always -- nothing leaves the phone.
enum AskWhere: String, CaseIterable, Identifiable, Sendable {
    case automatic, planner, device

    static let key = "wingtip.ask.where"

    var id: String { rawValue }

    var title: String {
        switch self {
        case .automatic: "Automatic"
        case .planner: "The Planner"
        case .device: "On This iPhone"
        }
    }

    static var current: AskWhere {
        UserDefaults.standard.string(forKey: key).flatMap(AskWhere.init) ?? .automatic
    }
}

/// Whether the phone has a way out (Network's path monitor), read when a
/// question is asked: with none, Automatic asks this iPhone at once
/// rather than waiting on the planner's time-out.
final class Connectivity: @unchecked Sendable {
    static let shared = Connectivity()

    private let monitor = NWPathMonitor()
    private let lock = NSLock()
    private var satisfied = true

    private init() {
        monitor.pathUpdateHandler = { [weak self] path in
            guard let self else { return }
            self.lock.lock()
            self.satisfied = path.status == .satisfied
            self.lock.unlock()
        }
        monitor.start(queue: DispatchQueue(label: "app.wingtipmaps.connectivity"))
    }

    var online: Bool {
        lock.lock()
        defer { lock.unlock() }
        return satisfied
    }
}

/// Which way a question goes, and the fall from the planner to the phone:
/// with Automatic, a planner that cannot be reached, or answers with an
/// error before its first word, is replaced by this iPhone's answer
/// (OnDeviceAsk); a planner's answer begun stays the planner's, cut
/// where it broke. While the server's Claude features are off
/// (ServerFeatures, the owner's decision of 2026-11-10 in docs/decisions)
/// every question is this iPhone's, whatever the pick: the planner's
/// answer is Claude's, and nothing falls through to it.
struct AskRouter: Sendable {
    var planner: @Sendable (AssistantAsk) -> AsyncThrowingStream<AssistantLine, any Error> = { AssistantClient.stream($0) }
    var device = OnDeviceAsk()
    var online: @Sendable () -> Bool = { Connectivity.shared.online }
    var claudeOn: @Sendable () -> Bool = { ServerFeatures.claudeOnNow }

    func stream(_ question: String, ask: AssistantAsk, earlier: [AssistantTurn], facts: OnDeviceFacts,
                from pick: AskWhere) -> AsyncThrowingStream<AssistantLine, any Error> {
        AsyncThrowingStream { continuation in
            let task = Task {
                let onPhone = !claudeOn() || pick == .device || (pick == .automatic && !online())
                if onPhone {
                    await onDevice(question, earlier: earlier, facts: facts, into: continuation)
                    continuation.finish()
                    return
                }
                var begun = false
                var failure: (any Error)?
                do {
                    for try await line in planner(ask) {
                        // An error before any word is a reason to ask the
                        // phone under Automatic, not the answer.
                        if case .error(let words) = line, !begun, pick == .automatic {
                            failure = AskRefused(why: words)
                            break
                        }
                        if case .text = line, !begun {
                            begun = true
                            continuation.yield(.origin(AskOrigin.planner.caption))
                        }
                        continuation.yield(line)
                    }
                } catch {
                    failure = error
                }
                guard !Task.isCancelled else { return continuation.finish() }
                if let failure {
                    guard pick == .automatic, !begun else { return continuation.finish(throwing: failure) }
                    Log.onDevice.notice("the planner did not answer, asking the phone: \(failure.localizedDescription, privacy: .public)")
                    continuation.yield(.tool(name: "on-device", label: "No answer from the planner; working it out on this iPhone…"))
                    await onDevice(question, earlier: earlier, facts: facts, into: continuation)
                }
                continuation.finish()
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }

    /// This iPhone's answer, its checked sentences streamed as the model
    /// finishes each, then the rest, the chips and the end.
    private func onDevice(_ question: String, earlier: [AssistantTurn], facts: OnDeviceFacts,
                          into continuation: AsyncThrowingStream<AssistantLine, any Error>.Continuation) async {
        let streamed = StreamedWords()
        let answer = await device.answer(question, earlier: earlier, facts: facts) { partial in
            let lines = streamed.lines(for: partial.words.sentences.map(\.text))
            if !lines.isEmpty { continuation.yield(.origin(partial.caption)) }
            for line in lines { continuation.yield(line) }
        }
        for line in answer.lines(after: streamed) { continuation.yield(line) }
    }

    /// Apple's model made ready for a question about to be asked on this
    /// iPhone (AppleAskModel.prewarm): when the one search takes focus
    /// and when Ask opens. Not when the planner will answer.
    @MainActor
    static func prewarm(from pick: AskWhere = .current) {
        guard !ServerFeatures.claudeOnNow || pick != .planner else { return }
        AppleAskModel.prewarm()
    }
}
