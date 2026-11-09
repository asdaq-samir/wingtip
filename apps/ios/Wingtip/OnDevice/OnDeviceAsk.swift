import Foundation
import os
#if canImport(FoundationModels)
import FoundationModels
#endif

/// Who wrote an answer the pilot reads, for the caption over it.
enum AskOrigin: String, Equatable, Sendable {
    case planner, device, engine

    var caption: String {
        switch self {
        case .planner: "From the planner"
        case .device: "On this iPhone"
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
    var lines: [AssistantLine] {
        guard !words.sentences.isEmpty else {
            return [.origin(caption), .error(words.unavailable ?? "This iPhone holds nothing to answer that with.")]
        }
        return [.origin(caption), .text(words.sentences.map(\.text).joined(separator: " ")), .sources(words.sources), .done]
    }
}

/// The model that words an answer from the tools' figures: Apple's on the
/// phone, or a fake in a test (the simulator may have no model).
protocol AskModel: Sendable {
    /// Why the model cannot answer here, else nil.
    var unavailableWhy: String? { get }
    /// The sentences, each citing the ids of the figures it rests on; the
    /// tools log every figure they handed over in `log`.
    func sentences(_ question: String, earlier: [AssistantTurn], facts: OnDeviceFacts, log: FigureLog) async throws -> [WordsSentence]
}

/// Apple's on-device model (Foundation Models, iOS 26 with Apple
/// Intelligence on), its tools the engine's rules (OnDeviceTools).
struct AppleAskModel: AskModel {
    var unavailableWhy: String? { OnDeviceWords.unavailableWhy }

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

    func sentences(_ question: String, earlier: [AssistantTurn], facts: OnDeviceFacts, log: FigureLog) async throws -> [WordsSentence] {
        #if canImport(FoundationModels)
        if #available(iOS 26, *) {
            let plan = log.figures.first { $0.id == "plan:route" }
            let session = LanguageModelSession(tools: OnDeviceTools.all(facts, log: log), instructions: Self.instructions)
            let response = try await session.respond(to: Self.prompt(question, earlier: earlier, plan: plan), generating: WordsAnswer.self)
            return response.content.sentences.map { WordsSentence(sources: $0.sources, text: $0.text) }
        }
        #endif
        throw AskRefused(why: "Answers on this iPhone need iOS 26.")
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

    func answer(_ question: String, earlier: [AssistantTurn] = [], facts: OnDeviceFacts) async -> OnDeviceAnswer {
        if let why = model.unavailableWhy { return engine(question, facts: facts, why: why) }
        let log = FigureLog()
        // The plan's own line is citable whatever the tools are asked.
        if let plan = try? FlightFigures.route(facts: facts) { log.add(plan, by: "plan") }
        do {
            let sentences = try await model.sentences(question, earlier: earlier, facts: facts, log: log)
            let words = NumberGuard.kept(Words.checked(sentences, sources: log.sources, model: OnDeviceWords.model, most: Self.most))
            Log.onDevice.info("asked on the phone: tools \(log.called.joined(separator: ","), privacy: .public), \(sentences.count) sentences, \(words.sentences.count) kept")
            if !words.sentences.isEmpty { return OnDeviceAnswer(words: words, origin: .device) }
            return engine(question, facts: facts, why: "The model's words rested on no figure, so the engine's are given.")
        } catch {
            Log.onDevice.notice("the on-device model failed: \(error.localizedDescription, privacy: .public)")
            return engine(question, facts: facts, why: "Apple's on-device model could not answer.")
        }
    }

    private func engine(_ question: String, facts: OnDeviceFacts, why: String) -> OnDeviceAnswer {
        OnDeviceAnswer(words: EngineWords.answer(question, facts: facts, pins: pins), origin: .engine, why: why)
    }
}

extension Log {
    /// The answers on the phone: the tools called, sentences kept.
    static let onDevice = Logger(subsystem: subsystem, category: "on-device")
}
