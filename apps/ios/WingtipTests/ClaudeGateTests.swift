import Foundation
import Testing
@testable import Wingtip

/// The server's Claude features off (the owner, 2026-11-10: "For now just
/// the free siri and gemini"): the switch read as the gateway reports it,
/// failing closed, and every answer chain stopping at this iPhone's models
/// and the engine, never the server's assistant.
struct ClaudeGateTests {
    @Test func onlyAKnownOnIsOn() {
        #expect(!ClaudeGate.on(claudeFeatures: "OFF", access: "SIGN_IN", signedIn: true, developer: true))
        #expect(!ClaudeGate.on(claudeFeatures: nil, access: nil, signedIn: true, developer: true))
        #expect(!ClaudeGate.on(claudeFeatures: "SOMETHING_NEW", access: "SIGN_IN", signedIn: true, developer: true))
        #expect(!ClaudeGate.on(claudeFeatures: "OFF", access: "OPEN", signedIn: false, developer: false))
        #expect(ClaudeGate.on(claudeFeatures: "EVERYONE", access: "SIGN_IN", signedIn: true, developer: false))
        #expect(!ClaudeGate.on(claudeFeatures: "EVERYONE", access: "SIGN_IN", signedIn: false, developer: false))
        #expect(ClaudeGate.on(claudeFeatures: "DEVELOPERS", access: "SIGN_IN", signedIn: true, developer: true))
        #expect(!ClaudeGate.on(claudeFeatures: "DEVELOPERS", access: "SIGN_IN", signedIn: true, developer: false))
    }

    @Test func offAskIsThePhonesWhateverThePick() async throws {
        for pick in AskWhere.allCases {
            let router = OnDeviceRouteTests.router(planner: OnDeviceRouteTests.planner([.text("planner")]), online: true, claudeOn: false)
            let got = await OnDeviceRouteTests.lines(router.stream("glide", ask: OnDeviceRouteTests.ask, earlier: [],
                                                                   facts: try OnDeviceAskTests.facts(), from: pick))
            #expect(!got.lines.contains(.text("planner")))
            #expect(!got.lines.contains(.origin("From the planner")))
            #expect(got.lines.last == .done)
        }
    }

    @Test func offWordsAreThisIphonesAndNeverThePlanners() async throws {
        let said = await WordsFor(planner: WordsTests.Fake(words: WordsTests.planners), device: WordsTests.Fake(words: WordsTests.devices),
                                  claudeOn: { false }).said(try WordsTests.ask())
        #expect(said.origin == .device)
        #expect(said.words.sentences.map(\.text) == ["Fuel is enough."])
    }

    @Test func offWithNoModelSaysWhyWithoutThePlanner() async throws {
        let said = await WordsFor(planner: WordsTests.Fake(words: WordsTests.planners),
                                  device: WordsTests.Fake(words: nil, error: WordsUnavailable(why: "Words on this iPhone need iOS 26.")),
                                  claudeOn: { false }).said(try WordsTests.ask())
        #expect(said.origin == .none)
        #expect(said.words.unavailable == "No words: Words on this iPhone need iOS 26.")
    }

    @Test func offCheckpointDescriptionsAskNothing() async throws {
        var lines = 0
        for try await _ in Planner.describeCheckpoints(dep: "KMSN", dest: "KDLH", stops: [], claudeOn: false) { lines += 1 }
        #expect(lines == 0)
    }

    @MainActor
    @Test func offCoachHasThePlanAndNoWords() async throws {
        let plain = CoachCalls(plan: { _ in
            let raw = Data(CoachModelTests.plan.utf8)
            return CoachPlanned(plan: try Planner.json.decode(ProficiencyPlan.self, from: raw), raw: raw)
        })
        let pilot = CoachPilot(entries: [try CoachModelTests.entry()])
        let model = CoachModel(calls: plain, fetchPilot: { pilot }, fetchDebriefs: { [] },
                               defaults: UserDefaults(suiteName: "coach-off-\(UUID().uuidString)")!)
        await model.load()
        await model.make(home: "kmsn")
        #expect(model.plan != nil)
        #expect(model.words == nil)
        #expect(model.wordsProblem == nil)
        #expect(!model.wording)
    }
}
