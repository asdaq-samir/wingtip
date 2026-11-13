import CoreLocation
import Foundation
import MapKit

/// The radar's newest frame kept along the route for the air: its tiles
/// over a corridor round the course, at the zooms the loop is looked at
/// from a cockpit, so a kept loop is not a blank list of frames (the
/// offline audit's gap 6). The radar only, not the satellite, and only
/// the newest frame: the loop's older ones are minutes apart and the same
/// picture to a pilot with no signal. Capped, so a long route keeps no
/// more than a few megabytes of it. Read back by LoopTileOverlay where
/// IEM cannot be reached; the frame's age is the loop's own line.
enum KeepRadar {
    /// The zooms kept: a state's width down to a county's, the radar's
    /// mosaic being about a kilometre (LoopTileOverlay's maximumZ 10).
    static let minZoom = 5, maxZoom = 8
    /// Either side of the course: the weather a pilot can still turn
    /// away from, not only what is on the line.
    static let halfWidthNm: Double = 25
    /// At most this many tiles, the coarsest first: about 3 MB at
    /// IEM's 5 to 15 kB a tile.
    static let most = 300

    /// A tile's key in the kept pictures, by its address.
    static func key(_ url: URL) -> String { "radar:\(url.absoluteString)" }

    /// The tiles kept for a route's line, coarsest first, within the cap.
    static func tiles(along line: [CLLocationCoordinate2D]) throws -> [KeepRoute.Tile] {
        let all = try KeepRoute.tiles(along: line, minZoom: minZoom, maxZoom: maxZoom, halfWidthNm: halfWidthNm, stepNm: 10)
        return Array(all.sorted { ($0.z, $0.x, $0.y) < ($1.z, $1.x, $1.y) }.prefix(most))
    }

    /// The newest frame's radar tiles fetched and kept; the files they are
    /// in, for the keep's size. Nothing where the frames carry no radar.
    @MainActor
    static func keep(_ loop: APIWeatherLoop, along line: [CLLocationCoordinate2D]) async -> [URL] {
        guard let template = loop.frames.last(where: { $0.radarTiles != nil })?.radarTiles,
              let tiles = try? tiles(along: line) else { return [] }
        let overlay = LoopTileOverlay(template: template, key: "keep", radar: true)
        let urls = tiles.map { overlay.url(forTilePath: MKTileOverlayPath(x: $0.x, y: $0.y, z: $0.z, contentScaleFactor: 1)) }
        return await withTaskGroup(of: URL?.self) { group in
            var queue = urls[...]
            var running = 0
            var files: [URL] = []
            while !queue.isEmpty || running > 0 {
                while running < 4, let next = queue.popFirst() {
                    running += 1
                    group.addTask {
                        guard let (data, response) = try? await URLSession.shared.data(from: next),
                              (response as? HTTPURLResponse)?.statusCode == 200 else { return nil }
                        KeptForAir.writePicture(data, path: key(next))
                        return KeptForAir.file("pictures", key(next), ext: "img")
                    }
                }
                if let done = await group.next() {
                    running -= 1
                    if let done { files.append(done) }
                }
                if Task.isCancelled { break }
            }
            return files
        }
    }
}
