import CoreLocation
import Foundation
import Testing
@testable import Wingtip

/// Downloads: the PMTiles reader over a region's archive, the store the
/// map reads a downloaded tile from first, a cycle's expiry and sweep,
/// and the picks on the list and the map.
struct OfflineChartsTests {
    /// 248 tiles at zooms 3, 10 and 12, each holding "z,x,y", written by
    /// the planner's own writer (wingtip.tile_archive.write) with its root
    /// budget cut to 60 bytes so the archive has leaf directories, as a
    /// region's sectional does.
    static let sample: Data = Data(base64Encoded: [
        "UE1UaWxlcwN/AAAAAAAAABoAAAAAAAAAmQAAAAAAAAAjAAAAAAAAALwAAAAAAAAABgIAAAAAAADCAgAAAAAAAHwJAAAAAAAA+AAAAAAAAAD4AA",
        "AAAAAAAPgAAAAAAAAAAQIBAgMMAC62lAAXW8oA0klrAOmkNQMAAAAAAAAAAB+LCAAAAAAAAv9jlGFoY2EEACWaXSkGAAAAH4sIAAAAAAAC/6tW",
        "ys7MS1GyUlAqTk1WqgUAVzLQ6Q8AAAAfiwgAAAAAAAL/5ZLPa9NgGMf9vm9+vGnSHYrtZAgTKl68iuwg/gHelA0RPPfUk8gOuwgS6yalh1BkjC",
        "JDQpFSKoRQSgxSJJQRSoSSQyljFCljSAgSZPRQim9Qz6J42+fwnB6+n+/z8s5xlTEmsQz73Mpb0gwdauD4QXkoGrKHXsmBR2KyY6uB+JV2iL6X",
        "8TBnbRzQ+pZJbNja3S9XqhtH2Tat4lxsrNw5pQMxjrQAPKtgor9WatCEbOvFHZuOc+fk1S5qBYeW+9nlQ4eE6naDekUdE+H7ehtjqYOYcXvXlz",
        "yxI3PRe6WqjA4FG6/pYtMlbbiaAf+2i/4J4bmzWxYpvdUixAWHNJ948KgOV7Wk/WdD2iABfPF3uekNA3o+DXpuviAV2YBNw81A7Mp1jOhiNbrn",
        "YEk+kVKo6pJJTWLtZeo4YwNUaWOrRbqwtBqSVXPDz/YFCz1htHLGn+tImEZaiAj25QoxkKxNECMhu9dLIf2YG1DvJfRCRzjFULUe1fl0abldrP",
        "GT43UDc8nGlD0NxJYvBeI73mr/WxNdergUUkmiuNIix0uNx9IEfVaDI9TzzQ9IWEQqxEX1pisdw6E19B7/bHMygwlfqF7jZ0kOQiUQ3wiV+we4",
        "qIi/kGX+1xVFYSzDUVIy/4r655U0nssUJfWmVqb8B+9fgEsXkx8ccLKV1QQAADMsMiwxMywwLDMzLDEsNjMsMyw0Myw0LDczLDYsNTMsNSwyMy",
        "w3LDAxMCwwLDEwMTAsNywyMzEwLDE0LDM2MTAsMjEsNDkxMCwyOCw2MjEwLDYzLDEyNzEwLDU2LDExNDEwLDQ5LDEwMTEwLDM1LDc1MTAsNDIs",
        "ODgxMCwxMjYsMjQ0MTAsMTE5LDIzMTEwLDExMiwyMTgxMCwxMDUsMjA1MTAsOTgsMTkyMTAsOTEsMTc5MTAsODQsMTY2MTAsNzcsMTUzMTAsNz",
        "AsMTQwMTAsMjU5LDQ5MTEwLDI2Niw1MDQxMCwyNTIsNDc4MTAsMjQ1LDQ2NTEwLDIzOCw0NTIxMCwyMDMsMzg3MTAsMjEwLDQwMDEwLDIxNyw0",
        "MTMxMCwyMjQsNDI2MTAsMjMxLDQzOTEwLDE5NiwzNzQxMCwxNjEsMzA5MTAsMTQ3LDI4MzEwLDE0MCwyNzAxMCwxMzMsMjU3MTAsMTU0LDI5Nj",
        "EwLDE3NSwzMzUxMCwxNjgsMzIyMTAsMTgyLDM0ODEwLDE4OSwzNjExMCw1MTEsOTU5MTAsNTA0LDk0NjEwLDQ5Nyw5MzMxMCw0ODMsOTA3MTAs",
        "NDkwLDkyMDEwLDQ0OCw4NDIxMCw0NTUsODU1MTAsNDYyLDg2ODEwLDQ2OSw4ODExMCw0NzYsODk0MTAsNDQxLDgyOTEwLDQzNCw4MTYxMCw0Mj",
        "csODAzMTAsNDEzLDc3NzEwLDQyMCw3OTAxMCwzODUsNzI1MTAsNDA2LDc2NDEwLDM5OSw3NTExMCwzOTIsNzM4MTAsMzc4LDcxMjEwLDM0Myw2",
        "NDcxMCwzNTAsNjYwMTAsMzU3LDY3MzEwLDM2NCw2ODYxMCwzNzEsNjk5MTAsMzIyLDYwODEwLDMyOSw2MjExMCwzMzYsNjM0MTAsMzE1LDU5NT",
        "EwLDMwOCw1ODIxMCwyOTQsNTU2MTAsMzAxLDU2OTEwLDI4Nyw1NDMxMCwyODAsNTMwMTAsMjczLDUxNzEwLDUxOCw5NzIxMCw1MjUsOTg1MTAs",
        "NTM5LDEwMTExMCw1MzIsOTk4MTAsODI2LDUyMDEwLDgzMyw1MzMxMCw3NzAsNDE2MTAsNzc3LDQyOTEwLDc4NCw0NDIxMCw4MTksNTA3MTAsOD",
        "EyLDQ5NDEwLDgwNSw0ODExMCw3OTgsNDY4MTAsNzkxLDQ1NTEwLDc2Myw0MDMxMCw3NTYsMzkwMTAsNjg2LDI2MDEwLDY5MywyNzMxMCw3MDAs",
        "Mjg2MTAsNzIxLDMyNTEwLDcyOCwzMzgxMCw3MzUsMzUxMTAsNzQyLDM2NDEwLDc0OSwzNzcxMCw3MTQsMzEyMTAsNzA3LDI5OTEwLDY0NCwxOD",
        "IxMCw2NTEsMTk1MTAsNjU4LDIwODEwLDY2NSwyMjExMCw2NzIsMjM0MTAsNjc5LDI0NzEwLDYzNywxNjkxMCw2MzAsMTU2MTAsNjIzLDE0MzEw",
        "LDYxNiwxMzAxMCw2MDksMTE3MTAsNTk1LDkxMTAsNTg4LDc4MTAsNTgxLDY1MTAsNjAyLDEwNDEwLDU3NCw1MjEwLDU2NywzOTEwLDU0NiwwMT",
        "AsNTUzLDEzMTAsNTYwLDI2MTIsMCwxMjEyLDcsMjUxMiwxNCwzODEyLDIxLDUxMTIsNTYsMTE2MTIsNDksMTAzMTIsMzUsNzcxMiw0Miw5MDEy",
        "LDI4LDY0MTIsNjMsMTI5MTIsMTI2LDI0NjEyLDExOSwyMzMxMiwxMTIsMjIwMTIsMTA1LDIwNzEyLDk4LDE5NDEyLDkxLDE4MTEyLDg0LDE2OD",
        "EyLDc3LDE1NTEyLDcwLDE0MjEyLDI1OSw0OTMxMiwyNjYsNTA2MTIsMjUyLDQ4MDEyLDI0NSw0NjcxMiwyMzgsNDU0MTIsMjAzLDM4OTEyLDIx",
        "MCw0MDIxMiwyMTcsNDE1MTIsMjI0LDQyODEyLDIzMSw0NDExMiwxOTYsMzc2MTIsMTYxLDMxMTEyLDE0NywyODUxMiwxMzMsMjU5MTIsMTQwLD",
        "I3MjEyLDE1NCwyOTgxMiwxNjgsMzI0MTIsMTgyLDM1MDEyLDE3NSwzMzcxMiwxODksMzYzMTIsNTExLDk2MTEyLDUwNCw5NDgxMiw0OTcsOTM1",
        "MTIsNDc2LDg5NjEyLDQ4Myw5MDkxMiw0OTAsOTIyMTIsNDQ4LDg0NDEyLDQ1NSw4NTcxMiw0NjIsODcwMTIsNDY5LDg4MzEyLDQ0MSw4MzExMi",
        "w0MzQsODE4MTIsNDI3LDgwNTEyLDQxMyw3NzkxMiw0MjAsNzkyMTIsMzg1LDcyNzEyLDQwNiw3NjYxMiwzOTIsNzQwMTIsMzk5LDc1MzEyLDM3",
        "OCw3MTQxMiwzNDMsNjQ5MTIsMzUwLDY2MjEyLDM1Nyw2NzUxMiwzNjQsNjg4MTIsMzcxLDcwMTEyLDMyMiw2MTAxMiwzMjksNjIzMTIsMzM2LD",
        "YzNjEyLDMxNSw1OTcxMiwzMDgsNTg0MTIsMjk0LDU1ODEyLDMwMSw1NzExMiwyODcsNTQ1MTIsMjgwLDUzMjEyLDI3Myw1MTkxMiw1MTgsOTc0",
        "MTIsNTI1LDk4NzEyLDUzOSwxMDEzMTIsNTMyLDEwMDAxMiw4MjYsMTU0NjEyLDgzMywxNTU5MTIsODE5LDE1MzMxMiw4MDUsMTUwNzEyLDgxMi",
        "wxNTIwMTIsNzk4LDE0OTQxMiw3OTEsMTQ4MTEyLDc4NCwxNDY4MTIsNzc3LDE0NTUxMiw3NzAsMTQ0MjEyLDY3MiwxMjYwMTIsNjc5LDEyNzMx",
        "Miw2NjUsMTI0NzEyLDY1OCwxMjM0MTIsNjUxLDEyMjExMiw2NDQsMTIwODEyLDYwOSwxMTQzMTIsNjAyLDExMzAxMiw1OTUsMTExNzEyLDU4OC",
        "wxMTA0MTIsNTgxLDEwOTExMiw1NzQsMTA3ODEyLDU2NywxMDY1MTIsNTYwLDEwNTIxMiw1NTMsMTAzOTEyLDU0NiwxMDI2MTIsNjE2LDExNTYx",
        "Miw2MzAsMTE4MjEyLDYyMywxMTY5MTIsNjM3LDExOTUxMiw3MDAsMTMxMjEyLDY5MywxMjk5MTIsNjg2LDEyODYxMiw3MDcsMTMyNTEyLDcxNC",
        "wxMzM4MTIsNzI4LDEzNjQxMiw3MjEsMTM1MTEyLDc0MiwxMzkwMTIsNzQ5LDE0MDMxMiw3MzUsMTM3NzEyLDc1NiwxNDE2MTIsNzYzLDE0Mjk=",
    ].joined())!

    static func sampleFile() throws -> URL {
        let url = FileManager.default.temporaryDirectory.appending(path: "offline-\(UUID().uuidString).pmtiles")
        try sample.write(to: url)
        return url
    }

    static func scratch() -> OfflineStore {
        OfflineStore(root: FileManager.default.temporaryDirectory.appending(path: "offline-\(UUID().uuidString)"))
    }

    @Test func tileIDsAreTheSpecsHilbertCurve() {
        // pmtiles.tile.zxy_to_tileid's own answers.
        #expect(PMTilesReader.tileID(z: 0, x: 0, y: 0) == 0)
        #expect(PMTilesReader.tileID(z: 1, x: 0, y: 0) == 1)
        #expect(PMTilesReader.tileID(z: 1, x: 1, y: 1) == 3)
        #expect(PMTilesReader.tileID(z: 8, x: 65, y: 94) == 30380)
        #expect(PMTilesReader.tileID(z: 12, x: 1047, y: 1522) == 7_777_134)
        #expect(PMTilesReader.tileID(z: 13, x: 2000, y: 3000) == 36_014_997)
        #expect(PMTilesReader.tileID(z: 3, x: 8, y: 0) == nil)
    }

    @Test func theReaderFindsTilesThroughTheLeafDirectories() throws {
        let reader = try PMTilesReader(url: try Self.sampleFile())
        #expect(reader.header.minZoom == 3 && reader.header.maxZoom == 12)
        for (z, x, y) in [(12, 7, 25), (10, 14, 36), (3, 7, 0), (12, 833, 1559)] {
            #expect(reader.tile(z: z, x: x, y: y).map { String(decoding: $0, as: UTF8.self) } == "\(z),\(x),\(y)")
        }
        #expect(reader.tile(z: 12, x: 8, y: 25) == nil)
        #expect(reader.tile(z: 11, x: 7, y: 25) == nil)
    }

    @Test func notAnArchiveIsRefused() throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "offline-\(UUID().uuidString).pmtiles")
        try Data(repeating: 0, count: 200).write(to: url)
        #expect(throws: PMTilesReader.Failure.self) { try PMTilesReader(url: url) }
    }

    static func kept(cycle: String = "10-29-2026", expires: String? = "2026-12-24", done: [String] = ["sec@2x"]) -> OfflineKept {
        OfflineKept(region: "Chicago", name: "Chicago", cycle: cycle, expires: expires, boxes: [[-180, -85, 180, 85]],
                    wanted: ["sec@2x": Self.sample.count], done: done)
    }

    @Test func theMapReadsADownloadedTileFirstAtEitherDensity() throws {
        let store = Self.scratch()
        let kept = Self.kept(done: [])
        store.update(kept.id) { $0 = kept }
        #expect(store.tile(cycle: "10-29-2026", kind: "sec", z: 12, x: 7, y: 25, scale: 2) == nil)
        try store.finish(cycle: "10-29-2026", region: "Chicago", archive: "sec@2x", file: try Self.sampleFile())
        #expect(store.all().first?.complete == true)
        #expect(store.tile(cycle: "10-29-2026", kind: "sec", z: 12, x: 7, y: 25, scale: 2) == Data("12,7,25".utf8))
        // The 256-pixel tile asked for, the 512 one drawn in its place.
        #expect(store.tile(cycle: "10-29-2026", kind: "sec", z: 12, x: 7, y: 25, scale: 1) == Data("12,7,25".utf8))
        #expect(store.tile(cycle: "12-24-2026", kind: "sec", z: 12, x: 7, y: 25, scale: 2) == nil)
        #expect(store.tile(cycle: "10-29-2026", kind: "tac", z: 12, x: 7, y: 25, scale: 2) == nil)
        #expect(store.bytes() >= Int64(Self.sample.count))
        store.update(kept.id) { $0 = nil }
        #expect(store.all().isEmpty)
        #expect(store.tile(cycle: "10-29-2026", kind: "sec", z: 12, x: 7, y: 25, scale: 2) == nil)
    }

    @Test func anEditionExpiresAt0901ZOnTheNextOnesDay() {
        let kept = Self.kept()
        let utc = ISO8601DateFormatter()
        #expect(!kept.expired(now: utc.date(from: "2026-12-24T09:00:00Z")!))
        #expect(kept.expired(now: utc.date(from: "2026-12-24T09:01:00Z")!))
        #expect(!Self.kept(expires: nil).expired(now: .distantFuture))
    }

    @Test func anExpiredEditionGoesOnlyOnceItsUpdateIsWhole() {
        let store = Self.scratch()
        let old = Self.kept(), new = Self.kept(cycle: "12-24-2026", expires: "2027-02-18", done: [])
        store.update(old.id) { $0 = old }
        store.update(new.id) { $0 = new }
        let later = ISO8601DateFormatter().date(from: "2026-12-25T00:00:00Z")!
        store.sweep(now: later)
        // The new one still coming: the old one stays, said to be expired.
        #expect(store.all().count == 2)
        store.update(new.id) { $0?.done = ["sec@2x"] }
        store.sweep(now: later)
        #expect(store.all().map(\.cycle) == ["12-24-2026"])
    }

    @Test func sizesAreReadByArchiveNameAsDecoded() {
        #expect(DownloadsModel.camel("ifr_low@2x") == "ifrLow@2x")
        #expect(DownloadsModel.sized(["ifrLow@2x": 5, "sec": 3], "ifr_low@2x") == 5)
        #expect(DownloadsModel.sized(["sec": 3], "sec") == 3)
        #expect(DownloadsModel.sized([:], "tac") == 0)
    }

    @Test func aTapPicksTheSmallestSheetUnderIt() {
        let big = APIOfflineRegion(boxes: [[-93, 40, -84, 44]], group: "sheet", id: "Chicago", name: "Chicago", sizes: .init())
        let small = APIOfflineRegion(boxes: [[-88.5, 41.5, -87, 42.5]], group: "sheet", id: "box", name: "Box", sizes: .init())
        #expect(DownloadsMapView.sheet(at: CLLocationCoordinate2D(latitude: 42, longitude: -87.9), in: [big, small])?.id == "box")
        #expect(DownloadsMapView.sheet(at: CLLocationCoordinate2D(latitude: 43, longitude: -90), in: [big, small])?.id == "Chicago")
        #expect(DownloadsMapView.sheet(at: CLLocationCoordinate2D(latitude: 30, longitude: -90), in: [big, small]) == nil)
    }
}
