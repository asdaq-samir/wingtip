import Foundation
import Observation
import OpenAPIRuntime

/// One line of the assistant's stream (POST /api/assistant, newline-
/// delimited JSON, app.assistant): a "tool" line while it looks something
/// up, "text" lines that add to the answer, one "sources" line with the
/// raw reports the answer rests on, then "done" -- or "error" in the
/// planner's words. Decoded by hand, as NavLog.swift does: a stream is
/// not an OpenAPI response.
enum AssistantLine: Equatable, Sendable {
    case tool(name: String, label: String)
    case text(String)
    case sources([AssistantSource])
    case done
    case error(String)
    /// Who is answering, for the caption over the answer ("From the
    /// planner", "On this iPhone"; OnDevice/AskRoute).
    case origin(String)
    /// What came of this answer is withdrawn: the phone's model streamed
    /// sentences, then failed, and the engine's words take their place
    /// (StreamedWords).
    case retract
}

/// A raw thing an answer rests on (a METAR, a NOTAM), shown to the pilot
/// as sent when its chip is tapped: the assistant's Source, generated
/// from its OpenAPI document.
typealias AssistantSource = ASSource

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

/// The pilot's plan, position and record as the assistant's Context takes
/// them (generated from its OpenAPI document), encoded in its snake case
/// by Planner.snakeEncoder; `depart` ISO 8601 UTC, nil for its own now.
typealias AssistantContext = ASContext

extension AssistantContext {
    typealias OwnShipFix = ASOwnShip

    /// The pilot's own: the personal minimums kept on the phone (Verdict)
    /// and their currency as lines of words, for the model to read, never
    /// to compute from. The document leaves Context.pilot open, so this
    /// shape is the app's, sent as the object it encodes to.
    struct PilotRecord: Encodable, Equatable, Sendable {
        var personalMinimums: PersonalMinimums?
        var currency: [String] = []
        var homeBase: String?
    }

    /// The context as the app has it: the plan on the page, the airplane's
    /// last fix, and the pilot where one is signed in. The departure time
    /// is the planner's own now: the plan has none of its own.
    @MainActor
    static func make(plan: Plan, ownShip: OwnShip, session: Session, minimums: PersonalMinimums? = nil, currency: Currency? = nil) -> AssistantContext {
        var context = AssistantContext(aircraft: plan.plannerAircraft, altitudeFt: plan.ownAltitudeFt ?? plan.altitudeFt, dep: plan.dep, depart: nil,
                                       dest: plan.dest, ownShip: nil, pilot: nil, rules: nil, stops: plan.stops)
        if let fix = ownShip.fix {
            context.ownShip = OwnShipFix(altitudeFt: fix.altitudeFt, groundspeedKt: fix.groundspeedKt, lat: fix.coordinate.latitude,
                                         lon: fix.coordinate.longitude, trackDeg: fix.trackDeg)
        }
        var record: PilotRecord?
        if session.signedIn {
            record = PilotRecord(personalMinimums: minimums, homeBase: session.pilot?.homeBase)
            if let currency { record?.currency = Self.words(of: currency) }
        } else if let minimums {
            record = PilotRecord(personalMinimums: minimums)
        }
        // A record that cannot be written as JSON (it always can: strings
        // and numbers) is left out rather than sent half.
        context.pilot = record.flatMap { try? pilotJSON($0) }
        return context
    }

    /// The record as Context.pilot's open object, its keys already in the
    /// planner's snake case: Planner.snakeEncoder converts a struct's keys
    /// but not a dictionary's, so the record is written in snake case here.
    static func pilotJSON(_ record: PilotRecord) throws -> ASContext.PilotPayload {
        try Engine.recoded(record, encoder: Planner.snakeEncoder)
    }

    /// The gateway's currency figures as words: the dates it worked out
    /// (61.57's passenger windows, the flight review, the medical) quoted
    /// as it gave them, nothing worked out here.
    static func words(of currency: Currency) -> [String] {
        var lines: [String] = []
        if let until = currency.dayPassengersUntil { lines.append("Day passenger currency (61.57(a)) until \(until)") }
        if let until = currency.nightPassengersUntil { lines.append("Night passenger currency (61.57(b)) until \(until)") }
        if let until = currency.instrumentCurrentUntil {
            // Approaches flown this month count from next month (61.57(c)(1)).
            if let from = currency.instrumentCurrentFrom {
                lines.append("Instrument not current until \(from) (61.57(c)), then through \(until)")
            } else {
                lines.append("Instrument current (61.57(c)) until \(until)")
            }
        }
        if let on = currency.flightReviewOn { lines.append("Flight review (61.56) on \(on)" + (currency.flightReviewUntil.map { ", good until \($0)" } ?? "")) }
        if let on = currency.medicalExpiresOn { lines.append("Medical expires \(on)") }
        lines.append("\(currency.totalHours.formatted()) hours total, \(currency.nightHours.formatted()) at night, \(currency.crossCountryHours.formatted()) cross-country")
        return lines
    }
}

/// The conversation as the pilot sees it, append-only: each streamed
/// answer becomes the next assistant turn, and the whole list is resent
/// with the next question. Pure, so a stream can be folded into it in a
/// test (AssistantTests).
struct AssistantConversation: Equatable, Sendable {
    var turns: [AssistantTurn] = []
    /// What the assistant is doing right now (a tool's label), while it
    /// is answering; nil between answers and once the text starts.
    var status: String?
    var answering = false

    /// The pilot's question, and the assistant's answer begun, empty.
    mutating func ask(_ question: String) {
        turns.append(AssistantTurn(role: .user, content: question))
        turns.append(AssistantTurn(role: .assistant, content: ""))
        status = nil
        answering = true
    }

    /// One line of the stream folded into the answer being written.
    mutating func take(_ line: AssistantLine) {
        guard let last = turns.indices.last, turns[last].role == .assistant else { return }
        switch line {
        case .tool(_, let label):
            status = label
        case .text(let text):
            turns[last].content += text
            status = nil
        case .sources(let sources):
            turns[last].sources += sources
        case .done:
            status = nil
            answering = false
        case .error(let words):
            turns[last].problem = words
            status = nil
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
        status = nil
        answering = false
        guard let last = turns.indices.last, turns[last].role == .assistant else { return }
        if let problem { turns[last].problem = problem }
    }

    /// The turns the planner is sent: every one with words (its Turn
    /// refuses an empty content, which an answer cut off before its first
    /// word would be).
    var messages: [AssistantMessage] {
        turns.filter { !$0.content.isEmpty }.map { AssistantMessage(content: $0.content, role: $0.role.rawValue) }
    }
}

/// One turn as the assistant's Turn takes it.
typealias AssistantMessage = ASTurn

/// The question as the assistant's AssistantAsk takes it: every turn so
/// far, and the context.
typealias AssistantAsk = ASAssistantAsk

/// The assistant, through the gateway's proxy (/api/planner/assistant,
/// on its allow-list), with the pilot's session cookie as every planner
/// call carries it. One question at a time: a new one cancels the stream
/// of the last, whose words so far stay on the page.
@MainActor
@Observable
final class AssistantClient {
    private(set) var conversation = AssistantConversation()
    private var running: Task<Void, Never>?
    /// The planner, or this iPhone with no signal or when the pilot
    /// picks it (OnDevice/AskRoute).
    var router = AskRouter()

    var turns: [AssistantTurn] { conversation.turns }
    var status: String? { conversation.status }
    var answering: Bool { conversation.answering }

    /// What a planner without the assistant answers (404 through the
    /// gateway's proxy): said where the question was asked.
    nonisolated static let notHere = "The assistant isn't on this planner yet."

    /// `facts` are what the phone holds for an answer worked out on it
    /// (OnDeviceFacts.make); without them, the context's.
    func ask(_ question: String, context: AssistantContext?, facts: OnDeviceFacts? = nil, from pick: AskWhere = .current) {
        let question = question.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !question.isEmpty else { return }
        cancel()
        let earlier = conversation.turns
        conversation.ask(question)
        let ask = AssistantAsk(context: context, messages: conversation.messages)
        let lines = router.stream(question, ask: ask, earlier: earlier, facts: facts ?? .from(context), from: pick)
        running = Task { [weak self] in
            do {
                for try await line in lines {
                    guard !Task.isCancelled else { return }
                    self?.conversation.take(line)
                }
                guard !Task.isCancelled else { return }
                // A stream that ends with no "done" is cut off; the words
                // so far stay, and the pilot is told the answer is short.
                if self?.conversation.answering == true { self?.conversation.broke("The answer was cut off.") }
            } catch {
                guard !Task.isCancelled else { return }
                self?.conversation.broke(Self.words(for: error))
            }
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

    nonisolated static func words(for error: any Error) -> String {
        if let failure = error as? Planner.Failure {
            return failure.status == 404 ? notHere : failure.localizedDescription
        }
        return (error as? URLError)?.code == .cancelled ? "The answer was given up." : "The assistant could not be reached: \(error.localizedDescription)"
    }

    /// The answer's lines, read as the assistant sends them through the
    /// app's session (Gateway.session, so the cookie and the cache policy
    /// are the app's), with its generated client.
    nonisolated static func stream(_ ask: AssistantAsk) -> AsyncThrowingStream<AssistantLine, any Error> {
        Planner.lines({ try await Planner.ask { try await $0.askAssistant(body: .json(ask)).ok.body.applicationXNdjson } }) { try decode(line: $0) }
    }

    /// One line of the stream, or nil for a kind the app has no use for.
    nonisolated static func decode(line: Data) throws -> AssistantLine? {
        struct Kind: Decodable { let type: String }
        struct Tool: Decodable { var name: String?; var label: String? }
        struct Text: Decodable { var text: String? }
        struct Sources: Decodable { var sources: [AssistantSource]? }
        struct Problem: Decodable { var words: String?; var detail: String? }
        // Each member one word, so the generated Source's own keys read
        // with no strategy.
        let decoder = Planner.json
        switch try decoder.decode(Kind.self, from: line).type {
        case "tool":
            let tool = try decoder.decode(Tool.self, from: line)
            return .tool(name: tool.name ?? "", label: tool.label ?? "Working…")
        case "text":
            return .text(try decoder.decode(Text.self, from: line).text ?? "")
        case "sources":
            return .sources(try decoder.decode(Sources.self, from: line).sources ?? [])
        case "done":
            return .done
        case "error":
            let problem = try decoder.decode(Problem.self, from: line)
            return .error(problem.words ?? problem.detail ?? "The assistant could not answer.")
        default:
            return nil
        }
    }
}
