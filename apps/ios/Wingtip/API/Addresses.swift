import Foundation

/// The planner's addresses fetched whole rather than called through the
/// generated client: MapKit's tile loads, ForeFlight's content packs and
/// the engine's cycle packs (bytes verified, then kept as they came). Here beside the generated clients, so every /api/ path
/// the app knows is in API/ (CLAUDE.md, "The planner only through the
/// generated clients").
extension Planner {
    /// A chart tile through the gateway (/api/planner/chart-tile), of a
    /// cycle and a tile revision, the density's mark ("@2x") in its name.
    nonisolated static func chartTileURL(kind: String, z: Int, x: Int, y: Int, density: String, cycle: String, revision: Int) -> URL {
        Config.gateway.appending(path: "/api/planner/chart-tile/\(kind)/\(z)/\(x)/\(y)\(density).png")
            .appending(queryItems: [URLQueryItem(name: "c", value: cycle), URLQueryItem(name: "r", value: String(revision))])
    }

    /// A region's cycle pack (/api/cycle-pack), its crc32 in the address:
    /// kept as long as its cycle by the phone's cache and the edge's, which
    /// a pack rebuilt within the cycle would otherwise be answered from.
    nonisolated static func cyclePackURL(cycle: String, region: String, crc32: Int) -> URL {
        Config.gateway.appending(path: Config.plannerPath("/api/cycle-pack/\(cycle)/\(region).pack"))
            .appending(queryItems: [URLQueryItem(name: "crc32", value: String(crc32))])
    }

    /// A route's checkpoints pack (app.foreflight), at a short address
    /// ending in its file's name, which ForeFlight names it by.
    nonisolated static func foreFlightPackURL(route: String) -> URL {
        Config.gateway.appending(path: "/api/planner/foreflight-pack/\(route)/\(route)-checkpoints.zip")
    }
}
