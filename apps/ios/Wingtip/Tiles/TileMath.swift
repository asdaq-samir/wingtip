import Foundation

/// The Web Mercator (EPSG:3857) tile grid every XYZ server cuts its tiles
/// on, the iPhone's one copy of its maths. MapKit's own map points are not
/// these: its metres per point are the ellipsoid's, not the tiles' sphere
/// of 6,378,137 m, and MapLibre Native iOS is not in this app, so the
/// formulas live here once (Android's is tiles/TileGrid.kt, the web's
/// lib/map/tileMath.ts).
enum TileMath {
    /// Half the earth's circumference in web Mercator metres.
    static let halfCircumference = Double.pi * 6_378_137

    /// The column and row at zoom `zoom` of a point, north at row 0, held
    /// inside the grid so a point past an edge is in the edge's tile.
    static func tile(lat: Double, lon: Double, zoom: Int) -> (x: Int, y: Int) {
        let n = pow(2.0, Double(zoom))
        let x = Int(((lon + 180) / 360 * n).rounded(.down))
        let y = Int(((1 - mercatorY(lat) / .pi) / 2 * n).rounded(.down))
        return (min(max(x, 0), Int(n) - 1), min(max(y, 0), Int(n) - 1))
    }

    /// The latitude and longitude of a tile's centre.
    static func centre(z: Int, x: Int, y: Int) -> (lat: Double, lon: Double) {
        let n = pow(2.0, Double(z))
        let lon = (Double(x) + 0.5) / n * 360 - 180
        let lat = latitude(mercatorY: .pi * (1 - 2 * (Double(y) + 0.5) / n))
        return (lat, lon)
    }

    /// A tile's box in web Mercator metres: west, south, east, north.
    static func metres(z: Int, x: Int, y: Int) -> (west: Double, south: Double, east: Double, north: Double) {
        let size = 2 * halfCircumference / pow(2, Double(z))
        let west = -halfCircumference + Double(x) * size, north = halfCircumference - Double(y) * size
        return (west, north - size, west + size, north)
    }

    /// Web Mercator's y of a latitude on the unit sphere, in radians.
    static func mercatorY(_ lat: Double) -> Double { log(tan(.pi / 4 + lat * .pi / 360)) }

    /// The latitude of a Web Mercator y on the unit sphere.
    static func latitude(mercatorY y: Double) -> Double { atan(sinh(y)) * 180 / .pi }
}
