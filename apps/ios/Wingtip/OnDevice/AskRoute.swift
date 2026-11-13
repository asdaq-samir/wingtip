import Foundation

/// Ask's answers, worked out on this iPhone (OnDeviceAsk): the engine's
/// figures, worded by Apple's models where they can run. Nothing leaves
/// the phone for an answer.
struct AskRouter: Sendable {
    var device = OnDeviceAsk()

    func stream(_ question: String, earlier: [AssistantTurn], facts: OnDeviceFacts) -> AsyncStream<AssistantLine> {
        AsyncStream { continuation in
            let task = Task {
                await onDevice(question, earlier: earlier, facts: facts, into: continuation)
                continuation.finish()
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }

    /// This iPhone's answer, its checked sentences streamed as the model
    /// finishes each, then the rest, the chips and the end.
    private func onDevice(_ question: String, earlier: [AssistantTurn], facts: OnDeviceFacts,
                          into continuation: AsyncStream<AssistantLine>.Continuation) async {
        let streamed = StreamedWords()
        let answer = await device.answer(question, earlier: earlier, facts: facts) { partial in
            let lines = streamed.lines(for: partial.words.sentences.map(\.text))
            if !lines.isEmpty { continuation.yield(.origin(partial.caption)) }
            for line in lines { continuation.yield(line) }
        }
        for line in answer.lines(after: streamed) { continuation.yield(line) }
    }

    /// Apple's model made ready for a question about to be asked
    /// (AppleAskModel.prewarm): when the one search takes focus and when
    /// Ask opens.
    @MainActor
    static func prewarm() {
        AppleAskModel.prewarm()
    }
}
