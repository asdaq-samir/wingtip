import Foundation
import FoundationModels
import os

/// Who wrote an answer the pilot reads, for the caption over it.
enum AskOrigin: String, Equatable, Sendable {
    case planner, device, cloud, engine

    var caption: String {
        switch self {
        case .planner: "From the planner"
        case .device: "On this iPhone"
        case .cloud: "Apple's Private Cloud Compute"
        case .engine: "The engine on this iPhone"
        }
    }
}

/// An answer worked out on the phone: the sentences and the figures they
/// cite, who wrote them, and why the model did not, where it did not.
struct OnDeviceAnswer: Equatable, Sendable {
    let words: Words
    let origin: AskOrigin
    var why: String?

    /// The caption over the answer: "On this iPhone", or "The engine on
    /// this iPhone · Apple Intelligence is off in Settings."
    var caption: String { why.map { "\(origin.caption) · \($0)" } ?? origin.caption }

    /// The answer as the assistant's stream lines (AssistantConversation
    /// takes them as it takes the planner's).
    var lines: [AssistantLine] { lines(after: StreamedWords()) }

    /// The finished answer after what was streamed of it: only the
    /// sentences not shown yet, or the shown ones withdrawn where the
    /// answer is not their continuation (a model that failed half way,
    /// and the engine's words in their place).
    func lines(after streamed: StreamedWords) -> [AssistantLine] {
        guard !words.sentences.isEmpty else {
            let why = words.unavailable ?? "This iPhone holds nothing to answer that with."
            return [.origin(caption)] + streamed.lines(for: []) + [.error(why)]
        }
        return [.origin(caption)] + streamed.lines(for: words.sentences.map(\.text)) + [.sources(words.sources), .done]
    }
}

/// The sentences of an answer shown so far while the model writes, so
/// each update streams only what is new: Ask's conversation appends
/// text (AssistantConversation.take), and an update that does not go on
/// from what is shown withdraws it first. The model's partial output is
/// streamed a whole, checked sentence at a time (OnDeviceAsk), never a
/// half sentence whose number the guard has not seen.
final class StreamedWords: @unchecked Sendable {
    private let lock = NSLock()
    private var shown: [String] = []

    func lines(for sentences: [String]) -> [AssistantLine] {
        lock.lock()
        defer { lock.unlock() }
        if sentences.starts(with: shown) {
            let new = sentences.dropFirst(shown.count)
            guard !new.isEmpty else { return [] }
            let text = (shown.isEmpty ? "" : " ") + new.joined(separator: " ")
            shown = sentences
            return [.text(text)]
        }
        shown = sentences
        return [.retract] + (sentences.isEmpty ? [] : [.text(sentences.joined(separator: " "))])
    }
}

/// The model that words an answer from the tools' figures: Apple's on the
/// phone, or a fake in a test (the simulator may have no model).
protocol AskModel: Sendable {
    /// Why the model cannot answer here, else nil.
    var unavailableWhy: String? { get }
    /// The sentences, each citing the ids of the figures it rests on; the
    /// tools log every figure they handed over in `log`. `partial` is
    /// given the sentences finished so far as the model writes them.
    func sentences(_ question: String, earlier: [AssistantTurn], facts: OnDeviceFacts, log: FigureLog,
                   partial: @escaping @Sendable ([WordsSentence]) -> Void) async throws -> [WordsSentence]
}

/// Apple's on-device model (Foundation Models, with Apple
/// Intelligence on), its tools the engine's rules (OnDeviceTools).
struct AppleAskModel: AskModel {
    var unavailableWhy: String? { AppleModels.unavailableWhy }

    static let instructions = """
    You answer a pilot's question in flight from a flight planner's figures. Call the tools for every figure you need: \
    the weather and density altitude at a field, the wind on its runways, the fuel, the glide, the nearest airports. \
    Rules: every number, ident, altitude, time, distance, wind, ceiling or visibility you write must be quoted from a tool's \
    answer or the plan as given, as given; never compute, round, convert or add one of your own. Every sentence must cite, \
    by id, the figures it rests on, using the ids in square brackets exactly as given. If a tool says a figure is not \
    available, say so plainly. Two to four short sentences; no greeting. Never say a flight is safe: the decision is the \
    pilot in command's.
    """

    /// The question, the plan's own line (already in the log, so it can
    /// be cited) and the last turns, short: the model's context is small.
    static func prompt(_ question: String, earlier: [AssistantTurn], plan: AskFigure?) -> String {
        var parts: [String] = []
        if let plan { parts.append("The plan: \(plan.forModel)") }
        let recent = earlier.suffix(4).filter { !$0.content.isEmpty }
        if !recent.isEmpty {
            parts.append("Earlier:\n" + recent.map { "\($0.role == .user ? "Pilot" : "You"): \($0.content)" }.joined(separator: "\n"))
        }
        parts.append("The pilot asks: \(question)")
        return parts.joined(separator: "\n\n")
    }

    func sentences(_ question: String, earlier: [AssistantTurn], facts: OnDeviceFacts, log: FigureLog,
                   partial: @escaping @Sendable ([WordsSentence]) -> Void) async throws -> [WordsSentence] {
        let plan = log.figures.first { $0.id == "plan:route" }
        // The phone's model, else Apple's Private Cloud Compute where it
        // cannot run or fails (AppleModels); where it answered is logged.
        let (sentences, place) = try await AppleModels.attempt { (place: ModelPlace) async throws -> [WordsSentence] in
            log.place = place
            let session = AppleModels.session(place, tools: OnDeviceTools.all(facts, log: log), instructions: Self.instructions)
            // Streamed (streamResponse), so the first sentence is read
            // while the rest are written: each snapshot's sentences but
            // the last are finished, since `text` and `sources` come in
            // that order and the next sentence begins only after both.
            let stream = session.streamResponse(to: Self.prompt(question, earlier: earlier, plan: plan), generating: WordsAnswer.self)
            var finished = 0
            var last: GeneratedContent?
            for try await snapshot in stream {
                last = snapshot.rawContent
                let done = (snapshot.content.sentences ?? []).dropLast().compactMap(Self.sentence)
                if done.count > finished {
                    finished = done.count
                    partial(done)
                }
            }
            guard let last else { return [] }
            return try WordsAnswer(last).sentences.map { WordsSentence(sources: $0.sources, text: $0.text) }
        }
        log.place = place
        return sentences
    }

    /// A sentence of a snapshot, once both its parts have come.
    private static func sentence(_ part: WordsAnswer.Sentence.PartiallyGenerated) -> WordsSentence? {
        guard let text = part.text, let sources = part.sources else { return nil }
        return WordsSentence(sources: sources, text: text)
    }

    /// Apple's model loaded, and the instructions and tools read into it,
    /// before the pilot's question is (LanguageModelSession.prewarm, in
    /// the iOS 27.2 SDK as in 26): Ask's first answer waited on the load.
    /// Called when the one search takes focus and when Ask opens. The
    /// tools are made over no facts here: their names and schemas, which
    /// are what the prefix holds, are the same whatever the facts.
    @MainActor private static var warmed: AnyObject?

    @MainActor
    static func prewarm() {
        guard OnDeviceWords.unavailableWhy == nil else { return }
        let session = AppleModels.session(.device, tools: OnDeviceTools.all(OnDeviceFacts(), log: FigureLog()), instructions: instructions)
        session.prewarm()
        warmed = session
    }
}

/// A question answered on the phone, with no signal: Apple's model with
/// the engine's tools where it can run, each sentence checked against the
/// figures the tools gave (Words.checked: ids; NumberGuard: numbers), and
/// the engine's own words (EngineWords) where it cannot or where none of
/// its sentences passed. Never a figure of the model's own.
struct OnDeviceAsk: Sendable {
    var model: any AskModel = AppleAskModel()
    var pins: FlightFigures.Pins = FlightFigures.packPins

    /// At most this many sentences of the model's are kept.
    static let most = 6

    /// `partial` is given the answer so far, its sentences checked as the
    /// finished one is, while the model writes.
    func answer(_ question: String, earlier: [AssistantTurn] = [], facts: OnDeviceFacts,
                partial: @escaping @Sendable (OnDeviceAnswer) -> Void = { _ in }) async -> OnDeviceAnswer {
        if let why = model.unavailableWhy { return engine(question, facts: facts, why: why) }
        // With no figure on the phone for any tool to hand over, every
        // sentence the model wrote would rest on none and be dropped: the
        // speed audit (2026-11-10) waited 8.3 s for such an answer. The
        // engine's words, which say what is missing, come at once instead.
        guard EngineWords.holdsAny(question, facts: facts, pins: pins) else { return engine(question, facts: facts, why: nil) }
        let log = FigureLog()
        // The plan's own line is citable whatever the tools are asked.
        if let plan = try? FlightFigures.route(facts: facts) { log.add(plan, by: "plan") }
        do {
            let sentences = try await model.sentences(question, earlier: earlier, facts: facts, log: log) { sentences in
                let words = Self.checked(sentences, log: log)
                if !words.sentences.isEmpty { partial(OnDeviceAnswer(words: words, origin: log.place == .cloud ? .cloud : .device)) }
            }
            let words = Self.checked(sentences, log: log)
            Log.onDevice.info("asked on the phone: tools \(log.called.joined(separator: ","), privacy: .public), \(sentences.count) sentences, \(words.sentences.count) kept")
            if !words.sentences.isEmpty { return OnDeviceAnswer(words: words, origin: log.place == .cloud ? .cloud : .device) }
            return engine(question, facts: facts, why: "The model's words rested on no figure, so the engine's are given.")
        } catch {
            Log.onDevice.notice("the on-device model failed: \(error.localizedDescription, privacy: .public)")
            return engine(question, facts: facts, why: "Apple's on-device model could not answer.")
        }
    }

    /// The model's sentences that cite only figures the tools gave, and
    /// quote only their numbers: the same check, partial or finished.
    private static func checked(_ sentences: [WordsSentence], log: FigureLog) -> Words {
        NumberGuard.kept(Words.checked(sentences, sources: log.sources, model: OnDeviceWords.model, most: most))
    }

    private func engine(_ question: String, facts: OnDeviceFacts, why: String?) -> OnDeviceAnswer {
        OnDeviceAnswer(words: EngineWords.answer(question, facts: facts, pins: pins), origin: .engine, why: why)
    }
}

extension Log {
    /// The answers on the phone: the tools called, sentences kept.
    static let onDevice = Logger(subsystem: subsystem, category: "on-device")
}
