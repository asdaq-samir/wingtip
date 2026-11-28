import Foundation
import HTTPTypes
import OpenAPIRuntime
import PlannerAPI
import Testing
@testable import Wingtip

/// The planner's addresses fetched whole (API/Addresses.swift: MapKit's
/// chart tiles, the cycle packs, ForeFlight's packs) are the generated
/// client's own paths, taken through the gateway, as Android's
/// PlannerPathsTest holds its twins: a path the planner's OpenAPI document
/// moves is caught here with the regenerated client, rather than by a map
/// with no tiles.
struct AddressesTests {
    /// The path the generated client asks, as the transport is handed it.
    private struct Asked: Error { let path: String }

    private nonisolated struct Capture: ClientTransport {
        func send(_ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String) async throws -> (HTTPResponse, HTTPBody?) {
            throw Asked(path: request.path ?? "")
        }
    }

    /// The generated operation's path through the gateway (/api/planner/…).
    private func generated(_ call: (PlannerAPI.Client) async throws -> Void) async -> String? {
        let client = PlannerAPI.Client(serverURL: URL(string: "https://planner.test")!, transport: Capture())
        do {
            try await call(client)
        } catch let error as ClientError {
            return (error.underlyingError as? Asked).map { Config.plannerPath($0.path) }
        } catch {}
        return nil
    }

    @Test func eachAddressIsTheGeneratedOperations() async {
        let tile = await generated { _ = try await $0.chartTile(.init(path: .init(kind: "sec", z: 9, x: 130, y: 190))) }
        #expect(tile == Planner.chartTileURL(kind: "sec", z: 9, x: 130, y: 190, density: "", cycle: "2601", revision: 1).path(percentEncoded: false))
        let sharp = await generated { _ = try await $0.chartTile2x(.init(path: .init(kind: "sec", z: 9, x: 130, y: 190))) }
        #expect(sharp == Planner.chartTileURL(kind: "sec", z: 9, x: 130, y: 190, density: "@2x", cycle: "2601", revision: 1).path(percentEncoded: false))
        let pack = await generated { _ = try await $0.cyclePackFile(.init(path: .init(cycle: "2601", region: "n40w090"))) }
        #expect(pack == Planner.cyclePackURL(cycle: "2601", region: "n40w090", crc32: 7).path(percentEncoded: false))
        let foreFlight = await generated { _ = try await $0.foreflightPack(.init(path: .init(route: "abc123", file: "abc123-checkpoints.zip"))) }
        #expect(foreFlight == Planner.foreFlightPackURL(route: "abc123").path(percentEncoded: false))
    }
}
