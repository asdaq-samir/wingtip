import Foundation
import PlannerAPI

/// The DOF's obstacles round the map's view (/api/terrain/obstacles): each
/// one's place, its top MSL and its height over its ground.
typealias Obstacle = APIObstacle
/// The weather along the route the side view draws (/api/route-profile/weather):
/// the TAFs' cloud bases, the freezing level and the icing G-AIRMETs, each
/// with its source and time, and the products the store had none of.
typealias ProfileWeather = APIRouteWeather
typealias ProfileObstacle = APIProfileObstacle

extension Planner {
    /// One terrain tile, the ground's heights as a terrarium PNG
    /// (/api/terrain-tile/{z}/{x}/{y}.png): the tiles the planner reads its
    /// terrain floors from, so the map's hazard colouring is the ground the
    /// altitudes were planned over. Nil where the planner has no tile (the
    /// sea, past the country's edge). A read the map waits on.
    static func terrainTile(z: Int, x: Int, y: Int) async throws -> Data? {
        try await call(.read) {
            guard case .ok(let ok) = try await $0.terrainTile(path: .init(z: z, x: x, y: y)) else { return nil }
            return try await Data(collecting: ok.body.png, upTo: 1 << 20)
        }
    }

    /// The obstacles in a box, as the web's hazard colouring and 3D posts
    /// ask them (/api/terrain/obstacles).
    static func obstacles(south: Double, west: Double, north: Double, east: Double) async throws -> [Obstacle] {
        try await call { try await $0.obstacles(query: .init(south: south, west: west, north: north, east: east)).ok.body.json.obstacles }
    }

    /// The weather the side view draws for a flight taking `eteMin`, leaving
    /// now (the planner's default where no departure is given), over the
    /// same hops as /api/route-profile.
    static func routeWeather(dep: String, dest: String, stops: [String], eteMin: Double?) async throws -> ProfileWeather {
        try await call {
            try await $0.routeProfileWeather(query: .init(dep: dep, dest: dest, stops: Self.stops(stops), eteMin: eteMin?.rounded())).ok.body.json
        }
    }
}
