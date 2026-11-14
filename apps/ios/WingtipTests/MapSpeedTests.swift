import CoreLocation
import Foundation
import Testing
@testable import Wingtip

/// What the map's speed work keeps the same: the regions remembered by the
/// degree are the engine's, the packs' list is read once and again after
/// a keep, the strip's place is the engine's for the fix, and a track's
/// writes off the main actor land in order and never outlive an erase.
@MainActor
struct MapSpeedTests {
    @Test func aRememberedRegionIsTheEnginesForEveryPointOfItsDegree() throws {
        // Both sides of the equator and the meridian, and a region's edges
        // (pack_query.rs region_of's 4-degree squares).
        for (lat, lon) in [(41.98, -88.35), (40.0, -88.0), (39.999, -88.001), (-0.5, 0.5), (-33.9, 151.2), (43.99, -84.01)] {
            let asked = Engine.region(lat: lat, lon: lon)
            let engine: String = try Engine.call("region_of", json: ["lat": lat, "lon": lon])
            #expect(asked == engine)
            // A second point in the same degree comes from memory, and is still the engine's.
            let near = (lat.rounded(.down) + 0.99, lon.rounded(.down) + 0.01)
            let again: String = try Engine.call("region_of", json: ["lat": near.0, "lon": near.1])
            #expect(Engine.region(lat: near.0, lon: near.1) == again)
        }
    }

    @Test func thePacksListIsReadOnceAndAgainOnceRewritten() throws {
        let root = FileManager.default.temporaryDirectory.appending(path: "packs-\(UUID().uuidString)", directoryHint: .isDirectory)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        func index(_ cycle: String) -> Data {
            Data(#"{"cycle":"\#(cycle)","built_at":0,"tolerance_deg":0.0001,"worst_nm":0.006,"region_deg":4,"regions":[]}"#.utf8)
        }
        let packs = CyclePacks(root: root)
        #expect(packs.index == nil)
        try index("2026-10-29").write(to: root.appending(path: "index.json"))
        // Kept as first read (none), as the map's asks no longer read the disk.
        #expect(packs.index == nil)
        let fresh = CyclePacks(root: root)
        #expect(fresh.index?.cycle == "2026-10-29")
    }

    @Test func theStripsPlaceIsTheEnginesAndAskedOnceAFix() throws {
        let points = StripData.points(dep: "C81", dest: "KMSN", stops: [], legs: [], checkpoints: [], course: nil)
        let fix = OwnShip.Fix(coordinate: CLLocationCoordinate2D(latitude: 42.5, longitude: -88.7), altitudeFt: 3500, trackDeg: 300,
                              groundspeedKt: 100, accuracyM: 5, at: Date(timeIntervalSince1970: 1_794_254_240))
        let place = StripPlace()
        let first = try place.along(points, fix: fix).get()
        let engine = try StripData.positionAlong(points, fix: fix.coordinate)
        #expect(first?.leg == engine?.leg && first?.along == engine?.along)
        let again = try place.along(points, fix: fix).get()
        #expect(again?.leg == first?.leg && again?.along == first?.along)
    }

    @Test func writesLandInOrderAndAnEraseIsLast() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "bg-\(UUID().uuidString)/track.json")
        defer { try? FileManager.default.removeItem(at: url.deletingLastPathComponent()) }
        let file = BackgroundFile(url)
        for n in 1...50 { file.write(Array(0..<n)) }
        file.write([7])
        // The 51 writes land off the main actor at a utility priority, which
        // a loaded CI simulator can starve for longer than any fixed wait
        // (11 s, 2026-11-14): waited for on the queue itself. A write out of
        // order would leave another array there.
        await file.settled()
        let read = { try? JSONDecoder().decode([Int].self, from: Data(contentsOf: url)) }
        #expect(read() == [7])
        file.write(Array(0..<5000))
        file.remove()
        #expect(!FileManager.default.fileExists(atPath: url.path))
        await file.settled()
        #expect(!FileManager.default.fileExists(atPath: url.path))
    }
}

/// The screens' models the app makes once (ScreenModels) reach what the
/// singletons did: a card going away lets go of the app's own shared
/// flight and drafted entry, and a navigator with none lets go of nothing.
@MainActor
struct ScreenModelsTests {
    @Test func aCardGoingAwayLetsGoOfTheAppsOwnModels() {
        let screens = ScreenModels()
        let nav = Navigator()
        nav.screens = screens
        nav.open(.flightLogged)
        nav.open(.mapSettings)
        #expect(!screens.autoLogbook.isOpen)
        let bare = Navigator()
        bare.open(.sharedFlight)
        bare.open(.mapSettings)
        #expect(!screens.sharedFlight.showing)
    }
}
