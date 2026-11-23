import Foundation
import Observation

/// You's Connected Apps, its state and its calls: the AI apps the pilot
/// connected to Wingtip through its connector (the MCP server: Claude,
/// ChatGPT), and one of them ended from Wingtip's own side, asked first,
/// its tokens revoked at once (the deep security review of 2026-11-21,
/// N2; the web's useConnectedApps). A connection already gone (a 404) is
/// simply no longer listed; any other failure is said on the screen.
@MainActor
@Observable
final class ConnectedAppsModel {
    /// The gateway's calls, a test's own in their place.
    struct Calls: Sendable {
        var list: @Sendable () async throws -> [ConnectedApp]
        var disconnect: @Sendable (String) async throws -> Void

        static let gateway = Calls(list: { try await Gateway.connections() }, disconnect: { try await Gateway.disconnect($0) })
    }

    /// nil until the first answer.
    private(set) var apps: [ConnectedApp]?
    /// Why the list could not be read, in place of it.
    private(set) var failed = false
    /// Why the app picked was not disconnected, under the list.
    private(set) var problem: String?
    /// The connection the pilot asked to end, until they answer.
    var asked: ConnectedApp?
    /// The connection being ended, its Disconnect greyed meanwhile.
    private(set) var ending: String?
    @ObservationIgnored private let calls: Calls

    init(calls: Calls = .gateway) {
        self.calls = calls
    }

    func load() async {
        do {
            apps = try await calls.list()
            failed = false
        } catch {
            failed = true
        }
    }

    /// The question's Disconnect: the app asked about ended, and the list
    /// read again whatever the answer.
    func confirm() async {
        guard let app = asked else { return }
        asked = nil
        ending = app.id
        defer { ending = nil }
        do {
            try await calls.disconnect(app.id)
            problem = nil
        } catch let refusal as GatewayRefusal where refusal.status == 404 {
            problem = nil
        } catch {
            problem = Problems.say("\(app.app) was not disconnected", error)
        }
        await load()
    }

    /// When a connection was last renewed, as a day the pilot reads; nil
    /// where the gateway gives none.
    static func lastUsed(_ app: ConnectedApp) -> String? {
        // The gateway's Instant, with or without its fraction of a second.
        guard let at = app.renewedAt,
              let date = (try? Date(at, strategy: .iso8601)) ?? (try? Date(at, strategy: Date.ISO8601FormatStyle(includingFractionalSeconds: true)))
        else { return nil }
        return "Last used \(date.formatted(date: .abbreviated, time: .omitted))"
    }
}
