import Foundation
import Testing
@testable import Wingtip

/// You's Connected Apps (the web's useConnectedApps): the connections
/// listed, one ended only once the question is answered, a connection
/// already gone (404) no problem, any other refusal said, and the list
/// read again either way.
@MainActor
struct ConnectedAppsModelTests {
    /// What the fake gateway holds and was asked to end.
    actor FakeGateway {
        var held: [ConnectedApp]
        var ended: [String] = []
        let refuse: Int?
        init(_ held: [ConnectedApp], refuse: Int? = nil) { self.held = held; self.refuse = refuse }
        func list() -> [ConnectedApp] { held }
        func end(_ id: String) throws {
            ended.append(id)
            if let refuse { throw GatewayRefusal(status: refuse, words: nil) }
            held.removeAll { $0.id == id }
        }
    }

    nonisolated static func app(_ id: String, _ name: String, renewed: String? = "2026-11-20T15:04:05Z") -> ConnectedApp {
        ConnectedApp(app: name, can: [], id: id, renewedAt: renewed, scopes: "flights", until: nil)
    }

    static func model(_ gateway: FakeGateway) async -> ConnectedAppsModel {
        let model = ConnectedAppsModel(calls: .init(list: { await gateway.list() }, disconnect: { try await gateway.end($0) }))
        await model.load()
        return model
    }

    @Test func theConnectionsAreListed() async {
        let model = await Self.model(FakeGateway([Self.app("a", "Claude"), Self.app("b", "ChatGPT")]))
        #expect(model.apps?.map(\.app) == ["Claude", "ChatGPT"])
        #expect(!model.failed)
    }

    @Test func aListThatFailsSaysSo() async {
        struct Down: Error {}
        let model = ConnectedAppsModel(calls: .init(list: { throw Down() }, disconnect: { _ in }))
        await model.load()
        #expect(model.failed)
    }

    @Test func nothingIsEndedUntilTheQuestionIsAnswered() async {
        let gateway = FakeGateway([Self.app("a", "Claude")])
        let model = await Self.model(gateway)
        await model.confirm()
        #expect(await gateway.ended.isEmpty)
        model.asked = model.apps?.first
        await model.confirm()
        #expect(await gateway.ended == ["a"])
        #expect(model.apps?.isEmpty == true)
        #expect(model.asked == nil)
        #expect(model.problem == nil)
    }

    @Test func oneAlreadyGoneIsNoProblem() async {
        let model = await Self.model(FakeGateway([Self.app("a", "Claude")], refuse: 404))
        model.asked = model.apps?.first
        await model.confirm()
        #expect(model.problem == nil)
    }

    @Test func anotherRefusalIsSaid() async {
        let model = await Self.model(FakeGateway([Self.app("a", "Claude")], refuse: 502))
        model.asked = model.apps?.first
        await model.confirm()
        #expect(model.problem == "Claude was not disconnected.")
        #expect(model.apps?.count == 1)
    }

    @Test func lastUsedIsTheRenewalsDay() {
        #expect(ConnectedAppsModel.lastUsed(Self.app("a", "Claude"))?.hasPrefix("Last used ") == true)
        #expect(ConnectedAppsModel.lastUsed(Self.app("a", "Claude", renewed: "2026-11-20T15:04:05.123456Z")) != nil)
        #expect(ConnectedAppsModel.lastUsed(Self.app("a", "Claude", renewed: nil)) == nil)
    }
}
