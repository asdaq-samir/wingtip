import Foundation
import Testing
@testable import Wingtip

/// The Brief's ADIZ line (RouteAdiz, the engine's route_adiz; 14 CFR
/// 99.41-99.49) against the web's shared fixture of routes
/// (apps/web/src/lib/fixtures/edgePlaces.json, the web's adiz.test.ts
/// reads the same): each route's lead, or none where it meets no zone.
@MainActor
struct RouteAdizTests {
    private final class Here {}

    struct Fixture: Decodable {
        struct Adiz: Decodable { let routes: [Route] }
        struct Route: Decodable {
            struct Point: Decodable { let lat: Double; let lon: Double }
            let why: String
            let points: [Point]
            let lead: String?
        }
        let adiz: Adiz
    }

    static func routes() throws -> [Fixture.Route] {
        let url = try #require(Bundle(for: Here.self).url(forResource: "edgePlaces", withExtension: "json"))
        return try JSONDecoder().decode(Fixture.self, from: Data(contentsOf: url)).adiz.routes
    }

    @Test func eachRouteHasTheFixturesLead() throws {
        let routes = try Self.routes()
        #expect(!routes.isEmpty)
        for route in routes {
            let brief = try RouteAdiz.brief(points: route.points.map { (lat: $0.lat, lon: $0.lon) }).get()
            #expect(brief?.lead == route.lead, "\(route.why)")
            if let brief {
                #expect(!brief.cite.isEmpty, "\(route.why)")
            }
        }
    }

    @Test func noRouteNoLine() throws {
        #expect(try RouteAdiz.brief(points: []).get() == nil)
    }
}
