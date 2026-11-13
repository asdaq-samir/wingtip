import Foundation
import Observation

/// One line of an answer as Ask's conversation takes it, from the phone's
/// own Ask (OnDevice/AskRoute): "text" lines that add to the answer, one
/// "sources" line with the raw reports the answer rests on, then "done"
/// -- or "error" in words.
enum AssistantLine: Equatable, Sendable {
    case text(String)
    case sources([AssistantSource])
    case done
    case error(String)
    /// Who is answering, for the caption over the answer ("On this
    /// iPhone"; OnDevice/AskRoute).
    case origin(String)
    /// What came of this answer is withdrawn: the phone's model streamed
    /// sentences, then failed, and the engine's words take their place
    /// (StreamedWords).
    case retract
}

/// A raw thing an answer rests on (a METAR, a NOTAM), shown to the pilot
/// as sent when its chip is tapped.
typealias AssistantSource = WordsSource

/// One turn of the conversation, the pilot's question or the assistant's
/// answer with the sources it cited and, where the stream broke, why.
struct AssistantTurn: Identifiable, Equatable, Sendable {
    enum Role: String, Codable, Sendable {
        case user, assistant
    }

    let id: UUID
    let role: Role
    var content: String
    var sources: [AssistantSource] = []
    var problem: String?
    /// Who wrote the answer, said over it; nil before its first word.
    var origin: String?

    init(id: UUID = UUID(), role: Role, content: String, sources: [AssistantSource] = [], problem: String? = nil) {
        self.id = id
        self.role = role
        self.content = content
        self.sources = sources
        self.problem = problem
    }
}

/// The conversation as the pilot sees it, append-only: each streamed
/// answer becomes the next assistant turn, and the turns before go with
/// the next question (OnDeviceAsk). Pure, so a stream can be folded into
/// it in a test (AssistantTests).
struct AssistantConversation: Equatable, Sendable {
    var turns: [AssistantTurn] = []
    var answering = false

    /// The pilot's question, and the assistant's answer begun, empty.
    mutating func ask(_ question: String) {
        turns.append(AssistantTurn(role: .user, content: question))
        turns.append(AssistantTurn(role: .assistant, content: ""))
        answering = true
    }

    /// One line of the stream folded into the answer being written.
    mutating func take(_ line: AssistantLine) {
        guard let last = turns.indices.last, turns[last].role == .assistant else { return }
        switch line {
        case .text(let text):
            turns[last].content += text
        case .sources(let sources):
            turns[last].sources += sources
        case .done:
            answering = false
        case .error(let words):
            turns[last].problem = words
            answering = false
        case .origin(let caption):
            turns[last].origin = caption
        case .retract:
            turns[last].content = ""
            turns[last].sources = []
        }
    }

    /// The stream ended without its "done": the call failed, or was given
    /// up. What came stays; why is said under it.
    mutating func broke(_ problem: String?) {
        answering = false
        guard let last = turns.indices.last, turns[last].role == .assistant else { return }
        if let problem { turns[last].problem = problem }
    }
}

/// Ask, answered on this iPhone (OnDevice/AskRoute). One question at a
/// time: a new one cancels the stream of the last, whose words so far
/// stay on the page.
@MainActor
@Observable
final class AskScreenModel {
    private(set) var conversation = AssistantConversation()
    private var running: Task<Void, Never>?
    var router = AskRouter()

    var turns: [AssistantTurn] { conversation.turns }
    var answering: Bool { conversation.answering }

    /// `facts` are what the phone holds for the answer (OnDeviceFacts.make).
    func ask(_ question: String, facts: OnDeviceFacts) {
        let question = question.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !question.isEmpty else { return }
        cancel()
        let earlier = conversation.turns
        conversation.ask(question)
        let lines = router.stream(question, earlier: earlier, facts: facts)
        running = Task { [weak self] in
            for await line in lines {
                guard !Task.isCancelled else { return }
                self?.conversation.take(line)
            }
            guard !Task.isCancelled else { return }
            // A stream that ends with no "done" is cut off; the words
            // so far stay, and the pilot is told the answer is short.
            if self?.conversation.answering == true { self?.conversation.broke("The answer was cut off.") }
        }
    }

    /// The stream of the last question given up: what came stays.
    func cancel() {
        running?.cancel()
        running = nil
        if conversation.answering { conversation.broke(nil) }
    }

    func clear() {
        cancel()
        conversation = AssistantConversation()
    }
}
