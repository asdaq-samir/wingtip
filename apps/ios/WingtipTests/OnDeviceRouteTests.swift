import Foundation
import FoundationModels
import Testing
@testable import Wingtip

/// Which way a question goes (AskRouter), the Foundation Models tools'
/// wiring to the engine, and the Brief's glance from the model's guided
/// output (BriefSummary), parsed and held to the findings.
struct OnDeviceRouteTests {
    static func lines(_ stream: AsyncThrowingStream<AssistantLine, any Error>) async -> (lines: [AssistantLine], error: (any Error)?) {
        var out: [AssistantLine] = []
        do {
            for try await line in stream { out.append(line) }
            return (out, nil)
        } catch {
            return (out, error)
        }
    }

    static func planner(_ lines: [AssistantLine], then error: (any Error)? = nil) -> @Sendable (AssistantAsk) -> AsyncThrowingStream<AssistantLine, any Error> {
        { _ in
            AsyncThrowingStream { continuation in
                for line in lines { continuation.yield(line) }
                continuation.finish(throwing: error)
            }
        }
    }

    static func router(planner: @escaping @Sendable (AssistantAsk) -> AsyncThrowingStream<AssistantLine, any Error>, online: Bool,
                       claudeOn: Bool = true) -> AskRouter {
        AskRouter(planner: planner, device: OnDeviceAsk(model: OnDeviceAskTests.FakeModel(unavailableWhy: "No model.")), online: { online },
                  claudeOn: { claudeOn })
    }

    static let ask = AssistantAsk(context: nil, messages: [AssistantMessage(content: "glide?", role: "user")])

    @Test func offlineAutomaticAsksThePhoneAtOnce() async throws {
        let router = Self.router(planner: Self.planner([.text("planner")]), online: false)
        let got = await Self.lines(router.stream("glide", ask: Self.ask, earlier: [], facts: try OnDeviceAskTests.facts(), from: .automatic))
        #expect(got.lines.first == .origin("The engine on this iPhone · No model."))
        #expect(!got.lines.contains(.text("planner")))
        #expect(got.lines.last == .done)
    }

    @Test func aPlannerThatCannotBeReachedFallsToThePhone() async throws {
        let router = Self.router(planner: Self.planner([], then: URLError(.notConnectedToInternet)), online: true)
        let got = await Self.lines(router.stream("glide", ask: Self.ask, earlier: [], facts: try OnDeviceAskTests.facts(), from: .automatic))
        #expect(got.error == nil)
        #expect(got.lines.contains { if case .tool(name: "on-device", _) = $0 { true } else { false } })
        #expect(got.lines.contains { if case .sources(let s) = $0 { s.map(\.id) == ["glide"] } else { false } })
    }

    @Test func aPlannersErrorBeforeItsFirstWordFallsToThePhone() async throws {
        let router = Self.router(planner: Self.planner([.tool(name: "x", label: "Looking"), .error("The assistant is busy.")]), online: true)
        let got = await Self.lines(router.stream("glide", ask: Self.ask, earlier: [], facts: try OnDeviceAskTests.facts(), from: .automatic))
        #expect(!got.lines.contains(.error("The assistant is busy.")))
        #expect(got.lines.last == .done)
    }

    @Test func aPlannersAnswerBegunStaysThePlanners() async throws {
        let router = Self.router(planner: Self.planner([.text("Half"), .text(" an answer")], then: URLError(.networkConnectionLost)), online: true)
        let got = await Self.lines(router.stream("glide", ask: Self.ask, earlier: [], facts: try OnDeviceAskTests.facts(), from: .automatic))
        #expect(got.lines == [.origin("From the planner"), .text("Half"), .text(" an answer")])
        #expect(got.error != nil)
    }

    @Test func pickingThePlannerNeverAsksThePhone() async throws {
        let router = Self.router(planner: Self.planner([], then: URLError(.notConnectedToInternet)), online: false)
        let got = await Self.lines(router.stream("glide", ask: Self.ask, earlier: [], facts: try OnDeviceAskTests.facts(), from: .planner))
        #expect(got.lines.isEmpty)
        #expect(got.error != nil)
    }

    @Test func theConversationTakesTheCaption() {
        var conversation = AssistantConversation()
        conversation.ask("glide?")
        conversation.take(.origin("On this iPhone"))
        conversation.take(.text("About 5.4 nm."))
        #expect(conversation.turns.last?.origin == "On this iPhone")
    }

    // MARK: The tools, as the model calls them

    @Test func theToolsCallTheEngineAndLogWhatTheyHandOver() async throws {
        let facts = try OnDeviceAskTests.facts()
        let log = FigureLog()
        let wind = RunwayWindTool(facts: facts, log: log)
        let said = try await wind.call(arguments: .init(GeneratedContent(properties: ["ident": "KMSN", "runway": "36"])))
        #expect(said.hasPrefix("[wind:KMSN:36] KMSN runway 36 wind: Runway 36 at KMSN:"))
        let weather = FieldWeatherTool(facts: facts, log: log)
        _ = try await weather.call(arguments: .init(GeneratedContent(properties: ["ident": "MSN"])))
        let none = try await weather.call(arguments: .init(GeneratedContent(properties: ["ident": "KXYZ"])))
        #expect(none.hasPrefix("Not available: This iPhone holds the briefing's fields only (KMSN)"))
        #expect(log.called == ["runwayWind", "fieldWeather", "fieldWeather"])
        #expect(log.figures.map(\.id) == ["wind:KMSN:36", "metar:KMSN", "taf:KMSN", "density:KMSN"])
        #expect(OnDeviceTools.all(facts, log: log).map(\.name) == ["fieldWeather", "runwayWind", "fuel", "glide", "nearestFields"])
    }

    // MARK: The Brief's glance

    static func answer() throws -> GoNoGoAnswer {
        try Planner.json.decode(GoNoGoAnswer.self, from: Data(GoNoGoTests.answer.utf8))
    }

    struct FakeGlance: BriefGlanceModel {
        var unavailableWhy: String?
        var draft: BriefGlanceDraft?
        func draft(_ answer: GoNoGoAnswer) async throws -> BriefGlanceDraft {
            guard let draft else { throw AskRefused(why: "boom") }
            return draft
        }
    }

    /// The model's guided output, as JSON it could give, parsed into the
    /// @Generable shape and held to the findings: the action on a finding
    /// not acted on, the second on one finding and the one quoting a
    /// number of its own are dropped.
    @Test func theGuidedGlanceIsParsedAndHeldToTheFindings() throws {
        let a = try Self.answer()
        let json = """
        {"finding":"\(a.line.finding)","verdict":"Not as loaded.","actions":[
          {"finding":"balance","text":"Take 50 lb out of the baggage: 170 lb is over its 120 lb."},
          {"finding":"balance","text":"Again."},
          {"finding":"fuel","text":"Fuel is fine."},
          {"finding":"weather","text":"Wait for 3 hours."}]}
        """
        let parsed = try BriefGlanceAnswer(GeneratedContent(json: json)).draft
        #expect(parsed.actions.count == 4)
        let summary = try #require(BriefSummary.checked(parsed, answer: a))
        #expect(summary.origin == .device)
        #expect(summary.verdict == "Not as loaded.")
        // 50 lb is no figure of the finding's; fuel is clear; "3 hours" invented.
        #expect(summary.actions.isEmpty == false || Glance.acted(a).isEmpty)
        #expect(!summary.actions.contains { $0.key == "fuel" })
        #expect(!summary.actions.contains { $0.words.contains("50 lb") || $0.words.contains("3 hours") })
    }

    @Test func aGlanceWithTheWrongVerdictIsTheEngines() async throws {
        let a = try Self.answer()
        let wrong = BriefGlanceDraft(finding: a.line.finding == "ok" ? "stop" : "ok", verdict: "Go.", actions: [])
        #expect(BriefSummary.checked(wrong, answer: a) == nil)
        let summary = await BriefSummaryFor(model: FakeGlance(draft: wrong)).summary(a)
        #expect(summary.origin == .engine)
        #expect(summary.verdict == a.line.words)
        #expect(summary.actions.map(\.key) == Glance.lines(a).map(\.key))
    }

    @Test func withNoModelTheGlanceIsTheEnginesAndCanBeSaid() async throws {
        let a = try Self.answer()
        let summary = await BriefSummaryFor(model: FakeGlance(unavailableWhy: "No model.")).summary(a)
        #expect(summary == .engine(a, why: "No model."))
        #expect(summary.spoken.hasPrefix(a.line.words))
        #expect(summary.actions.count <= Glance.most)
    }

    @Test func aGoodDraftIsKeptOnePerFindingAtMostThree() async throws {
        let a = try Self.answer()
        let acted = Glance.acted(a)
        let actions = acted.map { BriefGlanceDraft.Action(finding: $0.key, text: "\($0.label): \($0.detail)") }
        let draft = BriefGlanceDraft(finding: a.line.finding, verdict: a.line.words, actions: actions)
        let summary = await BriefSummaryFor(model: FakeGlance(draft: draft)).summary(a)
        #expect(summary.origin == .device)
        #expect(summary.actions.map(\.key) == Array(acted.prefix(Glance.most).map(\.key)))
    }
}
