import Foundation

/// The planner's addresses the app hands to something else to fetch,
/// rather than calling them itself: MapKit's tile loads and ForeFlight's
/// content packs. Here beside the generated clients, so every /api/ path
/// the app knows is in API/ (CLAUDE.md, "The planner only through the
/// generated clients").
extension Planner {
    /// A chart tile through the gateway (/api/planner/chart-tile), of a
    /// cycle and a tile revision, the density's mark ("@2x") in its name.
    nonisolated static func chartTileURL(kind: String, z: Int, x: Int, y: Int, density: String, cycle: String, revision: Int) -> URL {
        Config.gateway.appending(path: "/api/planner/chart-tile/\(kind)/\(z)/\(x)/\(y)\(density).png")
            .appending(queryItems: [URLQueryItem(name: "c", value: cycle), URLQueryItem(name: "r", value: String(revision))])
    }

    /// A route's checkpoints pack (app.foreflight), at a short address
    /// ending in its file's name, which ForeFlight names it by.
    nonisolated static func foreFlightPackURL(route: String) -> URL {
        Config.gateway.appending(path: "/api/planner/foreflight-pack/\(route)/\(route)-checkpoints.zip")
    }
}
