import CoreLocation
import Foundation
import MapKit
import Testing
import UIKit
@testable import Wingtip

/// The tile addresses and the store, as the web app's tiles.test.ts pins
/// them: a CDN edition by path, the planner's by query, the revision on
/// both.
struct TilesTests {
    @Test func cdnTilesCarryTheCycleAsAPathSegment() throws {
        let t = TileTemplate(cycle: "09-03-2026", revision: 2, tilesBase: "https://tiles.example.com/tiles", kind: "sec")
        #expect(t.url(z: 8, x: 62, y: 93).absoluteString == "https://tiles.example.com/tiles/09-03-2026/sec/8/62/93.png?r=2")
    }

    @Test func plannerTilesGoThroughTheGatewayWithTheCycleAsAQuery() throws {
        let t = TileTemplate(cycle: "09-03-2026", revision: 0, tilesBase: nil, kind: "sec")
        let url = t.url(z: 8, x: 62, y: 93)
        #expect(url.host() == Config.host)
        #expect(url.path() == "/api/planner/chart-tile/sec/8/62/93.png")
        #expect(url.query() == "c=09-03-2026&r=0")
    }

    @Test func theSharpTilesAreTheSameAddressWithAt2x() throws {
        let cdn = TileTemplate(cycle: "09-03-2026", revision: 2, tilesBase: "https://tiles.example.com/tiles", kind: "sec", scale: 2)
        #expect(cdn.url(z: 8, x: 62, y: 93).absoluteString == "https://tiles.example.com/tiles/09-03-2026/sec/8/62/93@2x.png?r=2")
        let planner = TileTemplate(cycle: "09-03-2026", revision: 0, tilesBase: nil, kind: "sec", scale: 2)
        #expect(planner.url(z: 8, x: 62, y: 93).path() == "/api/planner/chart-tile/sec/8/62/93@2x.png")
    }

    @Test func theStoreKeepsTheTwoDensitiesApart() throws {
        let root = FileManager.default.temporaryDirectory.appending(path: "tiles-\(UUID().uuidString)")
        let store = TileStore(root: root)
        store.write(Data([1]), cycle: "09-03-2026", kind: "sec", z: 8, x: 62, y: 93)
        store.write(Data([2, 2]), cycle: "09-03-2026", kind: "sec", z: 8, x: 62, y: 93, scale: 2)
        #expect(store.read(cycle: "09-03-2026", kind: "sec", z: 8, x: 62, y: 93) == Data([1]))
        #expect(store.read(cycle: "09-03-2026", kind: "sec", z: 8, x: 62, y: 93, scale: 2) == Data([2, 2]))
        try? FileManager.default.removeItem(at: root)
    }

    @Test func keptTilesLiveOutsideCachesAndOutOfBackups() throws {
        // The app's own stores: Keep for the Air's under Application
        // Support, which iOS does not purge; the map's own under Caches.
        let shared = TileStore()
        #expect(shared.keptRoot.path.contains("/Library/Application Support/"))
        #expect(shared.root.path.contains("/Library/Caches/"))
        let root = FileManager.default.temporaryDirectory.appending(path: "tiles-\(UUID().uuidString)")
        let store = TileStore(root: root)
        store.write(Data([1]), cycle: "09-03-2026", kind: "sec", z: 8, x: 62, y: 93)
        #expect(!store.isKept(cycle: "09-03-2026", kind: "sec", z: 8, x: 62, y: 93))
        store.write(Data([2]), cycle: "09-03-2026", kind: "sec", z: 8, x: 62, y: 93, kept: true)
        #expect(store.isKept(cycle: "09-03-2026", kind: "sec", z: 8, x: 62, y: 93))
        // The kept one is read first.
        #expect(store.read(cycle: "09-03-2026", kind: "sec", z: 8, x: 62, y: 93) == Data([2]))
        let values = try store.keptRoot.resourceValues(forKeys: [.isExcludedFromBackupKey])
        #expect(values.isExcludedFromBackup == true)
        try? FileManager.default.removeItem(at: root)
        try? FileManager.default.removeItem(at: store.keptRoot)
    }

    @Test func eachWaitIsItsOwnSessionsTimeout() throws {
        // The reads a pilot waits on: about ten seconds with no byte, not 60.
        #expect(Planner.read == 10)
        #expect(Servers.sessions[.read]?.configuration.timeoutIntervalForRequest == 10)
        // A call made in the air is bound as a whole: five seconds from
        // asking to the last byte, however they trickle in.
        #expect(Servers.sessions[.inFlight]?.configuration.timeoutIntervalForResource == Planner.inFlight)
        // An upload waits two minutes with no byte; the usual call, the
        // session's own minute.
        #expect(Servers.sessions[.upload]?.configuration.timeoutIntervalForRequest == Planner.upload)
        #expect(Servers.sessions[.usual] === Gateway.session)
        // Every one keeps the one jar and the one cache.
        for session in Servers.sessions.values {
            #expect(session.configuration.httpCookieStorage === SessionCookies.jar)
            #expect(session.configuration.urlCache === Gateway.answers)
        }
    }

    @Test func plannerPathsAreRewrittenUnderTheGatewaysProxy() throws {
        #expect(Config.plannerPath("/api/chart") == "/api/planner/chart")
        #expect(Config.plannerPath("/api/airport/KDLH") == "/api/planner/airport/KDLH")
        #expect(Config.plannerPath("/logout") == "/logout")
    }

    @Test func theStoreKeepsATileByCycleKindAndPathAndDropsOtherEditions() throws {
        let root = FileManager.default.temporaryDirectory.appending(path: "tiles-\(UUID().uuidString)")
        let store = TileStore(root: root)
        store.write(Data([1, 2, 3]), cycle: "09-03-2026", kind: "sec", z: 8, x: 62, y: 93)
        store.write(Data([4]), cycle: "07-10-2026", kind: "sec", z: 8, x: 62, y: 93)
        #expect(store.read(cycle: "09-03-2026", kind: "sec", z: 8, x: 62, y: 93) == Data([1, 2, 3]))
        #expect(store.bytes() == 4)
        store.keepOnly(cycle: "09-03-2026")
        #expect(store.read(cycle: "07-10-2026", kind: "sec", z: 8, x: 62, y: 93) == nil)
        #expect(store.bytes() == 3)
        try? FileManager.default.removeItem(at: root)
    }
}

/// The tiles a route's corridor needs, the web map's own arithmetic.
struct KeepRouteTests {
    @Test func aPointFallsInTheTileTheWebMapAsksFor() throws {
        // Campbell (C81) at zoom 8: x 65, y 94, as the web map addresses it.
        let t = KeepRoute.tile(lat: 42.3246, lon: -88.0741, zoom: 8)
        #expect(t.x == 65 && t.y == 94)
    }

    @Test func aShortRouteWantsAFewTilesAtEachZoomAndMoreAtTheFiner() throws {
        let line = [CLLocationCoordinate2D(latitude: 42.32, longitude: -88.07), CLLocationCoordinate2D(latitude: 42.42, longitude: -87.87)]
        let coarse = try KeepRoute.tiles(along: line, minZoom: 7, maxZoom: 7)
        let fine = try KeepRoute.tiles(along: line, minZoom: 10, maxZoom: 10)
        #expect(coarse.count >= 9 && coarse.count <= 16)
        #expect(fine.count > coarse.count)
        #expect(try KeepRoute.tiles(along: [line[0]], minZoom: 7, maxZoom: 10).isEmpty)
    }
}

/// The pyramid laid on MapKit's map by the chart's own renderer
/// (ChartTileRenderer): which level it draws at a zoom, where each tile
/// lies, and the memory it keeps the decoded tiles in.
struct ChartTileMathTests {
    @Test func aTilesSquareIsTheWorldCutTwoToTheZTimes() throws {
        let rect = ChartTileMath.mapRect(ChartTile(z: 10, x: 262, y: 380))
        #expect(rect.width == MKMapSize.world.width / 1024)
        #expect(rect.minX == 262 * rect.width && rect.minY == 380 * rect.height)
    }

    @Test func OHaresTileIsTheOneTheWebMapAsksFor() throws {
        // The position dot's map point falls in the tile the web map
        // addresses for the same place at every level: the chart and the
        // dot are on one grid.
        let ohare = CLLocationCoordinate2D(latitude: 41.9786, longitude: -87.9048)
        for z in 4...13 {
            let web = KeepRoute.tile(lat: ohare.latitude, lon: ohare.longitude, zoom: z)
            let ours = ChartTileMath.tile(at: MKMapPoint(ohare), z: z)
            #expect(ours == ChartTile(z: z, x: web.x, y: web.y))
            #expect(ChartTileMath.mapRect(ours).contains(MKMapPoint(ohare)))
        }
    }

    @Test func aRectWantsTheTilesItTouchesAndNoMore() throws {
        let one = ChartTileMath.mapRect(ChartTile(z: 8, x: 65, y: 94))
        #expect(ChartTileMath.tiles(in: one, z: 8) == [ChartTile(z: 8, x: 65, y: 94)])
        let four = ChartTileMath.tiles(in: one.offsetBy(dx: one.width / 2, dy: one.height / 2), z: 8)
        #expect(Set(four) == [ChartTile(z: 8, x: 65, y: 94), ChartTile(z: 8, x: 66, y: 94), ChartTile(z: 8, x: 65, y: 95), ChartTile(z: 8, x: 66, y: 95)])
        // Past the world's edge, nothing beyond it.
        #expect(ChartTileMath.tiles(in: MKMapRect(x: -10, y: -10, width: 5, height: 5), z: 3).isEmpty)
    }

    /// The zoom scale at which the pyramid's level z is 256 points a tile.
    private static func scale(level z: Double) -> Double { 256 * pow(2, z) / MKMapSize.world.width }

    @Test func aThreeXScreenDrawsTheSharpTilesNeverEnlargedMoreThanHalfAgain() throws {
        // At a whole level the 512-pixel tile covers 768 pixels: 1.5, so
        // that level; a little past it a level finer.
        #expect(ChartTileMath.level(zoomScale: Self.scale(level: 8), screenScale: 3, tileScale: 2, minZoom: 3, maxZoom: 12) == 8)
        #expect(ChartTileMath.level(zoomScale: Self.scale(level: 8.1), screenScale: 3, tileScale: 2, minZoom: 3, maxZoom: 12) == 9)
        // A 2x screen moves on a little over half a level later.
        #expect(ChartTileMath.level(zoomScale: Self.scale(level: 8.4), screenScale: 2, tileScale: 2, minZoom: 3, maxZoom: 12) == 8)
        #expect(ChartTileMath.level(zoomScale: Self.scale(level: 8.6), screenScale: 2, tileScale: 2, minZoom: 3, maxZoom: 12) == 9)
        // The 256-pixel pyramid a level finer than the sharp one.
        #expect(ChartTileMath.level(zoomScale: Self.scale(level: 8), screenScale: 3, tileScale: 1, minZoom: 3, maxZoom: 12) == 9)
    }

    @Test func theLevelStaysInsideThePyramid() throws {
        // Past the last level, the last enlarged; under the first, the
        // first to a level above it, then no chart.
        #expect(ChartTileMath.level(zoomScale: Self.scale(level: 15), screenScale: 3, tileScale: 2, minZoom: 3, maxZoom: 12) == 12)
        #expect(ChartTileMath.level(zoomScale: Self.scale(level: 2.5), screenScale: 3, tileScale: 2, minZoom: 3, maxZoom: 12) == 3)
        #expect(ChartTileMath.level(zoomScale: Self.scale(level: 1.5), screenScale: 3, tileScale: 2, minZoom: 3, maxZoom: 12) == nil)
        #expect(ChartTileMath.level(zoomScale: 0, screenScale: 3, tileScale: 2, minZoom: 3, maxZoom: 12) == nil)
    }

    @Test func aTileLoadingIsCoveredByThePartOfItsParentOverIt() throws {
        let (parent, part) = try #require(ChartTileMath.ancestor(of: ChartTile(z: 9, x: 131, y: 188), levels: 1))
        #expect(parent == ChartTile(z: 8, x: 65, y: 94))
        #expect(part == CGRect(x: 0.5, y: 0, width: 0.5, height: 0.5))
        let (grand, quarter) = try #require(ChartTileMath.ancestor(of: ChartTile(z: 10, x: 263, y: 379), levels: 2))
        #expect(grand == ChartTile(z: 8, x: 65, y: 94))
        #expect(quarter == CGRect(x: 0.75, y: 0.75, width: 0.25, height: 0.25))
        #expect(ChartTileMath.ancestor(of: ChartTile(z: 1, x: 0, y: 0), levels: 2) == nil)
    }

    @Test func theCacheKeepsEachTileApartByEditionKindDensityAndLift() throws {
        let cache = TileCache(bytes: 8 * 1024 * 1024)
        let image = try #require(Self.tile(side: 512))
        let sharp = TileCache.key(cycle: "10-29-2026", kind: "sec+lift", z: 9, x: 131, y: 188, scale: 2)
        cache.keep(image, for: sharp)
        #expect(cache.image(sharp) != nil)
        #expect(cache.image(TileCache.key(cycle: "10-29-2026", kind: "sec+lift", z: 9, x: 131, y: 188, scale: 1)) == nil)
        #expect(cache.image(TileCache.key(cycle: "10-29-2026", kind: "sec", z: 9, x: 131, y: 188, scale: 2)) == nil)
        #expect(cache.image(TileCache.key(cycle: "12-24-2026", kind: "sec+lift", z: 9, x: 131, y: 188, scale: 2)) == nil)
        // A decoded 512-pixel tile costs its megabyte.
        #expect(TileCache.cost(of: image) >= 512 * 512 * 4)
        cache.removeAll()
        #expect(cache.image(sharp) == nil)
    }

    @Test func aPNGIsDecodedToAFullColourBitmapOfItsOwnPixels() throws {
        // The @2x tile stays 512 pixels: the renderer draws all of them.
        let png = try #require(Self.tile(side: 512).flatMap { UIImage(cgImage: $0).pngData() })
        let image = try #require(ChartTileImage.decode(png, lift: false))
        #expect(image.width == 512 && image.height == 512)
        #expect(image.bitsPerPixel == 32)
        #expect(ChartTileImage.decode(Data([1, 2, 3]), lift: false) == nil)
    }

    private static func tile(side: Int) -> CGImage? {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        return UIGraphicsImageRenderer(size: CGSize(width: side, height: side), format: format).image { context in
            UIColor.red.setFill()
            context.fill(CGRect(x: 0, y: 0, width: side, height: side))
        }.cgImage
    }
}
